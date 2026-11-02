export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
  static validation(message = "Format permintaan tidak valid.") {
    return new DomainError("VALIDATION_FAILED", message);
  }
  static forbidden() {
    return new DomainError(
      "FORBIDDEN",
      "Anda tidak memiliki akses untuk tindakan ini.",
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
      "Sesi telah berakhir. Silakan masuk kembali.",
    );
  }
  static conflict(
    message = "Data berubah bersamaan. Muat ulang dan coba kembali.",
  ) {
    return new DomainError("CONFLICT", message);
  }
}
