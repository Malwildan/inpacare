import { ApiError } from '../errors';
import { expiredSession, invalidCredentials, publicError } from '../http/public-error';

export function csrfToken() {
    if (typeof document === 'undefined')
        return undefined;
    return document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('csrf_token='))?.slice(11);
}

export function isUnconfirmedSave(failure: unknown) {
    return !(failure instanceof ApiError) || failure.status < 400 || failure.status >= 500;
}

type Operation = 'login' | 'load' | 'save';

// Navigation belongs to presentation; transport is also used by SSR and tests.
export function sessionFailure(failure: unknown, operation: Operation, subject: string) {
    if (failure instanceof ApiError) {
        const { status, code, message } = failure;
        if (status === 401) {
            if (operation === 'login') return invalidCredentials;
            if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                window.location.assign('/login?status=sesi-berakhir');
            }
            return expiredSession;
        }
        const detail = publicError(status, code, message);
        if (status === 403) {
            const reason = detail || 'Akun Anda tidak memiliki izin untuk tindakan ini.';
            return operation === 'load' ? `${reason} Kembali ke halaman yang dapat Anda buka.` : reason;
        }
        if (status === 404) return operation === 'load'
            ? `${subject} tidak tersedia. Kembali ke daftar terkait untuk memeriksa data yang dapat dibuka.`
            : 'Data untuk tindakan ini tidak tersedia. Periksa data terbaru di daftar terkait.';
        if (detail) return detail;
        if (status === 429) return 'Terlalu banyak percobaan masuk. Tunggu hingga 15 menit sebelum mencoba lagi.';
        if (status === 409) return 'Perubahan ditolak karena berbenturan dengan data yang ada. Periksa data terbaru sebelum mengirim kembali.';
        if (status >= 400 && status < 500) {
            return operation === 'load'
                ? `${subject} gagal dimuat. Periksa pilihan pencarian, lalu muat ulang.`
                : 'Isian ditolak. Periksa kolom dan pilihan Anda, lalu coba lagi.';
        }
    }
    if (operation === 'login') return 'Proses masuk belum dapat dipastikan. Muat ulang halaman untuk memeriksa sesi Anda, lalu coba lagi jika masih diperlukan.';
    if (operation === 'load') return `${subject} gagal dimuat. Periksa koneksi Anda, lalu muat ulang.`;
    return `Hasil penyimpanan ${subject} belum diketahui. Periksa data terbaru sebelum mengirim kembali.`;
}
