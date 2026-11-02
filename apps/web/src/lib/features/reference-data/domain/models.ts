export type Reference = {
    patients: ({
        id: string;
        name: string;
        medicalRecordNo: string;
        birthDate: string;
        gender: "L" | "P";
        bpjs: boolean;
        bpjsNumber: string | null;
    })[];
    staff: ({
        id: string;
        name: string;
        role: "DOKTER" | "PERAWAT";
        coordinator: boolean;
        active: boolean;
    })[];
    rooms: ({
        id: string;
        name: string;
        roomClass: string;
        capacity: number;
        status: string;
        picId: string | null;
        dailyRate: string;
        version: number;
    })[];
    placements: ({
        id: string;
        patientId: string;
        patientName: string;
        roomId: string;
        roomName: string;
        roomClass?: string;
        medicalRecordNo?: string;
        startsOn: string;
        endsOn: string;
        status: string;
        version: number;
    })[];
};
export type Patient = {
    id: string;
    name: string;
    medicalRecordNo: string;
    birthDate: string;
    gender: "L" | "P";
    bpjs: boolean;
    bpjsNumber: string | null;
};
export type Staff = {
    id: string;
    name: string;
    role: "DOKTER" | "PERAWAT";
    coordinator: boolean;
    active: boolean;
};
