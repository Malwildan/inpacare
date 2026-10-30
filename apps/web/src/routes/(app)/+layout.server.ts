import { redirect, error, isHttpError } from '@sveltejs/kit';
import { loadApi, ApiError } from '$lib/api';
import type { User, Reference } from '$lib/types';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ fetch, depends, url }) => {
 depends('app:session');
 try {
  const { user } = await loadApi<{user:User}>(fetch, '/session');
  const restricted = (url.pathname.startsWith('/tasks') && user.role !== 'PERAWAT') || (url.pathname.startsWith('/medical-records') && user.role === 'ADMISI') || (url.pathname.startsWith('/invoices') && user.role !== 'ADMISI');
  if (restricted) error(403, 'Halaman ini tidak tersedia untuk peran akun Anda.');
  const reference = await loadApi<Reference>(fetch, '/reference');
  return { user, reference };
 } catch (failure) {
  if (isHttpError(failure)) throw failure;
  if (failure instanceof ApiError && failure.status === 401) redirect(303, '/login');
  error(503, 'Layanan InpaCare belum tersedia. Silakan coba kembali.');
 }
};
