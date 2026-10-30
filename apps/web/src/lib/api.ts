export class ApiError extends Error { constructor(message: string, public status: number, public code: string) { super(message); } }
async function read<T>(response: Response): Promise<T> {
 if (response.status === 204) return undefined as T;
 const value = await response.json().catch(() => null);
 if (!response.ok) throw new ApiError(value?.error?.message ?? 'Permintaan gagal. Silakan coba kembali.', response.status, value?.error?.code ?? 'REQUEST_FAILED');
 return value as T;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
 const headers = new Headers(init.headers);
 if (init.body) headers.set('content-type', 'application/json');
 if (typeof document !== 'undefined') {
  const csrf = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('csrf_token='))?.slice(11);
  if (csrf) headers.set('x-csrf-token', csrf);
 }
 const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' });
 if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') { window.location.assign('/login'); }
 return read<T>(response);
}
export async function loadApi<T>(fetcher: typeof fetch, path: string): Promise<T> { return read<T>(await fetcher(`/api/v1${path}`)); }
export function money(value: string | number) { return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0, maximumFractionDigits:2 }).format(Number(value)); }
export function date(value: string) { return new Intl.DateTimeFormat('id-ID', { dateStyle:'medium', timeZone:'Asia/Jakarta' }).format(new Date(value)); }
