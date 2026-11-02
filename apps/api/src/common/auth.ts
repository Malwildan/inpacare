import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DataSource } from "typeorm";
import { createHash, timingSafeEqual } from "node:crypto";
import { Request } from "express";
import { AppError } from "./errors";

export type Role = "DOKTER" | "PERAWAT" | "ADMISI";
export interface Actor {
  id: string;
  username: string;
  name: string;
  role: Role;
  coordinator: boolean;
  csrfToken: string;
}
export type ActorRequest = Request & { actor: Actor };
export const Public = () => SetMetadata("public", true);
export const Roles = (...roles: Role[]) => SetMetadata("roles", roles);
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor =>
    ctx.switchToHttp().getRequest<ActorRequest>().actor,
);
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function cookie(req: Request, name: string): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function trustedOrigins(): string[] {
  const values = (
    process.env.TRUSTED_ORIGINS ||
    "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8080"
  )
    .split(",")
    .map((v) => v.trim());
  if (
    !values.length ||
    values.some((v) => {
      const url = new URL(v);
      return !["http:", "https:"].includes(url.protocol) || url.origin !== v;
    })
  )
    throw new Error("TRUSTED_ORIGINS must contain exact HTTP(S) origins");
  return values;
}
export function checkOrigin(req: Request) {
  if (!req.headers.origin || !trustedOrigins().includes(req.headers.origin))
    throw AppError.forbidden();
}
export function equalToken(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly db: DataSource,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest<ActorRequest>();
    const token = cookie(req, "session");
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw AppError.unauthorized();
    const [actor] = (await this.db.query(
      `SELECT u.id,u.username,u.name,u.role,u.coordinator,s.csrf_token AS "csrfToken"
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active
      AND (u.role<>'PERAWAT' OR EXISTS(SELECT 1 FROM nurses n WHERE n.user_id=u.id AND n.active))`,
      [digest(token)],
    )) as Actor[];
    if (!actor) throw AppError.unauthorized();
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      checkOrigin(req);
      if (!equalToken(req.get("x-csrf-token") || "", actor.csrfToken))
        throw AppError.forbidden();
    }
    const roles = this.reflector.getAllAndOverride<Role[]>("roles", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(actor.role)) throw AppError.forbidden();
    req.actor = actor;
    return true;
  }
}
