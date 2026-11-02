import type { Room, NewRoom, EditRoom, NewRoomItem, UpdateRoomItem, ExpectedVersion } from '../domain/models';
import type { User } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
export type Rooms = {
    list(): Promise<Room[]>;
    create(input: NewRoom): Promise<unknown>;
    update(id: string, input: EditRoom): Promise<unknown>;
    remove(id: string, input: ExpectedVersion): Promise<unknown>;
    addItem(id: string, input: NewRoomItem): Promise<unknown>;
    updateItem(id: string, itemId: string, input: UpdateRoomItem): Promise<unknown>;
    removeItem(id: string, itemId: string, input: ExpectedVersion): Promise<unknown>;
};
export type RoomsPageData = {
    rooms: Room[];
    user: User;
    reference: Reference;
};
