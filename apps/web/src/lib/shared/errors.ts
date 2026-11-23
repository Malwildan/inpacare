export class ApiError extends Error {
    constructor(message: string, public readonly status: number, public readonly code: string) {
        super(message);
        this.name = 'ApiError';
    }
}

export function isVersionConflict(error: unknown) {
    return error instanceof ApiError && error.status === 409 && error.message ===
        'Data sudah berubah. Muat ulang untuk melihat data terbaru, lalu periksa perubahan Anda sebelum menyimpan kembali.';
}
