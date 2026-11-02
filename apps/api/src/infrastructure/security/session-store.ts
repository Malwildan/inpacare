import { createHash, randomBytes } from "node:crypto";
import { SessionTokens } from "../../application/auth/auth.use-cases";
export class OpaqueSessionTokens implements SessionTokens {
  create() {
    return {
      token: randomBytes(32).toString("hex"),
      csrfToken: randomBytes(32).toString("hex"),
    };
  }
  digest(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
