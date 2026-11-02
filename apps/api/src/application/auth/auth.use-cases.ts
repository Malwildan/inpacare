import { Actor } from "../../domain/auth/actor";
import { DomainError } from "../../domain/shared/domain-error";
import { UnitOfWork } from "../shared/unit-of-work.port";
import { AuthStore, SessionActor } from "./auth-store.port";
export interface PasswordHasher {
  verify(hash: string, password: string): Promise<boolean>;
}
export interface SessionTokens {
  create(): {
    token: string;
    csrfToken: string;
  };
  digest(token: string): string;
}
export interface LoginAttemptLimiter {
  consume(source: string, username: string): void;
  success(source: string, username: string): void;
}
const FALLBACK_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$bm9uZXhpc3RlbnR1c2Vy$+fGzg8LZDE67pwDt2me6EG3HEdcG5lKVLbAzvvB1vzI";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
export class AuthUseCases {
  constructor(
    private readonly store: AuthStore,
    private readonly uow: UnitOfWork,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: SessionTokens,
    private readonly attempts: LoginAttemptLimiter,
  ) {}
  async login(input: {
    username: string;
    password: string;
    source: string;
    currentToken?: string;
  }): Promise<{
    user: Actor & {
      csrfToken: string;
    };
    token: string;
    maxAge: number;
  }> {
    const username = input.username.trim().toLowerCase();
    if (!username) throw DomainError.validation("ID petugas wajib diisi.");
    this.attempts.consume(input.source, username);
    const user = await this.store.findLoginUser(username);
    const valid = await this.passwordHasher
      .verify(user?.passwordHash ?? FALLBACK_HASH, input.password)
      .catch(() => false);
    if (!valid || !user)
      throw new DomainError(
        "INVALID_CREDENTIALS",
        "ID petugas atau kata sandi tidak sesuai.",
      );
    this.attempts.success(input.source, username);
    const { token, csrfToken } = this.tokens.create();
    const maxAge = SESSION_SECONDS;
    await this.uow.run((tx) =>
      tx.auth.createSession({
        tokenHash: this.tokens.digest(token),
        userId: user.id,
        csrfToken,
        expiresAt: new Date(Date.now() + maxAge * 1000),
        replaceTokenHash: this.tokens.digest(input.currentToken ?? ""),
      }),
    );
    const { passwordHash: _passwordHash, ...actor } = user;
    return { user: { ...actor, csrfToken }, token, maxAge };
  }
  async logout(token?: string): Promise<void> {
    await this.store.deleteSession(this.tokens.digest(token ?? ""));
  }
  async resolveSession(token: string): Promise<SessionActor> {
    const session = await this.store.findSession(this.tokens.digest(token));
    if (!session) throw DomainError.unauthorized();
    return session;
  }
}
