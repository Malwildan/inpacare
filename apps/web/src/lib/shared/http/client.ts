import { ApiError } from '../errors';
export type HttpClient = ReturnType<typeof createHttpClient>;
export type HttpOptions = {
    csrfToken?: () => string | undefined;
};
export function createHttpClient(fetcher: typeof fetch, options: HttpOptions = {}) {
    return {
        async request<T>(path: string, init: RequestInit = {}): Promise<T> {
            const headers = new Headers(init.headers);
            if (init.body)
                headers.set('content-type', 'application/json');
            const csrf = options.csrfToken?.();
            if (csrf)
                headers.set('x-csrf-token', csrf);
            const response = await fetcher(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' });
            if (response.status === 204)
                return undefined as T;
            const value = await response.json().catch(() => null);
            if (!response.ok) {
                throw new ApiError(value?.error?.message ?? 'Permintaan gagal. Silakan coba kembali.', response.status, value?.error?.code ?? 'REQUEST_FAILED');
            }
            return value as T;
        }
    };
}
