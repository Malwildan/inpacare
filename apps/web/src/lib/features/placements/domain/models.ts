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
    status: "active";
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
};
export type ExpectedVersion = {
    expectedVersion: number;
};
