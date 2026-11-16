import { Actor } from "../../domain/auth/actor";
import { DomainError } from "../../domain/shared/domain-error";
import { id, today } from "../shared/runtime";
import { CreatePatientInput, PatientStore } from "./patient-store.port";

export class PatientsUseCases {
  constructor(private readonly store: PatientStore) {}

  async create(actor: Actor, input: CreatePatientInput) {
    if (actor.role !== "ADMISI") throw DomainError.forbidden();
    const name = input.name.trim();
    const address = input.address?.trim() || null;
    const bpjsNumber = input.bpjsNumber?.trim() || null;
    if (!name || name.length > 200)
      throw DomainError.validation("Nama pasien wajib diisi dan tidak boleh lebih dari 200 karakter.");
    const birth = new Date(`${input.birthDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) || !Number.isFinite(birth.getTime()) ||
        birth.toISOString().slice(0, 10) !== input.birthDate || input.birthDate > today())
      throw DomainError.validation("Tanggal lahir harus valid dan tidak boleh melewati hari ini.");
    if (!["L", "P"].includes(input.gender) || typeof input.bpjs !== "boolean" || (address?.length ?? 0) > 1000)
      throw DomainError.validation("Data identitas pasien tidak valid.");
    if ((input.bpjs && !/^\d{13}$/.test(bpjsNumber ?? "")) || (!input.bpjs && bpjsNumber))
      throw DomainError.validation("Nomor BPJS harus berisi 13 digit untuk pasien peserta BPJS.");
    return this.store.create({
      id: id(), name, birthDate: input.birthDate,
      gender: input.gender, bpjs: input.bpjs, bpjsNumber, address,
    });
  }
}
