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
