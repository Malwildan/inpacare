import type { Placement, NewPlacement, UpdatePlacement, ExpectedVersion } from '../domain/models';
import { calendarWeek } from '../domain/calendar';
import type { Room } from '$lib/features/rooms';
import type { Patient } from '$lib/features/reference-data';
import type { User } from '$lib/features/auth';
export type PlacementsRepository = {
    occupancy(from: string, to: string): Promise<Placement[]>;
    create(input: NewPlacement): Promise<unknown>;
    update(id: string, input: UpdatePlacement): Promise<unknown>;
    cancel(id: string, input: ExpectedVersion): Promise<unknown>;
};
export function createPlacementsUseCases(repository: PlacementsRepository) {
    return { ...repository, async loadWeek(from: string | null) { const range = calendarWeek(from); return { ...range, placements: await repository.occupancy(range.from, range.to) }; } };
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
