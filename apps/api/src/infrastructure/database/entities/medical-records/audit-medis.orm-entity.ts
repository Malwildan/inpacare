import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pengguna } from "../auth/pengguna.orm-entity";

@Entity({ name: "medical_history" })
export class AuditMedis {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 }) id!: string;
  @Column({ name: "entity_type", type: "text" }) entityType!: string;
  @Column({ name: "entity_id", type: "varchar", length: 36 }) entityId!: string;
  @Column({ name: "actor_id", type: "varchar", length: 36 }) actorId!: string;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "actor_id" })
  actor!: Pengguna;
  @Column({ name: "action", type: "text" }) action!: string;
  @Column({ name: "before_data", type: "jsonb", nullable: true })
  beforeData?: Record<string, unknown> | null;
  @Column({ name: "after_data", type: "jsonb" }) afterData!: Record<
    string,
    unknown
  >;
  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
  @Column({ name: "reason", type: "text", nullable: true })
  reason?: string | null;
}
