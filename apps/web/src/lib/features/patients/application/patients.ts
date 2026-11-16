import type { NewPatient, PatientContext, PatientList } from '../domain/models';
import type { User } from '$lib/features/auth';
export type Patients = {
    context(id: string): Promise<PatientContext>;
    list(search: string, offset: number): Promise<PatientList>;
    create(input: NewPatient): Promise<PatientContext['patient']>;
};
export type PatientListData = {
    patients: PatientList;
    search: string;
    offset: number;
};
export type PatientPageData = {
    context: PatientContext;
    user: User;
};
