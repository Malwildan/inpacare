import type { ClinicalRecord, MedicalSummary, AdmissionRecord, NewMedicalRecord, UpdateMedicalRecord, NewObservation, UpdateObservation, DeleteRecord } from '../domain/models';
import type { User } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
type ClinicalFields = 'complaint' | 'diagnosis' | 'treatment' | 'notes' | 'observations' | 'version' | 'createdAt' | 'updatedAt' | 'doctorName' | 'observationCount';
export type AdmissionView = AdmissionRecord & {
    patientName: string;
    medicalRecordNo: string;
} & {
    [K in ClinicalFields]?: never;
};
export type MedicalListData = {
    user: User;
    reference: Reference;
} & ({
    admisiProjection: true;
    records: AdmissionView[];
} | {
    admisiProjection: false;
    records: MedicalSummary[];
});
export type MedicalDetailData = {
    user: User;
} & ({
    admisiProjection: true;
    record: AdmissionView;
} | {
    admisiProjection: false;
    record: ClinicalRecord;
});
export type MedicalRepository = {
    clinicalList(): Promise<MedicalSummary[]>;
    admissionList(): Promise<AdmissionRecord[]>;
    clinicalDetail(id: string): Promise<ClinicalRecord>;
    admissionDetail(id: string): Promise<AdmissionRecord>;
    create(input: NewMedicalRecord): Promise<{
        id: string;
    }>;
    update(id: string, input: UpdateMedicalRecord): Promise<unknown>;
    archive(id: string, input: DeleteRecord): Promise<unknown>;
    observe(id: string, input: NewObservation): Promise<unknown>;
    correctObservation(id: string, observationId: string, input: UpdateObservation): Promise<unknown>;
};
export function createMedicalUseCases(repository: MedicalRepository) {
    function admissionView(record: AdmissionRecord, reference: Reference): AdmissionView {
        const patient = reference.patients.find(item => item.id === record.patientId);
        return { id: record.id, patientId: record.patientId, doctorId: record.doctorId, recordDate: record.recordDate, patientName: patient?.name ?? record.patientId, medicalRecordNo: patient?.medicalRecordNo ?? '—' };
    }
    return {
        ...repository,
        async loadList(user: User, reference: Reference): Promise<MedicalListData> {
            if (user.role === 'ADMISI')
                return { user, reference, admisiProjection: true, records: (await repository.admissionList()).map(record => admissionView(record, reference)) };
            return { user, reference, admisiProjection: false, records: await repository.clinicalList() };
        },
        async loadDetail(id: string, user: User, reference: Reference): Promise<MedicalDetailData> {
            if (user.role === 'ADMISI')
                return { user, admisiProjection: true, record: admissionView(await repository.admissionDetail(id), reference) };
            return { user, admisiProjection: false, record: await repository.clinicalDetail(id) };
        }
    };
}
export type MedicalRecords = ReturnType<typeof createMedicalUseCases>;
