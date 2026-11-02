import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity({ name: "patients" })
export class Pasien {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "medical_record_no", type: "text" })
  medicalRecordNo!: string;
  @Column({ name: "name", type: "text" })
  name!: string;
  @Column({ name: "birth_date", type: "date" })
  birthDate!: string;
  @Column({ name: "gender", type: "text" })
  gender!: string;
  @Column({ name: "bpjs", type: "boolean" })
  bpjs!: boolean;
  @Column({ name: "bpjs_number", type: "text", nullable: true })
  bpjsNumber?: string | null;
  @Column({ name: "address", type: "text", nullable: true })
  address?: string | null;
  @Column({ name: "status", type: "text", nullable: true })
  status?: string | null;
}
