export type Room = {
    id: string;
    name: string;
    roomClass: string;
    capacity: number;
    status: "available" | "maintenance";
    picId: string | null;
    picName: string | null;
    dailyRate: string;
    version: number;
    items: ({
        id: string;
        name: string;
        category: string;
        quantity: number;
        unitPrice: string;
    })[];
    totalCost: string;
    occupants: number;
};
export type RoomItem = {
    id: string;
    name: string;
    category: string;
    quantity: number;
    unitPrice: string;
};
export type NewRoom = {
    name: string;
    roomClass: string;
    capacity: number;
    status?: "available" | "maintenance";
    picId?: string | null;
    dailyRate?: string;
};
export type EditRoom = {
    name: string;
    roomClass: string;
    capacity: number;
    status: "available" | "maintenance";
    picId?: string | null;
    dailyRate: string;
    expectedVersion: number;
};
export type NewRoomItem = {
    name: string;
    category: string;
    quantity: number;
    unitPrice: string;
};
export type UpdateRoomItem = {
    name: string;
    category: string;
    quantity: number;
    unitPrice: string;
    expectedVersion: number;
};
export type ExpectedVersion = {
    expectedVersion: number;
};
