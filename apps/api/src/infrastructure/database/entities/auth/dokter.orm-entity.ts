import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pengguna } from "./pengguna.orm-entity";

@Entity({ name: "doctors" })
export class Dokter {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "user_id", type: "varchar", length: 36 })
  userId!: string;
  @Column({ name: "specialty", type: "text" })
  specialty!: string;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id", referencedColumnName: "id" })
  userIdRelation!: Pengguna;
  @Column({ name: "name", type: "text", nullable: true })
  name?: string | null;
}
