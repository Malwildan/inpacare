import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Perawat } from "../auth/perawat.orm-entity";
import { Pasien } from "../patients/pasien.orm-entity";
import { RuangInap } from "../rooms/ruang-inap.orm-entity";
import { PenempatanPasien } from "../placements/penempatan-pasien.orm-entity";
import { Pengguna } from "../auth/pengguna.orm-entity";

@Entity({ name: "tasks" })
export class TugasPerawatan {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "patient_id", type: "varchar", length: 36 })
  patientId!: string;
  @Column({ name: "room_id", type: "varchar", length: 36 })
  roomId!: string;
  @Column({ name: "placement_id", type: "varchar", length: 36 })
  placementId!: string;
  @Column({ name: "pic_id", type: "varchar", length: 36 })
  picId!: string;
  @Column({ name: "created_by", type: "varchar", length: 36 })
  createdBy!: string;
  @Column({ name: "title", type: "text" })
  title!: string;
  @Column({ name: "description", type: "text" })
  description!: string;
  @Column({ name: "notes", type: "text" })
  notes!: string;
  @Column({ name: "starts_at", type: "timestamptz" })
  startsAt!: Date;
  @Column({ name: "ends_at", type: "timestamptz" })
  endsAt!: Date;
  @Column({ name: "priority", type: "text" })
  priority!: string;
  @Column({ name: "status", type: "text" })
  status!: string;
  @Column({ name: "pic_nurse_id", type: "varchar", length: 36, nullable: true })
  picNurseId?: string | null;
  @ManyToOne(() => Perawat, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "pic_nurse_id", referencedColumnName: "id" })
  picNurse?: Perawat | null;
  @Column({ name: "version", type: "integer" })
  version!: number;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt?: Date | null;
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @ManyToOne(() => Pasien, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "patient_id", referencedColumnName: "id" })
  patientIdRelation!: Pasien;
  @ManyToOne(() => RuangInap, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "room_id", referencedColumnName: "id" })
  roomIdRelation!: RuangInap;
  @ManyToOne(() => PenempatanPasien, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "placement_id", referencedColumnName: "id" })
  placementIdRelation!: PenempatanPasien;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "pic_id", referencedColumnName: "id" })
  picIdRelation!: Pengguna;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by", referencedColumnName: "id" })
  createdByRelation!: Pengguna;
}
