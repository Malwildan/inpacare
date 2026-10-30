use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
    AppState,
};
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notifications", get(list))
        .route("/notifications/{id}/read", post(mark_read))
}

async fn list(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let rows = sqlx::query_scalar::<_, Value>("SELECT jsonb_build_object('id',id,'cycleId',cycle_id,'message',message,'readAt',read_at,'createdAt',created_at) FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50")
        .bind(&user.id).fetch_all(&state.pool).await?;
    let total = rows.len();
    Ok(Json(json!({"items":rows,"total":total})))
}

async fn mark_read(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    let done = sqlx::query(
        "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.pool)
    .await?;
    if done.rows_affected() == 0 {
        return Err(AppError::not_found());
    }
    Ok(Json(json!({"ok":true})))
}
