import { publicErrors } from './public-errors.generated';

export const expiredSession = 'Sesi Anda berakhir. Masuk kembali untuk melanjutkan.';
export const invalidCredentials = 'ID petugas atau kata sandi tidak sesuai. Periksa keduanya, lalu coba masuk kembali.';

export function publicError(status: number, code: string, message: unknown): string {
    if (typeof message !== 'string') return '';
    if (status === 429 && code === 'RATE_LIMITED' && /^Terlalu banyak percobaan masuk\. Coba lagi dalam (?:[1-9]|1[0-5]) menit\.$/.test(message)) {
        return message;
    }
    if (status === 422 && code === 'VALIDATION_FAILED' && /^(?:(?:Keluhan|Diagnosis|Tindakan) wajib diisi\.|(?:Waktu mulai|Waktu selesai) harus berformat waktu ISO 8601 dengan zona waktu\.|(?:Nominal|Harga satuan|Nilai jaminan) (?:harus berupa nominal desimal valid maksimal dua desimal|terlalu besar)\.)$/.test(message)) {
        return message;
    }
    if (status >= 400 && status < 500 && Object.hasOwn(publicErrors, code) && message !== 'Periksa isian atau pilihan Anda, lalu kirim kembali.') {
        return publicErrors[code].includes(message) ? message : '';
    }
    return '';
}
