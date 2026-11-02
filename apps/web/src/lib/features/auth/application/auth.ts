import type { User, LoginInput } from '../domain/models';
export type Auth = {
    current(): Promise<User>;
    login(input: LoginInput): Promise<User>;
    logout(): Promise<void>;
};
