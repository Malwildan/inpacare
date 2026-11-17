export type Placement = {
    id: string;
    patientId: string;
    patientName: string;
    medicalRecordNo: string;
    roomId: string;
    roomName: string;
    roomClass: string;
    startsOn: string;
    endsOn: string;
    status: "active" | "cancelled";
    version: number;
};
export type NewPlacement = {
    patientId: string;
    roomId: string;
    startsOn: string;
    endsOn: string;
};
export type UpdatePlacement = {
    patientId: string;
    roomId: string;
    startsOn: string;
    endsOn: string;
    expectedVersion: number;
    reason: string;
};
export type CancelPlacement = {
    expectedVersion: number;
    reason: string;
};
export type PlacementSnapshot = {
    id: string;
    patient_id: string;
    room_id: string;
    starts_on: string;
    ends_on: string;
    status: string;
    version: number;
};
export type PlacementHistory = {
    id: string;
    actorId: string;
    actorName: string;
    action: 'updated' | 'cancelled';
    reason: string;
    before: PlacementSnapshot;
    after: PlacementSnapshot;
    createdAt: string;
};
