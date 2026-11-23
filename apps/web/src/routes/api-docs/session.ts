import { error } from '@sveltejs/kit';
import { createAuth } from '$lib/app/composition/auth';
import { ApiError } from '$lib/shared/errors';

export async function requireApiDocsSession(fetcher: typeof fetch) {
    try {
        await createAuth(fetcher).current();
    } catch (failure) {
        if (failure instanceof ApiError && failure.status === 401) error(401, 'Masuk ke InpaCare untuk membuka penjelajah API.');
        error(503, { message: 'Penjelajah API gagal dimuat.', publicMessage: 'Penjelajah API gagal dimuat. Periksa koneksi Anda, lalu muat ulang halaman.' });
    }
}
