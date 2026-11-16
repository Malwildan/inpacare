import { createCareCycles } from './care-cycles';
import type { CycleFilters } from '$lib/features/care-cycles';
export async function loadDashboard(fetcher: typeof fetch, filters: CycleFilters, canCreate = false) {
    const service = createCareCycles(fetcher);
    const [cycles, creationCandidates] = await Promise.all([service.dashboard(filters), canCreate ? service.creationCandidates() : Promise.resolve([])]);
    return { cycles, filters, creationCandidates };
}
