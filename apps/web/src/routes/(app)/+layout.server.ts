import { redirect, error, isHttpError } from '@sveltejs/kit';
import { createAuth } from '$lib/app/composition/auth';
import { createReferenceData } from '$lib/app/composition/reference-data';
import { restrictedPage } from '$lib/app/navigation';
import { ApiError } from '$lib/shared/errors';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ fetch, depends, url, cookies }) => {
 depends('app:session');
 try {
  const user = await createAuth(fetch).current();
  if (restrictedPage(url.pathname, user)) error(403, 'Halaman ini tidak tersedia untuk peran akun Anda.');
  return { user, reference: await createReferenceData(fetch).load() };
 } catch (failure) {
  if (isHttpError(failure)) throw failure;
  if (failure instanceof ApiError && failure.status === 401) redirect(303, cookies.get('session') ? '/login?status=sesi-berakhir' : '/login');
  error(503, { message: 'Halaman gagal dimuat', publicMessage: 'InpaCare belum dapat memuat halaman ini. Periksa koneksi Anda, lalu muat ulang halaman.' });
 }
};
