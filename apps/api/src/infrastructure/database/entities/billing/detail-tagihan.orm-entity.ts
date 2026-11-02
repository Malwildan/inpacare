import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Tagihan } from "./tagihan.orm-entity";
import { ItemRuangan } from "../rooms/item-ruangan.orm-entity";

@Entity({ name: "invoice_lines" })
export class DetailTagihan {
  @PrimaryColumn({ name: "id", type: "varchar", length: 36 })
  id!: string;
  @Column({ name: "invoice_id", type: "varchar", length: 36 })
  invoiceId!: string;
  @Column({ name: "description", type: "text" })
  description!: string;
  @Column({ name: "quantity", type: "integer" })
  quantity!: number;
  @Column({ name: "unit_price", type: "numeric", precision: 15, scale: 2 })
  unitPrice!: string;
  @Column({ name: "line_total", type: "numeric", precision: 15, scale: 2 })
  lineTotal!: string;
  @ManyToOne(() => ItemRuangan, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "room_item_id", referencedColumnName: "id" })
  roomItemRelation?: ItemRuangan | null;
  @ManyToOne(() => Tagihan, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoice_id", referencedColumnName: "id" })
  invoiceIdRelation!: Tagihan;
  @Column({ name: "room_item_id", type: "varchar", length: 36, nullable: true })
  roomItemId?: string | null;
  @Column({ name: "kind", type: "text", nullable: true })
  kind?: string | null;
}
