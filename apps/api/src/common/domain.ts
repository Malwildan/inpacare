import { randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { Actor } from "./auth";
import { AppError } from "./errors";
export const id = () => randomUUID();
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function requireCoordinator(actor: Actor) {
  if (actor.role !== "PERAWAT" || !actor.coordinator)
    throw AppError.forbidden();
}
export function requireClinical(actor: Actor) {
  if (!["DOKTER", "PERAWAT"].includes(actor.role)) throw AppError.forbidden();
}
export async function canReadPatient(
  manager: EntityManager,
  actor: Actor,
  patientId: string,
) {
  const [row] = await manager.query(
    `SELECT EXISTS(SELECT 1 FROM patients p WHERE p.id=$1 AND ($2<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.id AND c.doctor_id=$3))) AS allowed`,
    [patientId, actor.role, actor.id],
  );
  if (!row?.allowed) throw AppError.notFound();
}
