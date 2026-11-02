import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";

export class AppError extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ error: { code, message } }, status);
  }
  static validation(message = "Format permintaan tidak valid.") {
    return new AppError(422, "VALIDATION_FAILED", message);
  }
  static forbidden() {
    return new AppError(
      403,
      "FORBIDDEN",
      "Anda tidak memiliki akses untuk tindakan ini.",
    );
  }
  static notFound() {
    return new AppError(
      404,
      "NOT_FOUND",
      "Data tidak ditemukan atau tidak lagi tersedia.",
    );
  }
  static unauthorized() {
    return new AppError(
      401,
      "UNAUTHENTICATED",
      "Sesi telah berakhir. Silakan masuk kembali.",
    );
  }
  static conflict(
    message = "Data berubah bersamaan. Muat ulang dan coba kembali.",
  ) {
    return new AppError(409, "CONFLICT", message);
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof AppError)
      return response
        .status(exception.getStatus())
        .json(exception.getResponse());
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return response
        .status(status)
        .json({
          error: {
            code: status === 404 ? "NOT_FOUND" : "INVALID_REQUEST",
            message: "Format permintaan tidak valid.",
          },
        });
    }
    const bodyError = exception as { type?: string; status?: number };
    if (bodyError?.type === "entity.too.large")
      return response
        .status(413)
        .json({
          error: {
            code: "INVALID_REQUEST",
            message: "Ukuran permintaan terlalu besar.",
          },
        });
    if (bodyError?.type === "entity.parse.failed")
      return response
        .status(400)
        .json({
          error: {
            code: "INVALID_REQUEST",
            message: "Format JSON tidak valid.",
          },
        });
    const pgCode = (exception as { driverError?: { code?: string } })
      ?.driverError?.code;
    if (pgCode && ["23505", "40001", "40P01"].includes(pgCode))
      return response.status(409).json(AppError.conflict().getResponse());
    if (
      pgCode &&
      ["23503", "23514", "22003", "22007", "22008", "22P02"].includes(pgCode)
    )
      return response
        .status(422)
        .json(
          AppError.validation(
            "Referensi atau nilai data tidak valid.",
          ).getResponse(),
        );
    // Never log query parameters, passwords, session tokens or clinical payloads.
    console.error(
      "API operation failed",
      exception instanceof Error ? exception.name : "UnknownError",
    );
    return response
      .status(500)
      .json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Terjadi kesalahan. Silakan coba kembali.",
        },
      });
  }
}
