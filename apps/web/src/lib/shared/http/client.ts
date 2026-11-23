import { ApiError } from '../errors';
import { publicError } from './public-error';
export type HttpClient = ReturnType<typeof createHttpClient>;
export type HttpOptions = {
    csrfToken?: () => string | undefined;
};
export function createHttpClient(fetcher: typeof fetch, options: HttpOptions = {}) {
    return {
        async request<T>(path: string, init: RequestInit = {}, valid?: (value: T) => boolean): Promise<T> {
            const headers = new Headers(init.headers);
            if (init.body)
                headers.set('content-type', 'application/json');
            const csrf = options.csrfToken?.();
            if (csrf)
                headers.set('x-csrf-token', csrf);
            let response: Response;
            try {
                response = await fetcher(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' });
            } catch {
                throw new ApiError('', 0, 'CONNECTION_FAILED');
            }
            if (response.status === 204 && path === '/session' && init.method === 'DELETE')
                return undefined as T;
            const value = await response.json().catch(() => null);
            if (!response.ok) {
                const code = typeof value?.error?.code === 'string' ? value.error.code : 'REQUEST_FAILED';
                throw new ApiError(publicError(response.status, code, value?.error?.message), response.status, code);
            }
            if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || 'error' in value || (valid && !valid(value)))
                throw new ApiError('', response.status, 'UNEXPECTED_RESPONSE');
            return value as T;
        }
    };
}
