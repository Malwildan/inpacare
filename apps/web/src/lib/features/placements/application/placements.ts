import type { Placement, NewPlacement, UpdatePlacement, CancelPlacement, PlacementHistory } from '../domain/models';
import { calendarWeek } from '../domain/calendar';
import type { Room } from '$lib/features/rooms';
import type { Patient } from '$lib/features/reference-data';
import type { User } from '$lib/features/auth';
export type PlacementsRepository = {
    occupancy(from: string, to: string, includeCancelled?: boolean): Promise<Placement[]>;
    create(input: NewPlacement): Promise<unknown>;
    update(id: string, input: UpdatePlacement): Promise<unknown>;
    cancel(id: string, input: CancelPlacement): Promise<unknown>;
    history(id: string): Promise<PlacementHistory[]>;
};
export function createPlacementsUseCases(repository: PlacementsRepository) {
    return { ...repository, async loadWeek(from: string | null, includeCancelled = false) { const range = calendarWeek(from); return { ...range, placements: await repository.occupancy(range.from, range.to, includeCancelled) }; } };
}
export type Placements = ReturnType<typeof createPlacementsUseCases>;
export type CalendarPageData = {
    from: string;
    to: string;
    placements: Placement[];
    rooms: Room[];
    patients: Patient[];
    user: User;
};
