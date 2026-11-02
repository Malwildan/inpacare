import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { TugasPerawatan } from "./tugas-perawatan.entity";
import { Pengguna } from "../../auth/entities/pengguna.entity";

@Entity({ name: "task_history" })
export class RiwayatTugas {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "task_id", type: "varchar", length: 36 })
  taskId!: string;
  @Column({ name: "actor_id", type: "varchar", length: 36 })
  actorId!: string;
  @Column({ name: "action", type: "text" })
  action!: string;
  @Column({ name: "reason", type: "text", nullable: true })
  reason?: string | null;
  @Column({ name: "before_data", type: "jsonb", nullable: true })
  beforeData?: Record<string, unknown> | null;
  @Column({ name: "after_data", type: "jsonb" })
  afterData!: Record<string, unknown>;
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @ManyToOne(() => TugasPerawatan, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "task_id", referencedColumnName: "id" })
  taskIdRelation!: TugasPerawatan;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "actor_id", referencedColumnName: "id" })
  actorIdRelation!: Pengguna;
}
