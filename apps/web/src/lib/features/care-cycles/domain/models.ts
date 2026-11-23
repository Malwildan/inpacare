export type CycleAssignee = { id: string; name: string };
export type CycleAssignmentEvent = {
    id: string;
    actorId: string;
    actorName: string;
    previousNurseId: string;
    previousNurseName: string;
    newNurseId: string;
    newNurseName: string;
    reason: string;
    createdAt: string;
};
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
    assignmentHistory?: CycleAssignmentEvent[];
};
export type NewCycle = {
    patientId: string;
    doctorId: string;
    nurseId?: string;
    placementId?: string | null;
    newPlacement?: { roomId: string; startsOn: string; endsOn: string } | null;
    requestId?: string;
};
export type ReassignCycle = {
    nurseId: string;
    expectedVersion: number;
    reason: string;
};
export type CreatedCycle = {
    id: string;
    patientId: string;
    doctorId: string;
    nurseId: string;
    placementId: string | null;
    status: 'pending' | 'assigned';
    version: number;
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
