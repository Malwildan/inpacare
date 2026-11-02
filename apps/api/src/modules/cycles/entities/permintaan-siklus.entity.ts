import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { RekapPasien } from "./rekap-pasien.entity";
import { Pengguna } from "../../auth/entities/pengguna.entity";

@Entity({ name: "cycle_requests" })
export class PermintaanSiklus {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "cycle_id", type: "varchar", length: 36 })
  cycleId!: string;
  @Column({ name: "kind", type: "text" })
  kind!: string;
  @Column({ name: "requested_end", type: "date", nullable: true })
  requestedEnd?: string | null;
  @Column({ name: "reason", type: "text" })
  reason!: string;
  @Column({ name: "requested_by", type: "varchar", length: 36 })
  requestedBy!: string;
  @Column({ name: "status", type: "text" })
  status!: string;
  @Column({ name: "decided_by", type: "varchar", length: 36, nullable: true })
  decidedBy?: string | null;
  @Column({ name: "decision_note", type: "text", nullable: true })
  decisionNote?: string | null;
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @Column({ name: "decided_at", type: "timestamptz", nullable: true })
  decidedAt?: Date | null;
  @ManyToOne(() => RekapPasien, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cycle_id", referencedColumnName: "id" })
  cycleIdRelation!: RekapPasien;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "requested_by", referencedColumnName: "id" })
  requestedByRelation!: Pengguna;
  @ManyToOne(() => Pengguna, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "decided_by", referencedColumnName: "id" })
  decidedByRelation?: Pengguna | null;
  @Column({ name: "previous_status", type: "text", nullable: true })
  previousStatus?: string | null;
}
