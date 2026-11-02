import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Pengguna } from "./pengguna.orm-entity";

@Entity({ name: "sessions" })
export class Sesi {
  @PrimaryColumn({ name: "token_hash", type: "text" })
  tokenHash!: string;
  @Column({ name: "user_id", type: "varchar", length: 36 })
  userId!: string;
  @Column({ name: "csrf_token", type: "text" })
  csrfToken!: string;
  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;
  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @ManyToOne(() => Pengguna, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id", referencedColumnName: "id" })
  userIdRelation!: Pengguna;
}
