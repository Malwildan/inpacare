import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pengguna } from "../../auth/entities/pengguna.entity";
import { Perawat } from "../../auth/entities/perawat.entity";

@Entity({ name: "rooms" })
export class RuangInap {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "name", type: "text" })
  name!: string;
  @Column({ name: "room_class", type: "text" })
  roomClass!: string;
  @Column({ name: "capacity", type: "integer" })
  capacity!: number;
  @Column({ name: "status", type: "text" })
  status!: string;
  @Column({ name: "pic_id", type: "varchar", length: 36, nullable: true })
  picId?: string | null;
  @Column({ name: "daily_rate", type: "numeric", precision: 15, scale: 2 })
  dailyRate!: string;
  @Column({ name: "version", type: "integer" })
  version!: number;
  @ManyToOne(() => Pengguna, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "pic_id", referencedColumnName: "id" })
  picIdRelation?: Pengguna | null;
  @Column({ name: "pic_nurse_id", type: "varchar", length: 36, nullable: true })
  picNurseId?: string | null;
  @ManyToOne(() => Perawat, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "pic_nurse_id", referencedColumnName: "id" })
  picNurse?: Perawat | null;
  @Column({ name: "metadata", type: "jsonb", default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;
  @Column({ name: "created_at", type: "timestamptz", nullable: true })
  createdAt?: Date | null;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt?: Date | null;
}
