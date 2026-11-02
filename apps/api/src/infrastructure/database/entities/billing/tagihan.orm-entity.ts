import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pasien } from "../patients/pasien.orm-entity";
import { PenempatanPasien } from "../placements/penempatan-pasien.orm-entity";
import { Pengguna } from "../auth/pengguna.orm-entity";

@Entity({ name: "invoices" })
export class Tagihan {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "patient_id", type: "varchar", length: 36 })
  patientId!: string;
  @Column({ name: "placement_id", type: "varchar", length: 36, nullable: true })
  placementId?: string | null;
  @Column({ name: "bpjs_snapshot", type: "boolean" })
  bpjsSnapshot!: boolean;
  @Column({ name: "total_amount", type: "numeric", precision: 15, scale: 2 })
  totalAmount!: string;
  @Column({ name: "covered_amount", type: "numeric", precision: 15, scale: 2 })
  coveredAmount!: string;
  @Column({ name: "payable_amount", type: "numeric", precision: 15, scale: 2 })
  payableAmount!: string;
  @Column({ name: "status", type: "text" })
  status!: string;
  @Column({ name: "version", type: "integer" })
  version!: number;
  @Column({ name: "created_by", type: "varchar", length: 36 })
  createdBy!: string;
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @ManyToOne(() => Pasien, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "patient_id", referencedColumnName: "id" })
  patientIdRelation!: Pasien;
  @ManyToOne(() => PenempatanPasien, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "placement_id", referencedColumnName: "id" })
  placementIdRelation?: PenempatanPasien | null;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by", referencedColumnName: "id" })
  createdByRelation!: Pengguna;
  @Column({ name: "claim_verified", type: "boolean", default: false })
  claimVerified!: boolean;
  @Column({ name: "claim_result", type: "varchar", length: 120, nullable: true })
  claimResult?: string | null;
  @Column({ name: "claim_verified_at", type: "timestamptz", nullable: true })
  claimVerifiedAt?: Date | null;
  @Column({
    name: "claim_verified_by",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  claimVerifiedBy?: string | null;
  @ManyToOne(() => Pengguna, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "claim_verified_by", referencedColumnName: "id" })
  claimVerifiedByRelation?: Pengguna | null;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt?: Date | null;
}
