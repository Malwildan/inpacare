use crate::{
    db::nonempty,
    error::{AppError, AppResult},
    AppState,
};
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::{
    extract::{FromRequestParts, State},
    http::{header, request::Parts, HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use chrono::{Duration, Utc};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration as StdDuration, Instant},
};

const SESSION_LIFETIME: Duration = Duration::days(30);
const MAX_LOGIN_ATTEMPTS: u32 = 10;
const MAX_TRACKED_USERS: usize = 1000;
const LOGIN_WINDOW: StdDuration = StdDuration::from_secs(900);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: String,
    pub username: String,
    pub name: String,
    pub role: String,
    pub coordinator: bool,
    pub csrf_token: String,
}
impl AuthUser {
    pub fn require_roles(&self, roles: &[&str]) -> AppResult<()> {
        if roles.contains(&self.role.as_str()) {
            Ok(())
        } else {
            Err(AppError::forbidden())
        }
    }
    pub fn require_coordinator(&self) -> AppResult<()> {
        if self.is_nurse() && self.coordinator {
            Ok(())
        } else {
            Err(AppError::forbidden())
        }
    }
    pub fn is_nurse(&self) -> bool {
        self.role == "PERAWAT"
    }
    pub fn is_doctor(&self) -> bool {
        self.role == "DOKTER"
    }
    pub fn is_admission(&self) -> bool {
        self.role == "ADMISI"
    }
}
pub fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|c| {
            let (key, value) = c.trim().split_once('=')?;
            (key == name).then(|| value.to_string())
        })
}
fn header_first<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(str::trim)
        .filter(|v| !v.is_empty())
}
fn digest(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
fn token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}
fn check_origin(headers: &HeaderMap) -> AppResult<()> {
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(AppError::forbidden)?;
    let uri = origin
        .parse::<axum::http::Uri>()
        .map_err(|_| AppError::forbidden())?;
    let host = header_first(headers, "x-forwarded-host")
        .or_else(|| header_first(headers, header::HOST.as_str()))
        .ok_or_else(AppError::forbidden)?;
    if uri.authority().map(|a| a.as_str()) != Some(host)
        || !matches!(uri.scheme_str(), Some("http" | "https"))
    {
        return Err(AppError::forbidden());
    }
    Ok(())
}
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let session = cookie(&parts.headers, "session").ok_or_else(AppError::unauthorized)?;
        if session.len() != 64 {
            return Err(AppError::unauthorized());
        }
        let row=sqlx::query("SELECT u.id,u.username,u.name,u.role,u.coordinator,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND (u.role<>'PERAWAT' OR EXISTS(SELECT 1 FROM nurses n WHERE n.user_id=u.id AND n.active))")
   .bind(digest(&session)).fetch_optional(&state.pool).await?.ok_or_else(AppError::unauthorized)?;
        let user = Self {
            id: row.get("id"),
            username: row.get("username"),
            name: row.get("name"),
            role: row.get("role"),
            coordinator: row.get("coordinator"),
            csrf_token: row.get("csrf_token"),
        };
        if !matches!(parts.method, Method::GET | Method::HEAD | Method::OPTIONS) {
            check_origin(&parts.headers)?;
            if parts
                .headers
                .get("x-csrf-token")
                .and_then(|v| v.to_str().ok())
                != Some(user.csrf_token.as_str())
            {
                return Err(AppError::forbidden());
            }
        }
        Ok(user)
    }
}
pub fn router() -> Router<AppState> {
    Router::new().route("/session", get(current).post(login).delete(logout))
}
async fn current(user: AuthUser) -> Json<serde_json::Value> {
    Json(json!({"user":user}))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Login {
    username: String,
    password: String,
}
type Attempts = HashMap<String, (u32, Instant)>;
static ATTEMPTS: OnceLock<Mutex<Attempts>> = OnceLock::new();

fn is_rate_limited(attempts: &mut Attempts, username: &str) -> bool {
    attempts.retain(|_, (_, time)| time.elapsed() < LOGIN_WINDOW);
    attempts
        .get(username)
        .is_some_and(|(count, _)| *count >= MAX_LOGIN_ATTEMPTS)
}

fn record_failed_attempt(attempts: &mut Attempts, username: String) {
    attempts.retain(|_, (_, time)| time.elapsed() < LOGIN_WINDOW);
    if !attempts.contains_key(&username) && attempts.len() >= MAX_TRACKED_USERS {
        if let Some(oldest_key) = attempts
            .iter()
            .min_by_key(|(_, (_, time))| *time)
            .map(|(k, _)| k.clone())
        {
            attempts.remove(&oldest_key);
        }
    }
    let entry = attempts.entry(username).or_insert((0, Instant::now()));
    entry.0 += 1;
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Login>,
) -> AppResult<Response> {
    check_origin(&headers)?;
    nonempty(&body.username, "ID petugas", 100)?;
    nonempty(&body.password, "Kata sandi", 200)?;
    let username = body.username.trim().to_lowercase();
    {
        let mut attempts = ATTEMPTS
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .map_err(|_| AppError::internal())?;
        if is_rate_limited(&mut attempts, &username) {
            return Err(AppError {
                status: StatusCode::TOO_MANY_REQUESTS,
                code: "RATE_LIMITED",
                message: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.".into(),
            });
        }
    }
    let row=sqlx::query("SELECT id,username,name,role,coordinator,password_hash FROM users u WHERE lower(username)=$1 AND active AND (u.role<>'PERAWAT' OR EXISTS(SELECT 1 FROM nurses n WHERE n.user_id=u.id AND n.active))").bind(&username).fetch_optional(&state.pool).await?;
    let hash: Option<String> = row.as_ref().map(|r| r.get("password_hash"));
    let password = body.password;
    let valid=tokio::task::spawn_blocking(move|| {
  let fallback="$argon2id$v=19$m=19456,t=2,p=1$bm9uZXhpc3RlbnR1c2Vy$+fGzg8LZDE67pwDt2me6EG3HEdcG5lKVLbAzvvB1vzI";
  let parsed=PasswordHash::new(hash.as_deref().unwrap_or(fallback));
  parsed.is_ok_and(|h|Argon2::default().verify_password(password.as_bytes(),&h).is_ok())
 }).await.map_err(|_|AppError::internal())?;
    if !valid || row.is_none() {
        let mut attempts = ATTEMPTS
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .map_err(|_| AppError::internal())?;
        record_failed_attempt(&mut attempts, username);
        return Err(AppError {
            status: StatusCode::UNAUTHORIZED,
            code: "INVALID_CREDENTIALS",
            message: "ID petugas atau kata sandi tidak sesuai.".into(),
        });
    }
    if let Ok(mut attempts) = ATTEMPTS.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        attempts.remove(&username);
    }
    let row = row.unwrap();
    let raw = token();
    let csrf = token();
    let user = AuthUser {
        id: row.get("id"),
        username: row.get("username"),
        name: row.get("name"),
        role: row.get("role"),
        coordinator: row.get("coordinator"),
        csrf_token: csrf.clone(),
    };
    let mut tx = state.pool.begin().await?;
    sqlx::query("DELETE FROM sessions WHERE expires_at<=now() OR token_hash=$1")
        .bind(digest(&cookie(&headers, "session").unwrap_or_default()))
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)",
    )
    .bind(digest(&raw))
    .bind(&user.id)
    .bind(&csrf)
    .bind(Utc::now() + SESSION_LIFETIME)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    let secure = header_first(&headers, "x-forwarded-proto") == Some("https");
    let suffix = if secure { "; Secure" } else { "" };
    let max_age = SESSION_LIFETIME.num_seconds();
    let mut response = Json(json!({"user":user})).into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "session={raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{suffix}"
        ))
        .unwrap(),
    );
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "csrf_token={csrf}; Path=/; SameSite=Lax; Max-Age={max_age}{suffix}"
        ))
        .unwrap(),
    );
    Ok(response)
}
async fn logout(
    State(state): State<AppState>,
    _user: AuthUser,
    headers: HeaderMap,
) -> AppResult<Response> {
    if let Some(session) = cookie(&headers, "session") {
        sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
            .bind(digest(&session))
            .execute(&state.pool)
            .await?;
    }
    let secure = header_first(&headers, "x-forwarded-proto") == Some("https");
    let suffix = if secure { "; Secure" } else { "" };
    let mut response = StatusCode::NO_CONTENT.into_response();
    for (name, http_only) in [("session", "; HttpOnly"), ("csrf_token", "")] {
        response.headers_mut().append(
            header::SET_COOKIE,
            HeaderValue::from_str(&format!(
                "{name}=; Path=/{http_only}; SameSite=Lax; Max-Age=0{suffix}"
            ))
            .unwrap(),
        );
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limiter_scopes_lockout_per_user_and_evicts_oldest_without_global_dos() {
        let mut attempts = Attempts::new();
        for i in 0..(MAX_TRACKED_USERS + 50) {
            record_failed_attempt(&mut attempts, format!("unknown-{i}"));
        }
        assert_eq!(attempts.len(), MAX_TRACKED_USERS);
        assert!(!is_rate_limited(&mut attempts, "hendra"));

        for _ in 0..MAX_LOGIN_ATTEMPTS {
            record_failed_attempt(&mut attempts, "hendra".into());
        }
        assert!(is_rate_limited(&mut attempts, "hendra"));
        assert!(!is_rate_limited(&mut attempts, "dina"));
        attempts.remove("hendra");
        assert!(!is_rate_limited(&mut attempts, "hendra"));
    }

    #[test]
    fn cookie_and_origin_handle_multiple_headers_and_forwarded_chains() {
        let mut headers = HeaderMap::new();
        headers.append(header::COOKIE, HeaderValue::from_static("other=1"));
        headers.append(
            header::COOKIE,
            HeaderValue::from_static("session=abc; csrf_token=xyz"),
        );
        assert_eq!(cookie(&headers, "session").as_deref(), Some("abc"));
        assert_eq!(cookie(&headers, "csrf_token").as_deref(), Some("xyz"));

        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://demo.example.com"),
        );
        headers.insert(
            "x-forwarded-host",
            HeaderValue::from_static("demo.example.com, internal-proxy:3000"),
        );
        assert!(check_origin(&headers).is_ok());
    }
}
