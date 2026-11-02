import * as argon2 from "argon2";
import { PasswordHasher } from "../../application/auth/auth.use-cases";
export class Argon2PasswordHasher implements PasswordHasher {
  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
