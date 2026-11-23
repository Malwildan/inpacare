import { Actor } from "../../domain/auth/actor";
import { hasCompleteBloodPressure } from "../../domain/medical-records/vital-signs";
import { DomainError } from "../../domain/shared/domain-error";
import { id } from "../shared/runtime";
import { MedicalRecordStore } from "./medical-record-store.port";

export interface ObservationInput {
  symptoms: string;
  nursingNote?: string;
  observedAt: string;
  temperature?: number;
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  respiratoryRate?: number;
  spo2?: number;
}

export function validateObservation(input: ObservationInput) {
  if (!input.symptoms.trim())
    throw DomainError.validation("Isi Gejala sebelum menyimpan observasi.");
  if (
    !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.observedAt)
  )
    throw DomainError.validation("Waktu pemeriksaan tidak valid. Periksa tanggal, jam, dan zona waktu pemeriksaan.");
  if (!hasCompleteBloodPressure(input.systolic, input.diastolic))
    throw DomainError.validation(
      "Tekanan darah belum lengkap. Isi Sistolik dan Diastolik dalam mmHg, atau kosongkan keduanya.",
    );
}

export async function saveObservation(
  store: MedicalRecordStore,
  actor: Actor,
  scope: { cycleId: string; patientId: string },
  input: ObservationInput,
  source?: { recordId: string } | { taskId: string; completionHash: string },
) {
  const observationId = id();
  const observation = {
    ...scope,
    id: observationId,
    nurseId: actor.id,
    symptoms: input.symptoms.trim(),
    nursingNote: input.nursingNote?.trim() ?? "",
    observedAt: input.observedAt,
  };
  const task = source && "taskId" in source ? source : undefined;
  await store.createObservation({ ...observation, ...task });
  const vitals = {
    temperature: input.temperature ?? null,
    systolic: input.systolic ?? null,
    diastolic: input.diastolic ?? null,
    pulse: input.pulse ?? null,
    respiratoryRate: input.respiratoryRate ?? null,
    spo2: input.spo2 ?? null,
  };
  if (Object.values(vitals).some((value) => value !== null)) {
    await store.createVitals({ id: id(), observationId, ...vitals });
  }
  await store.createRecordHistory({
    id: id(),
    entityId: observationId,
    actorId: actor.id,
    action: "created",
    reason: "Observasi dicatat",
    after: { ...scope, recordId: source && "recordId" in source ? source.recordId : undefined, taskId: task?.taskId, observedAt: observation.observedAt },
    entityType: "observation",
  });
  return observationId;
}
