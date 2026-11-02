import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Dokter } from "../auth/dokter.orm-entity";
import { Pasien } from "../patients/pasien.orm-entity";
import { Pengguna } from "../auth/pengguna.orm-entity";

@Entity({ name: "medical_records" })
export class RekamMedis {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "patient_id", type: "varchar", length: 36 })
  patientId!: string;
  @Column({ name: "doctor_id", type: "varchar", length: 36 })
  doctorId!: string;
  @Column({ name: "complaint", type: "text" })
  complaint!: string;
  @Column({ name: "diagnosis", type: "text" })
  diagnosis!: string;
  @Column({ name: "treatment", type: "text" })
  treatment!: string;
  @Column({ name: "notes", type: "text" })
  notes!: string;
  @Column({ name: "record_date", type: "date" })
  recordDate!: string;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt?: Date | null;
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
  @Column({ name: "version", type: "integer" })
  version!: number;
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @ManyToOne(() => Pasien, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "patient_id", referencedColumnName: "id" })
  patientIdRelation!: Pasien;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "doctor_id", referencedColumnName: "id" })
  doctorIdRelation!: Pengguna;
}
