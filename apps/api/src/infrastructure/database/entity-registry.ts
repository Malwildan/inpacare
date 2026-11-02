import { AuditMedis } from "./entities/medical-records/audit-medis.orm-entity";
import { AuditSiklus } from "./entities/cycles/audit-siklus.orm-entity";
import { AuditAlignment1793577600002 } from "./migrations/1793577600002-AuditAlignment";
import { DataSource } from "typeorm";
import { Pengguna } from "./entities/auth/pengguna.orm-entity";
import { Dokter } from "./entities/auth/dokter.orm-entity";
import { Perawat } from "./entities/auth/perawat.orm-entity";
import { Sesi } from "./entities/auth/sesi.orm-entity";
import { Pasien } from "./entities/patients/pasien.orm-entity";
import { RuangInap } from "./entities/rooms/ruang-inap.orm-entity";
import { ItemRuangan } from "./entities/rooms/item-ruangan.orm-entity";
import { PenempatanPasien } from "./entities/placements/penempatan-pasien.orm-entity";
import { RekapPasien } from "./entities/cycles/rekap-pasien.orm-entity";
import { PermintaanSiklus } from "./entities/cycles/permintaan-siklus.orm-entity";
import { Notifikasi } from "./entities/notifications/notifikasi.orm-entity";
import { TugasPerawatan } from "./entities/tasks/tugas-perawatan.orm-entity";
import { RiwayatTugas } from "./entities/tasks/riwayat-tugas.orm-entity";
import { RekamMedis } from "./entities/medical-records/rekam-medis.orm-entity";
import { KondisiPasien } from "./entities/medical-records/kondisi-pasien.orm-entity";
import { TandaVital } from "./entities/medical-records/tanda-vital.orm-entity";
import { Tagihan } from "./entities/billing/tagihan.orm-entity";
import { DetailTagihan } from "./entities/billing/detail-tagihan.orm-entity";
import { RiwayatTagihan } from "./entities/billing/riwayat-tagihan.orm-entity";
import { Baseline1793577600000 } from "./migrations/1793577600000-Baseline";
import { RebuildDelta1793577600001 } from "./migrations/1793577600001-RebuildDelta";

export const ALL_ENTITIES = [
  AuditMedis,
  AuditSiklus,
  Pengguna,
  Dokter,
  Perawat,
  Sesi,
  Pasien,
  RuangInap,
  ItemRuangan,
  PenempatanPasien,
  RekapPasien,
  PermintaanSiklus,
  Notifikasi,
  TugasPerawatan,
  RiwayatTugas,
  RekamMedis,
  KondisiPasien,
  TandaVital,
  Tagihan,
  DetailTagihan,
  RiwayatTagihan,
] as const;
export const ALL_MIGRATIONS = [
  Baseline1793577600000,
  RebuildDelta1793577600001,
  AuditAlignment1793577600002,
];

export function createDataSource(): DataSource {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return new DataSource({
    type: "postgres",
    url,
    entities: [...ALL_ENTITIES],
    migrations: [...ALL_MIGRATIONS],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: { max: 10, connectionTimeoutMillis: 5000, statement_timeout: 15000 },
  });
}
