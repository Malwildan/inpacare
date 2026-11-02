import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Tagihan } from "./tagihan.orm-entity";
import { Pengguna } from "../auth/pengguna.orm-entity";

@Entity({ name: "invoice_history" })
export class RiwayatTagihan {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "invoice_id", type: "varchar", length: 36 })
  invoiceId!: string;
  @Column({ name: "actor_id", type: "varchar", length: 36 })
  actorId!: string;
  @Column({ name: "action", type: "text" })
  action!: string;
  @Column({ name: "reason", type: "text" })
  reason!: string;
  @Column({ name: "before_data", type: "jsonb", nullable: true })
  beforeData?: Record<string, unknown> | null;
  @Column({ name: "after_data", type: "jsonb" })
  afterData!: Record<string, unknown>;
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @ManyToOne(() => Tagihan, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_id", referencedColumnName: "id" })
  invoiceIdRelation!: Tagihan;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "actor_id", referencedColumnName: "id" })
  actorIdRelation!: Pengguna;
}
