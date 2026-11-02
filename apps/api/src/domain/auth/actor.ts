export type Role = "DOKTER" | "PERAWAT" | "ADMISI";
export interface Actor {
  id: string;
  username: string;
  name: string;
  role: Role;
  coordinator: boolean;
}
