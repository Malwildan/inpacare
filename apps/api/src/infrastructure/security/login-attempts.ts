import { DomainError } from "../../domain/shared/domain-error";
export class LoginAttempts {
  private readonly sources = new Map<
    string,
    {
      at: number;
      count: number;
      accounts: Map<string, number>;
    }
  >();
  consume(source: string, username: string, now = Date.now()) {
    for (const [key, value] of this.sources) {
      if (now - value.at >= 900000) this.sources.delete(key);
    }
    let bucket = this.sources.get(source);
    if (!bucket) {
      // Evict an old source instead of turning bounded storage into a global login lockout.
      if (this.sources.size >= 1000)
        this.sources.delete(this.sources.keys().next().value!);
      bucket = { at: now, count: 0, accounts: new Map() };
      this.sources.set(source, bucket);
    }
    const failures = bucket.accounts.get(username) || 0;
    if (failures >= 10 || bucket.count >= 100)
      throw new DomainError(
        "RATE_LIMITED",
        "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
      );
    bucket.count++;
    bucket.accounts.set(username, failures + 1);
  }
  success(source: string, username: string) {
    this.sources.get(source)?.accounts.delete(username);
  }
}
