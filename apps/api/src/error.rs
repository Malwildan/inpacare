use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub type AppResult<T> = Result<T, AppError>;
#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
}
impl AppError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNPROCESSABLE_ENTITY,
            code: "VALIDATION_FAILED",
            message: message.into(),
        }
    }
    pub fn forbidden() -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            code: "FORBIDDEN",
            message: "Anda tidak memiliki akses untuk tindakan ini.".into(),
        }
    }
    pub fn not_found() -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: "NOT_FOUND",
            message: "Data tidak ditemukan atau tidak lagi tersedia.".into(),
        }
    }
    pub fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code: "UNAUTHENTICATED",
            message: "Sesi telah berakhir. Silakan masuk kembali.".into(),
        }
    }
    pub fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code: "CONFLICT",
            message: message.into(),
        }
    }
    pub fn internal() -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "INTERNAL_ERROR",
            message: "Terjadi kesalahan. Silakan coba kembali.".into(),
        }
    }
}
impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        if let sqlx::Error::Database(ref e) = error {
            match e.code().as_deref() {
                Some("23505") => return Self::conflict("Data sudah ada atau sedang digunakan."),
                Some("23503") | Some("23514") | Some("22003") => {
                    return Self::validation("Referensi atau nilai data tidak valid.")
                }
                Some("40001") | Some("40P01") => {
                    return Self::conflict("Data berubah bersamaan. Muat ulang dan coba kembali.")
                }
                _ => {}
            }
        }
        if matches!(error, sqlx::Error::RowNotFound) {
            return Self::not_found();
        }
        tracing::error!(error = %error, "database operation failed");
        Self::internal()
    }
}
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({"error":{"code":self.code,"message":self.message}})),
        )
            .into_response()
    }
}
