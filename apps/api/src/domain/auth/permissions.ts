import { Actor } from "./actor";
import { DomainError } from "../shared/domain-error";
export const isCoordinator = (actor: Actor) =>
  actor.role === "PERAWAT" && actor.coordinator;
export function requireCoordinator(actor: Actor) {
  if (!isCoordinator(actor)) throw DomainError.forbidden();
}
export function requireClinical(actor: Actor) {
  if (!["DOKTER", "PERAWAT"].includes(actor.role))
    throw DomainError.forbidden();
}
