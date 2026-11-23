import type { components } from '$lib/generated/api';
import type { HttpClient } from '$lib/shared/http/client';
import type { Auth } from '../application/auth';
type UserEnvelope = components['schemas']['UserEnvelope'];
const validSession = ({ user }: UserEnvelope) => typeof user?.id === 'string' && ['ADMISI', 'DOKTER', 'PERAWAT'].includes(user.role);
export function createHttpAuth(http: HttpClient): Auth {
    return {
        current: async () => (await http.request<UserEnvelope>('/session', {}, validSession)).user,
        login: async (input) => (await http.request<UserEnvelope>('/session', { method: 'POST', body: JSON.stringify(input) }, validSession)).user,
        logout: () => http.request<void>('/session', { method: 'DELETE' })
    };
}
