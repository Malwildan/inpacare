import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pengguna } from "./pengguna.entity";

@Entity({ name: "nurses" })
export class Perawat {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "user_id", type: "varchar", length: 36 })
  userId!: string;
  @Column({ name: "active", type: "boolean" })
  active!: boolean;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id", referencedColumnName: "id" })
  userIdRelation!: Pengguna;
  @Column({ name: "name", type: "text", nullable: true })
  name?: string | null;
  @Column({ name: "unit", type: "text", nullable: true })
  unit?: string | null;
}
