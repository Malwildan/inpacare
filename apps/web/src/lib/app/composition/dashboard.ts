import { createCareCycles } from './care-cycles';
import { createNotifications } from './notifications';
import type { CycleFilters } from '$lib/features/care-cycles';
export async function loadDashboard(fetcher: typeof fetch, filters: CycleFilters) {
    const [cycles, notifications] = await Promise.all([createCareCycles(fetcher).dashboard(filters), createNotifications(fetcher).list()]);
    return { cycles, notifications, filters };
}
