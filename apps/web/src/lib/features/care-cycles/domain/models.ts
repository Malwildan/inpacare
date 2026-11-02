export type Cycle = {
    id: string;
    patientId: string;
    patientName: string;
    medicalRecordNo: string;
    placementId: string | null;
    room: string | null;
    doctorId: string;
    doctorName: string;
    nurseId: string;
    nurseName: string;
    status: string;
    version: number;
    createdAt: string;
    requests: ({
        id: string;
        kind: "extend" | "release";
        requestedEnd: string | null;
        reason: string;
        requestedBy: string;
        status: string;
        decidedBy: string | null;
        note: string | null;
        createdAt: string;
        decidedAt: string | null;
    })[];
    roomId?: string | null;
    pendingApproval?: boolean;
};
export type NewCycle = {
    patientId: string;
    doctorId: string;
    placementId?: string | null;
};
export type ChangeCycle = {
    status?: "pending" | "assigned" | "in_care" | "extend" | "released";
    placementId?: string | null;
    expectedVersion: number;
};
export type NewRequest = {
    kind: string;
    requestedEnd?: string | null;
    reason: string;
};
export type Decision = {
    decision: string;
    note: string;
    expectedVersion: number;
};
export type DeleteCycle = {
    expectedVersion: number;
    reason: string;
};
export type CycleSummary = {
    id: string;
    patientId: string;
    patientName: string;
    medicalRecordNo: string;
    placementId: string | null;
    room: string | null;
    doctorName: string;
    nurseName: string;
    status: string;
    version: number;
    createdAt: string;
    requests: ({
        id: string;
        kind: string;
        requestedEnd: string | null;
        reason: string;
        requestedBy: string;
        status: string;
        note: string | null;
        createdAt: string;
    })[];
    roomId?: string | null;
    pendingApproval?: boolean;
    doctorId?: string;
    nurseId?: string;
};
