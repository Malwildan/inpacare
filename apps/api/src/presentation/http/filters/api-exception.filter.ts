import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { DomainError } from "../../../domain/shared/domain-error";
const statuses: Record<string, number> = {
  VALIDATION_FAILED: 422,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};
const domainStatus = (code: string) => statuses[code] ?? 500;
const errorBody = (error: DomainError) => ({
  error: { code: error.code, message: error.message },
});
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof DomainError)
      return response
        .status(domainStatus(exception.code))
        .json({ error: { code: exception.code, message: exception.message } });
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return response.status(status).json({
        error: {
          code: status === 404 ? "NOT_FOUND" : "INVALID_REQUEST",
          message: "Format permintaan tidak valid.",
        },
      });
    }
    const bodyError = exception as {
      type?: string;
      status?: number;
    };
    if (bodyError?.type === "entity.too.large")
      return response.status(413).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Ukuran permintaan terlalu besar.",
        },
      });
    if (bodyError?.type === "entity.parse.failed")
      return response.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Format JSON tidak valid.",
        },
      });
    const pgCode = (
      exception as {
        driverError?: {
          code?: string;
        };
      }
    )?.driverError?.code;
    if (pgCode && ["23505", "40001", "40P01"].includes(pgCode))
      return response.status(409).json(errorBody(DomainError.conflict()));
    if (
      pgCode &&
      ["23503", "23514", "22003", "22007", "22008", "22P02"].includes(pgCode)
    )
      return response
        .status(422)
        .json(
          errorBody(
            DomainError.validation("Referensi atau nilai data tidak valid."),
          ),
        );
    // Never log query parameters, passwords, session tokens or clinical payloads.
    console.error(
      "API operation failed",
      exception instanceof Error ? exception.name : "UnknownError",
    );
    return response.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Terjadi kesalahan. Silakan coba kembali.",
      },
    });
  }
}
