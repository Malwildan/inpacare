export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
  static validation(message = "Periksa isian atau pilihan Anda, lalu kirim kembali.") {
    return new DomainError("VALIDATION_FAILED", message);
  }
  static forbidden() {
    return new DomainError(
      "FORBIDDEN",
      "Akun Anda tidak memiliki izin untuk tindakan ini.",
    );
  }
  static notFound() {
    return new DomainError(
      "NOT_FOUND",
      "Data tidak ditemukan atau tidak lagi tersedia.",
    );
  }
  static unauthorized() {
    return new DomainError(
      "UNAUTHENTICATED",
      "Sesi Anda berakhir. Masuk kembali untuk melanjutkan.",
    );
  }
  static conflict(
    message = "Data sudah berubah. Muat ulang untuk melihat data terbaru, lalu periksa perubahan Anda sebelum menyimpan kembali.",
  ) {
    return new DomainError("CONFLICT", message);
  }
}
