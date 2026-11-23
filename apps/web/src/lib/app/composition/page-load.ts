import { error, redirect } from '@sveltejs/kit';
import { ApiError } from '$lib/shared/errors';

export async function loadPage<T>(subject: string, load: () => Promise<T>): Promise<T> {
    try {
        return await load();
    } catch (failure) {
        if (failure instanceof ApiError) {
            if (failure.status === 401) redirect(303, '/login?status=sesi-berakhir');
            if (failure.status === 403) error(403, { message: 'Akses terbatas' });
            if (failure.status === 404) {
                error(404, { message: 'Data tidak tersedia', publicMessage: `${subject} tidak tersedia untuk akun Anda. Kembali untuk melihat data yang dapat Anda buka.` });
            }
        }
        error(503, { message: 'Halaman gagal dimuat', publicMessage: `${subject} gagal dimuat. Periksa koneksi Anda, lalu muat ulang halaman.` });
    }
}
