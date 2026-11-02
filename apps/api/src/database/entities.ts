import { AuditMedis } from "../modules/medical-records/entities/audit-medis.entity";
import { DataSource } from "typeorm";
import { Pengguna } from "../modules/auth/entities/pengguna.entity";
import { Dokter } from "../modules/auth/entities/dokter.entity";
import { Perawat } from "../modules/auth/entities/perawat.entity";
import { Sesi } from "../modules/auth/entities/sesi.entity";
import { Pasien } from "../modules/patients/entities/pasien.entity";
import { RuangInap } from "../modules/rooms/entities/ruang-inap.entity";
import { ItemRuangan } from "../modules/rooms/entities/item-ruangan.entity";
import { PenempatanPasien } from "../modules/placements/entities/penempatan-pasien.entity";
import { RekapPasien } from "../modules/cycles/entities/rekap-pasien.entity";
import { PermintaanSiklus } from "../modules/cycles/entities/permintaan-siklus.entity";
import { Notifikasi } from "../modules/notifications/entities/notifikasi.entity";
import { TugasPerawatan } from "../modules/tasks/entities/tugas-perawatan.entity";
import { RiwayatTugas } from "../modules/tasks/entities/riwayat-tugas.entity";
import { RekamMedis } from "../modules/medical-records/entities/rekam-medis.entity";
import { KondisiPasien } from "../modules/medical-records/entities/kondisi-pasien.entity";
import { TandaVital } from "../modules/medical-records/entities/tanda-vital.entity";
import { Tagihan } from "../modules/billing/entities/tagihan.entity";
import { DetailTagihan } from "../modules/billing/entities/detail-tagihan.entity";
import { RiwayatTagihan } from "../modules/billing/entities/riwayat-tagihan.entity";
import { Baseline1793577600000 } from "./migrations/1793577600000-Baseline";
import { RebuildDelta1793577600001 } from "./migrations/1793577600001-RebuildDelta";

export const ALL_ENTITIES = [
  AuditMedis,
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
