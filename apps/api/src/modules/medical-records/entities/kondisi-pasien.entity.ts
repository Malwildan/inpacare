import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Perawat } from "../../auth/entities/perawat.entity";
import { RekamMedis } from "./rekam-medis.entity";
import { Pengguna } from "../../auth/entities/pengguna.entity";

@Entity({ name: "observations" })
export class KondisiPasien {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "record_id", type: "varchar", length: 36 })
  recordId!: string;
  @Column({ name: "nurse_id", type: "varchar", length: 36 })
  nurseId!: string;
  @Column({ name: "symptoms", type: "text" })
  symptoms!: string;
  @Column({ name: "nursing_note", type: "text" })
  nursingNote!: string;
  @Column({ name: "observed_at", type: "timestamptz" })
  observedAt!: Date;
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @ManyToOne(() => RekamMedis, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "record_id", referencedColumnName: "id" })
  recordIdRelation!: RekamMedis;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "nurse_id", referencedColumnName: "id" })
  nurseIdRelation!: Pengguna;
  @Column({ name: "version", type: "integer", default: 1 })
  version!: number;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt?: Date | null;
  @Column({ name: "updated_at", type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
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
}
