import { EntityManager } from "typeorm";
import {
  AuthStore,
  AuthenticatedUser,
  SessionActor,
} from "../../../../application/auth/auth-store.port";
export class TypeOrmAuthStore implements AuthStore {
  constructor(private readonly manager: EntityManager) {}
  async findLoginUser(
    username: string,
  ): Promise<AuthenticatedUser | undefined> {
    const [row] = await this.manager.query(
      `SELECT u.id,u.username,u.name,u.role,u.coordinator,u.password_hash AS "passwordHash" FROM users u WHERE lower(u.username)=$1 AND u.active AND (u.role<>'PERAWAT' OR EXISTS(SELECT 1 FROM nurses n WHERE n.user_id=u.id AND n.active))`,
      [username],
    );
    return row as AuthenticatedUser | undefined;
  }
  async createSession(input: {
    tokenHash: string;
    userId: string;
    csrfToken: string;
    expiresAt: Date;
    replaceTokenHash: string;
  }) {
    await this.manager.query(
      "DELETE FROM sessions WHERE expires_at<=now() OR token_hash=$1",
      [input.replaceTokenHash],
    );
    await this.manager.query(
      "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)",
      [input.tokenHash, input.userId, input.csrfToken, input.expiresAt],
    );
  }
  async deleteSession(tokenHash: string) {
    await this.manager.query("DELETE FROM sessions WHERE token_hash=$1", [
      tokenHash,
    ]);
  }
  async findSession(tokenHash: string): Promise<SessionActor | undefined> {
    const [row] = await this.manager.query(
      `SELECT u.id,u.username,u.name,u.role,u.coordinator,s.csrf_token AS "csrfToken" FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND (u.role<>'PERAWAT' OR EXISTS(SELECT 1 FROM nurses n WHERE n.user_id=u.id AND n.active))`,
      [tokenHash],
    );
    if (!row) return undefined;
    const { csrfToken, ...actor } = row;
    return { actor, csrfToken } as SessionActor;
  }
}
