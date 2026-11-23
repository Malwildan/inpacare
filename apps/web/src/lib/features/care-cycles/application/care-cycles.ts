import type { Cycle, CycleSummary, NewCycle, CreatedCycle, ChangeCycle, NewRequest, Decision, DeleteCycle, CycleAssignee, ReassignCycle } from '../domain/models';
import type { NewObservation, Observation } from '$lib/features/medical-records';
import type { User } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
export type CycleFilters = Record<'search' | 'status' | 'roomId' | 'patientId', string>;
export type CycleCandidate = { id: string; name: string; medicalRecordNo: string };
export type CareCycles = {
    creationCandidates(): Promise<CycleCandidate[]>;
    assignmentCandidates(): Promise<CycleAssignee[]>;
    dashboard(filters: CycleFilters): Promise<CycleSummary[]>;
    detail(id: string): Promise<Cycle>;
    observations(id: string): Promise<Observation[]>;
    addObservation(id: string, input: NewObservation): Promise<Observation[]>;
    create(input: NewCycle): Promise<CreatedCycle>;
    change(id: string, input: ChangeCycle): Promise<unknown>;
    reassign(id: string, input: ReassignCycle): Promise<unknown>;
    remove(id: string, input: DeleteCycle): Promise<unknown>;
    request(id: string, input: NewRequest): Promise<unknown>;
    decide(id: string, requestId: string, input: Decision): Promise<unknown>;
};
export type DashboardData = {
    cycles: CycleSummary[];
    creationCandidates: CycleCandidate[];
    assignmentCandidates: CycleAssignee[];
    filters: CycleFilters;
    user: User;
    reference: Reference;
    cycleDestination?: { cycle: Cycle; requestId: string | null } | null;
};
export function parseCycleSearch(params: URLSearchParams): CycleFilters {
    return { search: params.get('search') ?? '', status: params.get('status') ?? '', roomId: params.get('roomId') ?? '', patientId: params.get('patientId') ?? '' };
}
