import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pasien } from "../../patients/entities/pasien.entity";
import { PenempatanPasien } from "../../placements/entities/penempatan-pasien.entity";
import { Pengguna } from "../../auth/entities/pengguna.entity";
import { Dokter } from "../../auth/entities/dokter.entity";
import { Perawat } from "../../auth/entities/perawat.entity";

@Entity({ name: "cycles" })
export class RekapPasien {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "patient_id", type: "varchar", length: 36 })
  patientId!: string;
  @Column({ name: "placement_id", type: "varchar", length: 36, nullable: true })
  placementId?: string | null;
  @Column({ name: "doctor_id", type: "varchar", length: 36 })
  doctorId!: string;
  @Column({ name: "nurse_id", type: "varchar", length: 36 })
  nurseId!: string;
  @Column({ name: "status", type: "text" })
  status!: string;
  @Column({ name: "version", type: "integer" })
  version!: number;
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
  @JoinColumn({ name: "doctor_id", referencedColumnName: "id" })
  doctorIdRelation!: Pengguna;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "nurse_id", referencedColumnName: "id" })
  nurseIdRelation!: Pengguna;
  @Column({
    name: "doctor_profile_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  doctorProfileId?: string | null;
  @ManyToOne(() => Dokter, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "doctor_profile_id", referencedColumnName: "id" })
  doctorProfile?: Dokter | null;
  @Column({
    name: "nurse_profile_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  nurseProfileId?: string | null;
  @ManyToOne(() => Perawat, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "nurse_profile_id", referencedColumnName: "id" })
  nurseProfile?: Perawat | null;
  @Column({ name: "cycle_date", type: "date", nullable: true })
  cycleDate?: string | null;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt?: Date | null;
}
