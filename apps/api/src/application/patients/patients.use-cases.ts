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
      throw DomainError.validation("Isi Nama lengkap dengan maksimal 200 karakter.");
    const birth = new Date(`${input.birthDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) || !Number.isFinite(birth.getTime()) ||
        birth.toISOString().slice(0, 10) !== input.birthDate || input.birthDate > today())
      throw DomainError.validation("Tanggal lahir tidak valid atau setelah hari ini. Pilih tanggal lahir yang benar pada kalender.");
    if (!["L", "P"].includes(input.gender) || typeof input.bpjs !== "boolean" || (address?.length ?? 0) > 1000)
      throw DomainError.validation("Periksa Jenis kelamin, pilihan Peserta BPJS, dan Alamat. Alamat dapat memuat maksimal 1.000 karakter.");
    if ((input.bpjs && !/^\d{13}$/.test(bpjsNumber ?? "")) || (!input.bpjs && bpjsNumber))
      throw DomainError.validation("Isi Nomor BPJS dengan 13 digit jika pasien peserta BPJS. Kosongkan jika pasien bukan peserta BPJS.");
    return this.store.create({
      id: id(), name, birthDate: input.birthDate,
      gender: input.gender, bpjs: input.bpjs, bpjsNumber, address,
    });
  }
}
