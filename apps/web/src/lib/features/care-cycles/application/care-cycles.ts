import type { Cycle, CycleSummary, NewCycle, CreatedCycle, ChangeCycle, NewRequest, Decision, DeleteCycle } from '../domain/models';
import type { User } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
export type CycleFilters = Record<'search' | 'status' | 'roomId' | 'patientId', string>;
export type CycleCandidate = { id: string; name: string; medicalRecordNo: string };
export type CareCycles = {
    creationCandidates(): Promise<CycleCandidate[]>;
    dashboard(filters: CycleFilters): Promise<CycleSummary[]>;
    detail(id: string): Promise<Cycle>;
    create(input: NewCycle): Promise<CreatedCycle>;
    change(id: string, input: ChangeCycle): Promise<unknown>;
    remove(id: string, input: DeleteCycle): Promise<unknown>;
    request(id: string, input: NewRequest): Promise<unknown>;
    decide(id: string, requestId: string, input: Decision): Promise<unknown>;
};
export type DashboardData = {
    cycles: CycleSummary[];
    creationCandidates: CycleCandidate[];
    filters: CycleFilters;
    user: User;
    reference: Reference;
};
export function parseCycleSearch(params: URLSearchParams): CycleFilters {
    return { search: params.get('search') ?? '', status: params.get('status') ?? '', roomId: params.get('roomId') ?? '', patientId: params.get('patientId') ?? '' };
}
