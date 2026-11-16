export type NewPatient = {
    name: string;
    birthDate: string;
    gender: 'L' | 'P';
    bpjs: boolean;
    bpjsNumber?: string | null;
    address?: string | null;
};
export type PatientList = { items: PatientContext['patient'][]; total: number };

export type PatientContext = {
    patient: {
        id: string;
        name: string;
        medicalRecordNo: string;
        birthDate: string;
        gender: "L" | "P";
        bpjs: boolean;
        bpjsNumber: string | null;
    };
    placements: ({
        id: string;
        roomId: string;
        roomName: string;
        startsOn: string;
        endsOn: string;
        status: string;
    })[];
    cycles: ({
        id: string;
        status: string;
        doctorName: string;
        nurseName: string;
        version: number;
    })[];
};
