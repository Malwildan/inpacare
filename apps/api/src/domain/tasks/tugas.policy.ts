import { Actor } from "../auth/actor";
import { isCoordinator } from "../auth/permissions";
import { DomainError } from "../shared/domain-error";
export function assertEditableFields(actor: Actor, changes: object) {
  if (
    !isCoordinator(actor) &&
    ["title", "description", "priority", "startsAt", "endsAt"].some(
      (field) => (changes as Record<string, unknown>)[field] !== undefined,
    )
  )
    throw DomainError.forbidden();
}
