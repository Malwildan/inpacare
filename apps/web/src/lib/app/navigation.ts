import type { User } from '$lib/features/auth';
export function landingPage(user: User) { return user.role === 'ADMISI' ? '/invoices' : '/dashboard'; }
export function restrictedPage(path: string, user: User) {
    return (path.startsWith('/tasks') && user.role !== 'PERAWAT') || (path.startsWith('/invoices') && user.role !== 'ADMISI');
}
