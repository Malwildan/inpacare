import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pengguna } from "../auth/pengguna.orm-entity";
import { PenempatanPasien } from "./penempatan-pasien.orm-entity";

@Entity({ name: "placement_history" })
export class RiwayatPenempatan {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 }) id!: string;
  @Column({ name: "placement_id", type: "varchar", length: 36 }) placementId!: string;
  @ManyToOne(() => PenempatanPasien, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "placement_id" }) placement!: PenempatanPasien;
  @Column({ name: "actor_id", type: "varchar", length: 36 }) actorId!: string;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "actor_id" }) actor!: Pengguna;
  @Column({ name: "action", type: "text" }) action!: string;
  @Column({ name: "reason", type: "text" }) reason!: string;
  @Column({ name: "before_data", type: "jsonb" }) beforeData!: Record<string, unknown>;
  @Column({ name: "after_data", type: "jsonb" }) afterData!: Record<string, unknown>;
  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" }) createdAt!: Date;
}
