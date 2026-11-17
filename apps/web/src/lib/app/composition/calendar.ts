import { createPlacements } from './placements';
import { createRooms } from './rooms';
import { createReferenceData } from './reference-data';
export async function loadCalendar(fetcher: typeof fetch, from: string | null, includeCancelled = false) {
    const [week, rooms, patients] = await Promise.all([createPlacements(fetcher).loadWeek(from, includeCancelled), createRooms(fetcher).list(), createReferenceData(fetcher).patients()]);
    return { ...week, rooms, patients };
}
