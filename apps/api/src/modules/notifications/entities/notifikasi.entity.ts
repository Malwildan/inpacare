import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pengguna } from "../../auth/entities/pengguna.entity";
import { RekapPasien } from "../../cycles/entities/rekap-pasien.entity";

@Entity({ name: "notifications" })
export class Notifikasi {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "user_id", type: "varchar", length: 36 })
  userId!: string;
  @Column({ name: "cycle_id", type: "varchar", length: 36, nullable: true })
  cycleId?: string | null;
  @Column({ name: "message", type: "text" })
  message!: string;
  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt?: Date | null;
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id", referencedColumnName: "id" })
  userIdRelation!: Pengguna;
  @ManyToOne(() => RekapPasien, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cycle_id", referencedColumnName: "id" })
  cycleIdRelation?: RekapPasien | null;
}
