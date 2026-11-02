import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DomainError } from "../../../domain/shared/domain-error";
import { AuthUseCases } from "../../../application/auth/auth.use-cases";
import {
  ActorRequest,
  checkOrigin,
  cookie,
  equalToken,
  Role,
} from "../security/auth-context";
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthUseCases,
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
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw DomainError.unauthorized();
    const { actor, csrfToken } = await this.auth.resolveSession(token);
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      checkOrigin(req);
      if (!equalToken(req.get("x-csrf-token") || "", csrfToken))
        throw DomainError.forbidden();
    }
    const roles = this.reflector.getAllAndOverride<Role[]>("roles", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(actor.role)) throw DomainError.forbidden();
    req.actor = { ...actor, csrfToken };
    return true;
  }
}
