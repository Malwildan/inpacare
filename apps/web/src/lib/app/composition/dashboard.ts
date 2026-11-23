import { createCareCycles } from './care-cycles';
import type { CycleFilters } from '$lib/features/care-cycles';
export async function loadDashboard(fetcher: typeof fetch, filters: CycleFilters, canCreate = false, canAssign = false) {
    const service = createCareCycles(fetcher);
    const [cycles, creationCandidates, assignmentCandidates] = await Promise.all([
        service.dashboard(filters),
        canCreate ? service.creationCandidates() : [],
        canAssign ? service.assignmentCandidates() : [],
    ]);
    return { cycles, filters, creationCandidates, assignmentCandidates };
}
