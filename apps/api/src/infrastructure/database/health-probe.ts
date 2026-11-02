import { DataSource } from "typeorm";
import { HealthProbe } from "../../application/shared/health-probe";
export class TypeOrmHealthProbe implements HealthProbe {
  constructor(private readonly database: DataSource) {}
  async check(): Promise<boolean> {
    try { await this.database.query("SELECT 1"); return true; }
    catch { return false; }
  }
}
