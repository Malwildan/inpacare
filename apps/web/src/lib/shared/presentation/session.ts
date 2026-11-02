import { ApiError } from '../errors';
export function csrfToken() {
    if (typeof document === 'undefined')
        return undefined;
    return document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('csrf_token='))?.slice(11);
}
// Navigation belongs to presentation; transport is also used by SSR and tests.
export function sessionFailure(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
    }
    return failure instanceof Error ? failure.message : 'Perubahan gagal disimpan.';
}
