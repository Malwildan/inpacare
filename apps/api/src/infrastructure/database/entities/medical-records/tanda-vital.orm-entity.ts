import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { KondisiPasien } from "./kondisi-pasien.orm-entity";

@Entity({ name: "vital_signs" })
export class TandaVital {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "observation_id", type: "varchar", length: 36 })
  observationId!: string;
  @Column({
    name: "temperature",
    type: "numeric",
    nullable: true,
    precision: 5,
    scale: 2,
  })
  temperature?: string | null;
  @Column({ name: "systolic", type: "integer", nullable: true })
  systolic?: number | null;
  @Column({ name: "diastolic", type: "integer", nullable: true })
  diastolic?: number | null;
  @Column({ name: "pulse", type: "integer", nullable: true })
  pulse?: number | null;
  @Column({ name: "respiratory_rate", type: "integer", nullable: true })
  respiratoryRate?: number | null;
  @Column({
    name: "spo2",
    type: "numeric",
    nullable: true,
    precision: 5,
    scale: 2,
  })
  spo2?: string | null;
  @ManyToOne(() => KondisiPasien, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "observation_id", referencedColumnName: "id" })
  observationIdRelation!: KondisiPasien;
  @Column({ name: "version", type: "integer", default: 1 })
  version!: number;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt?: Date | null;
}
