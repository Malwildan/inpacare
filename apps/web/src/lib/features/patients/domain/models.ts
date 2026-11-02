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
