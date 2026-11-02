import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pasien } from "../../patients/entities/pasien.entity";
import { RuangInap } from "../../rooms/entities/ruang-inap.entity";
import { Pengguna } from "../../auth/entities/pengguna.entity";

@Entity({ name: "placements" })
export class PenempatanPasien {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "patient_id", type: "varchar", length: 36 })
  patientId!: string;
  @Column({ name: "room_id", type: "varchar", length: 36 })
  roomId!: string;
  @Column({ name: "starts_on", type: "date" })
  startsOn!: string;
  @Column({ name: "ends_on", type: "date" })
  endsOn!: string;
  @Column({ name: "status", type: "text" })
  status!: string;
  @Column({ name: "version", type: "integer" })
  version!: number;
  @Column({ name: "created_by", type: "varchar", length: 36 })
  createdBy!: string;
  @ManyToOne(() => Pasien, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "patient_id", referencedColumnName: "id" })
  patientIdRelation!: Pasien;
  @ManyToOne(() => RuangInap, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "room_id", referencedColumnName: "id" })
  roomIdRelation!: RuangInap;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by", referencedColumnName: "id" })
  createdByRelation!: Pengguna;
}
