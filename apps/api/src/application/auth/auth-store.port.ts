import { Actor } from "../../domain/auth/actor";
export interface AuthenticatedUser extends Actor {
  passwordHash: string;
}
export interface SessionActor {
  actor: Actor;
  csrfToken: string;
}
export interface AuthStore {
  findLoginUser(username: string): Promise<AuthenticatedUser | undefined>;
  createSession(input: {
    tokenHash: string;
    userId: string;
    csrfToken: string;
    expiresAt: Date;
    replaceTokenHash: string;
  }): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  findSession(tokenHash: string): Promise<SessionActor | undefined>;
}
