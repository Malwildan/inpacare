import type { Cycle, CycleSummary, NewCycle, ChangeCycle, NewRequest, Decision, DeleteCycle } from '../domain/models';
import type { User } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
import type { Notification } from '$lib/features/notifications';
export type CycleFilters = Record<'search' | 'status' | 'roomId' | 'patientId', string>;
export type CareCycles = {
    dashboard(filters: CycleFilters): Promise<CycleSummary[]>;
    detail(id: string): Promise<Cycle>;
    create(input: NewCycle): Promise<unknown>;
    change(id: string, input: ChangeCycle): Promise<unknown>;
    remove(id: string, input: DeleteCycle): Promise<unknown>;
    request(id: string, input: NewRequest): Promise<unknown>;
    decide(id: string, requestId: string, input: Decision): Promise<unknown>;
};
export type DashboardData = {
    cycles: CycleSummary[];
    filters: CycleFilters;
    user: User;
    reference: Reference;
    notifications: Notification[];
};
export function parseCycleSearch(params: URLSearchParams): CycleFilters {
    return { search: params.get('search') ?? '', status: params.get('status') ?? '', roomId: params.get('roomId') ?? '', patientId: params.get('patientId') ?? '' };
}
