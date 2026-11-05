import { createCareCycles } from './care-cycles';
import { createNotifications } from './notifications';
import type { CycleFilters } from '$lib/features/care-cycles';
export async function loadDashboard(fetcher: typeof fetch, filters: CycleFilters, canCreate = false) {
    const service = createCareCycles(fetcher);
    const [cycles, notifications, creationCandidates] = await Promise.all([service.dashboard(filters), createNotifications(fetcher).list(), canCreate ? service.creationCandidates() : Promise.resolve([])]);
    return { cycles, notifications, filters, creationCandidates };
}
