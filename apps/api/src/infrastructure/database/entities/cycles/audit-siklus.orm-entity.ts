import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pengguna } from "../auth/pengguna.orm-entity";
import { RekapPasien } from "./rekap-pasien.orm-entity";

@Entity({ name: "cycle_history" })
export class AuditSiklus {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 }) id!: string;
  @Column({ name: "cycle_id", type: "varchar", length: 36 }) cycleId!: string;
  @ManyToOne(() => RekapPasien, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cycle_id" }) cycle!: RekapPasien;
  @Column({ name: "actor_id", type: "varchar", length: 36 }) actorId!: string;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "actor_id" }) actor!: Pengguna;
  @Column({ name: "action", type: "text" }) action!: string;
  @Column({ name: "reason", type: "text" }) reason!: string;
  @Column({ name: "before_data", type: "jsonb" }) beforeData!: Record<string, unknown>;
  @Column({ name: "after_data", type: "jsonb" }) afterData!: Record<string, unknown>;
  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" }) createdAt!: Date;
}
