import type { PatientContext } from '../domain/models';
import type { User } from '$lib/features/auth';
export type Patients = {
    context(id: string): Promise<PatientContext>;
};
export type PatientPageData = {
    context: PatientContext;
    user: User;
};
