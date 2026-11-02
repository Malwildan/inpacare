export type User = {
    id: string;
    username: string;
    name: string;
    role: "DOKTER" | "PERAWAT" | "ADMISI";
    coordinator: boolean;
    csrfToken: string;
};
export type LoginInput = {
    username: string;
    password: string;
};
