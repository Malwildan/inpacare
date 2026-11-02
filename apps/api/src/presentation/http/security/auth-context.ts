import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { Request } from "express";
import { Actor, Role } from "../../../domain/auth/actor";
import { DomainError } from "../../../domain/shared/domain-error";
export { Actor, Role };
export type HttpActor = Actor & {
  csrfToken: string;
};
export type ActorRequest = Request & {
  actor: HttpActor;
};
export const Public = () => SetMetadata("public", true);
export const Roles = (...roles: Role[]) => SetMetadata("roles", roles);
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): HttpActor =>
    ctx.switchToHttp().getRequest<ActorRequest>().actor,
);
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
    throw DomainError.forbidden();
}
export function equalToken(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
