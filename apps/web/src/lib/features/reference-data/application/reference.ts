import type { Reference, Staff, Patient } from '../domain/models';
export type ReferenceData = {
    load(): Promise<Reference>;
    patients(): Promise<Patient[]>;
    staff(): Promise<Staff[]>;
};
