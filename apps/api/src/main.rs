mod access;
mod auth;
mod billing;
mod cycle;
mod db;
mod error;
mod medical_records;
mod notifications;
mod placements;
mod reference_data;
mod rooms;
mod seed;
mod tasks;
use axum::{
    extract::State,
    http::{header, HeaderValue},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde_json::json;
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::time::Duration;
use tower_http::trace::TraceLayer;
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "inpacare_api=info,tower_http=info".into()),
        )
        .init();
    let db_url =
        std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required; see .env.example")?;
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&db_url)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    if std::env::var("SEED_DEMO").as_deref() == Ok("1") {
        seed::run(&pool).await?;
    }
    let state = AppState { pool };
    let api = Router::new()
        .merge(auth::router())
        .merge(reference_data::router())
        .merge(rooms::router())
        .merge(placements::router())
        .merge(tasks::router())
        .merge(medical_records::router())
        .merge(cycle::router())
        .merge(billing::router())
        .merge(notifications::router());
    let app = Router::new()
        .route("/health", get(health))
        .nest("/api/v1", api)
        .fallback(|| async {
            (
                axum::http::StatusCode::NOT_FOUND,
                Json(json!({"error":{"code":"NOT_FOUND","message":"Endpoint tidak ditemukan."}})),
            )
        })
        .layer(axum::extract::DefaultBodyLimit::max(256 * 1024))
        .layer(middleware::from_fn(headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state);
    let address = std::env::var("API_BIND").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!(%address,"InpaCare API ready");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
async fn health(State(state): State<AppState>) -> Response {
    match sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
    {
        Ok(_) => Json(json!({"status":"ok","database":"connected"})).into_response(),
        Err(_) => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"status":"unavailable"})),
        )
            .into_response(),
    }
}
async fn headers(request: axum::extract::Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let status = response.status();
    if status.is_client_error()
        && !response
            .headers()
            .get(header::CONTENT_TYPE)
            .is_some_and(|v| v.to_str().is_ok_and(|s| s.starts_with("application/json")))
    {
        let code = if status == axum::http::StatusCode::UNPROCESSABLE_ENTITY {
            "VALIDATION_FAILED"
        } else {
            "INVALID_REQUEST"
        };
        response=(status,Json(json!({"error":{"code":code,"message":"Format permintaan tidak valid. Periksa kembali isian Anda."}}))).into_response();
    }
    for (name, value) in [
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
        ("referrer-policy", "same-origin"),
        ("cache-control", "no-store"),
    ] {
        response.headers_mut().insert(
            axum::http::HeaderName::from_static(name),
            HeaderValue::from_static(value),
        );
    }
    response.headers_mut().remove(header::SERVER);
    response
}
