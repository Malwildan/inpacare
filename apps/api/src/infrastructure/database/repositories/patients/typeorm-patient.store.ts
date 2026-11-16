import { EntityManager } from "typeorm";
import { CreatePatientInput, PatientStore } from "../../../../application/patients/patient-store.port";
import { PatientSummary } from "../../../../application/reference/reference-store.port";

export class TypeOrmPatientStore implements PatientStore {
  constructor(private readonly manager: EntityManager) {}

  async create(patient: CreatePatientInput & { id: string }): Promise<PatientSummary> {
    const [row] = await this.manager.query(
      `WITH generated AS (SELECT nextval('patient_medical_record_no_seq')::text AS number)
       INSERT INTO patients(id,medical_record_no,name,birth_date,gender,bpjs,bpjs_number,address)
       SELECT $1,'RM-' || lpad(number,GREATEST(5,length(number)),'0'),$2,$3,$4,$5,$6,$7 FROM generated
       RETURNING id,medical_record_no AS "medicalRecordNo",name,to_char(birth_date,'YYYY-MM-DD') AS "birthDate",gender,bpjs,bpjs_number AS "bpjsNumber"`,
      [patient.id, patient.name, patient.birthDate, patient.gender,
        patient.bpjs, patient.bpjsNumber ?? null, patient.address ?? null],
    );
    return row;
  }
}
