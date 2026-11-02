import Decimal from "decimal.js";
import { DomainError } from "../shared/domain-error";
export function validateRoomText(name: string, roomClass: string) {
  if (!name.trim() || !roomClass.trim())
    throw DomainError.validation("Nama dan tipe ruangan wajib diisi.");
}
export function validateRoomItem(name: string, category: string) {
  if (!name.trim() || !category.trim())
    throw DomainError.validation("Nama dan kategori item wajib diisi.");
}
export function validateRoomCost(value: string) {
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(value))
    throw DomainError.validation("Nilai biaya ruangan tidak valid.");
}

const RoomDecimal = Decimal.clone({
  precision: 32,
  rounding: Decimal.ROUND_HALF_UP,
});
export function calculateRoomCost(
  items: ReadonlyArray<{ quantity: number; unitPrice: string }>,
): string {
  // Preserve the legacy empty-room representation; persisted item prices have two decimal places.
  if (!items.length) return "0";
  return items
    .reduce(
      (total, item) =>
        total.plus(new RoomDecimal(item.unitPrice).mul(item.quantity)),
      new RoomDecimal(0),
    )
    .toFixed(2);
}
