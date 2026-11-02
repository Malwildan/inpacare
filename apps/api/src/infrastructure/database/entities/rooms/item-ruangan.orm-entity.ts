import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { RuangInap } from "./ruang-inap.orm-entity";

@Entity({ name: "room_items" })
export class ItemRuangan {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "room_id", type: "varchar", length: 36 })
  roomId!: string;
  @Column({ name: "name", type: "text" })
  name!: string;
  @Column({ name: "category", type: "text" })
  category!: string;
  @Column({ name: "quantity", type: "integer" })
  quantity!: number;
  @Column({ name: "unit_price", type: "numeric", precision: 15, scale: 2 })
  unitPrice!: string;
  @ManyToOne(() => RuangInap, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "room_id", referencedColumnName: "id" })
  roomIdRelation!: RuangInap;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt?: Date | null;
}
