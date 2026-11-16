import { EntityManager } from "typeorm";
import { CreatePatientInput, PatientStore } from "../../../../application/patients/patient-store.port";
import { PatientSummary } from "../../../../application/reference/reference-store.port";
import { DomainError } from "../../../../domain/shared/domain-error";

export class TypeOrmPatientStore implements PatientStore {
  constructor(private readonly manager: EntityManager) {}

  async create(patient: CreatePatientInput & { id: string }): Promise<PatientSummary> {
    try {
      const [row] = await this.manager.query(
        `INSERT INTO patients(id,medical_record_no,name,birth_date,gender,bpjs,bpjs_number,address)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,medical_record_no AS "medicalRecordNo",name,to_char(birth_date,'YYYY-MM-DD') AS "birthDate",gender,bpjs,bpjs_number AS "bpjsNumber"`,
        [patient.id, patient.medicalRecordNo, patient.name, patient.birthDate, patient.gender,
          patient.bpjs, patient.bpjsNumber ?? null, patient.address ?? null],
      );
      return row;
    } catch (error) {
      const { code, constraint } = (error as { driverError?: { code?: string; constraint?: string } }).driverError ?? {};
      if (constraint === "patients_medical_record_no_key" && code === "23505")
        throw DomainError.conflict("Nomor rekam medis sudah terdaftar. Cari pasien tersebut atau gunakan nomor lain.");
      throw error;
    }
  }
}
