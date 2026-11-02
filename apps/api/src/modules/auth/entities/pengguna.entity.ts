import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity({ name: "users" })
export class Pengguna {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "username", type: "text" })
  username!: string;
  @Column({ name: "name", type: "text" })
  name!: string;
  @Column({ name: "role", type: "text" })
  role!: string;
  @Column({ name: "coordinator", type: "boolean" })
  coordinator!: boolean;
  @Column({ name: "password_hash", type: "text" })
  private storedPasswordHash!: string;
  get passwordHash(): string {
    return this.storedPasswordHash;
  }
  set passwordHash(value: string) {
    this.storedPasswordHash = value;
  }
  @Column({ name: "active", type: "boolean" })
  active!: boolean;
}
