use crate::{
    auth::AuthUser,
    db,
    error::{AppError, AppResult},
    AppState,
};
use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Row};

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct TaskRow {
    id: String,
    title: String,
    description: String,
    notes: String,
    patient_id: String,
    patient_name: String,
    medical_record_no: String,
    room_id: String,
    room_name: String,
    pic_id: String,
    pic_name: String,
    priority: String,
    status: String,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
    version: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListQuery {
    search: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    room_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateTask {
    patient_id: String,
    placement_id: String,
    pic_id: String,
    title: String,
    description: Option<String>,
    notes: Option<String>,
    priority: String,
    starts_at: String,
    ends_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateTask {
    expected_version: i32,
    status: Option<String>,
    notes: Option<String>,
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReasonBody {
    expected_version: i32,
    reason: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReassignBody {
    expected_version: i32,
    pic_id: String,
    reason: String,
}

#[derive(FromRow)]
struct LockedTask {
    pic_id: String,
    title: String,
    notes: String,
    status: String,
    version: i32,
    deleted_at: Option<DateTime<Utc>>,
}

fn parse_instant(value: &str, label: &str) -> AppResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&Utc))
        .map_err(|_| {
            AppError::validation(format!(
                "{label} harus berformat waktu ISO 8601 dengan zona waktu."
            ))
        })
}

fn status_allowed(current: &str, next: &str, coordinator: bool) -> bool {
    if coordinator && next == "cancelled" {
        return matches!(current, "todo" | "in_progress");
    }
    matches!(
        (current, next),
        ("todo", "in_progress") | ("in_progress", "done")
    )
}

fn coordinator(actor: &AuthUser) -> bool {
    actor.role == "PERAWAT" && actor.coordinator
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tasks", get(list).post(create))
        .route(
            "/tasks/{id}",
            get(detail).patch(update).delete(logical_delete),
        )
        .route("/tasks/{id}/history", get(history))
        .route("/tasks/{id}/reassign", post(reassign))
}

async fn list(
    State(state): State<AppState>,
    actor: AuthUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<serde_json::Value>> {
    if actor.role != "PERAWAT" {
        return Err(AppError::forbidden());
    }
    let limit = q.limit.unwrap_or(50).clamp(1, 100);
    let search = q.search.as_deref().unwrap_or("").trim();
    if q.status
        .as_deref()
        .is_some_and(|s| !matches!(s, "todo" | "in_progress" | "done" | "cancelled"))
        || q.priority
            .as_deref()
            .is_some_and(|s| !matches!(s, "low" | "normal" | "high"))
    {
        return Err(AppError::validation("Filter tugas tidak valid."));
    }
    let rows = sqlx::query_as::<_, TaskRow>(
        "SELECT t.id,t.title,t.description,t.notes,t.patient_id,p.name AS patient_name,p.medical_record_no,
                t.room_id,r.name AS room_name,t.pic_id,u.name AS pic_name,t.priority,t.status,t.starts_at,t.ends_at,t.version
         FROM tasks t JOIN patients p ON p.id=t.patient_id JOIN rooms r ON r.id=t.room_id JOIN users u ON u.id=t.pic_id
         WHERE t.deleted_at IS NULL AND ($1 OR t.pic_id=$2)
           AND ($3='' OR p.name ILIKE '%'||$3||'%' OR t.title ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%')
           AND ($4::text IS NULL OR t.status=$4) AND ($5::text IS NULL OR t.priority=$5)
           AND ($6::text IS NULL OR t.room_id=$6)
         ORDER BY t.starts_at,t.id LIMIT $7 OFFSET $8")
        .bind(coordinator(&actor)).bind(&actor.id).bind(search)
        .bind(q.status.as_deref()).bind(q.priority.as_deref()).bind(q.room_id.as_deref()).bind(limit).bind(q.offset.unwrap_or(0).clamp(0,100_000))
        .fetch_all(&state.pool).await?;
    let summary:serde_json::Value=sqlx::query_scalar("SELECT jsonb_build_object('total',count(*) FILTER(WHERE $4::text IS NULL OR t.status=$4),'counts',jsonb_build_object('todo',count(*) FILTER(WHERE t.status='todo'),'in_progress',count(*) FILTER(WHERE t.status='in_progress'),'done',count(*) FILTER(WHERE t.status='done'),'cancelled',count(*) FILTER(WHERE t.status='cancelled'))) FROM tasks t JOIN patients p ON p.id=t.patient_id WHERE t.deleted_at IS NULL AND ($1 OR t.pic_id=$2) AND ($3='' OR p.name ILIKE '%'||$3||'%' OR t.title ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%') AND ($5::text IS NULL OR t.priority=$5) AND ($6::text IS NULL OR t.room_id=$6)")
        .bind(coordinator(&actor)).bind(&actor.id).bind(search).bind(q.status.as_deref()).bind(q.priority.as_deref()).bind(q.room_id.as_deref()).fetch_one(&state.pool).await?;
    Ok(Json(
        serde_json::json!({"items": rows, "total": summary["total"],"counts":summary["counts"]}),
    ))
}

async fn create(
    State(state): State<AppState>,
    actor: AuthUser,
    Json(body): Json<CreateTask>,
) -> AppResult<Json<TaskRow>> {
    actor.require_coordinator()?;
    db::nonempty(&body.title, "Judul", 150)?;
    if body
        .description
        .as_ref()
        .is_some_and(|v| v.chars().count() > 5000)
        || body
            .notes
            .as_ref()
            .is_some_and(|v| v.chars().count() > 3000)
    {
        return Err(AppError::validation(
            "Deskripsi maksimal 5000 karakter dan catatan maksimal 3000 karakter.",
        ));
    }
    db::nonempty(&body.patient_id, "Pasien", 36)?;
    db::nonempty(&body.placement_id, "Penempatan", 36)?;
    if !matches!(body.priority.as_str(), "low" | "normal" | "high") {
        return Err(AppError::validation("Prioritas tugas tidak valid."));
    }
    let starts = parse_instant(&body.starts_at, "Waktu mulai")?;
    let ends = parse_instant(&body.ends_at, "Waktu selesai")?;
    if ends < starts {
        return Err(AppError::validation(
            "Waktu selesai tidak boleh sebelum waktu mulai.",
        ));
    }
    crate::access::can_read_patient(&state.pool, &actor, &body.patient_id).await?;
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT id FROM patients WHERE id=$1 FOR UPDATE")
        .bind(&body.patient_id)
        .fetch_one(&mut *tx)
        .await?;
    let valid_pic: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM nurses n JOIN users u ON u.id=n.user_id WHERE n.user_id=$1 AND n.active AND u.active AND u.role='PERAWAT')")
        .bind(&body.pic_id).fetch_one(&mut *tx).await?;
    if !valid_pic {
        return Err(AppError::validation("PIC harus perawat aktif."));
    }
    let placement: Option<(String, String)> = sqlx::query_as(
        "SELECT room_id,patient_id FROM placements WHERE id=$1 AND status='active' AND patient_id=$2
           AND starts_on <= ($3 AT TIME ZONE 'Asia/Jakarta')::date AND ends_on >= ($4 AT TIME ZONE 'Asia/Jakarta')::date AND NOT EXISTS(SELECT 1 FROM cycles c WHERE c.placement_id=placements.id AND c.status='released') FOR UPDATE")
        .bind(&body.placement_id).bind(&body.patient_id).bind(starts).bind(ends).fetch_optional(&mut *tx).await?;
    let Some((room_id, patient_id)) = placement else {
        return Err(AppError::validation(
            "Pilih penempatan aktif yang mencakup seluruh waktu tugas.",
        ));
    };
    let id = db::id();
    sqlx::query("INSERT INTO tasks(id,patient_id,room_id,placement_id,pic_id,created_by,title,description,notes,starts_at,ends_at,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)")
        .bind(&id).bind(patient_id).bind(room_id).bind(&body.placement_id).bind(&body.pic_id).bind(&actor.id)
        .bind(body.title.trim()).bind(body.description.as_deref().unwrap_or("").trim()).bind(body.notes.as_deref().unwrap_or("").trim())
        .bind(starts).bind(ends).bind(&body.priority).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'created',NULL,NULL,jsonb_build_object('status','todo','picId',$4::text))")
        .bind(db::id()).bind(&id).bind(&actor.id).bind(&body.pic_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(fetch_row(&state.pool, &actor, &id).await?))
}

async fn load_locked(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    id: &str,
) -> AppResult<LockedTask> {
    sqlx::query_as::<_, LockedTask>(
        "SELECT pic_id,title,notes,status,version,deleted_at FROM tasks WHERE id=$1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(AppError::not_found)
}

async fn require_visible_task(
    pool: &PgPool,
    actor: &AuthUser,
    id: &str,
    include_deleted: bool,
) -> AppResult<()> {
    if actor.role != "PERAWAT" {
        return Err(AppError::forbidden());
    }
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tasks WHERE id=$1 AND ($2 OR pic_id=$3) AND (deleted_at IS NULL OR ($2 AND $4)))")
        .bind(id).bind(coordinator(actor)).bind(&actor.id).bind(include_deleted).fetch_one(pool).await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::not_found())
    }
}

async fn detail(
    State(state): State<AppState>,
    actor: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<TaskRow>> {
    require_visible_task(&state.pool, &actor, &id, false).await?;
    Ok(Json(fetch_row(&state.pool, &actor, &id).await?))
}

async fn fetch_row(pool: &PgPool, actor: &AuthUser, id: &str) -> AppResult<TaskRow> {
    sqlx::query_as::<_,TaskRow>("SELECT t.id,t.title,t.description,t.notes,t.patient_id,p.name AS patient_name,p.medical_record_no,t.room_id,r.name AS room_name,t.pic_id,u.name AS pic_name,t.priority,t.status,t.starts_at,t.ends_at,t.version FROM tasks t JOIN patients p ON p.id=t.patient_id JOIN rooms r ON r.id=t.room_id JOIN users u ON u.id=t.pic_id WHERE t.id=$1 AND t.deleted_at IS NULL AND ($2 OR t.pic_id=$3)")
        .bind(id).bind(coordinator(actor)).bind(&actor.id).fetch_optional(pool).await?.ok_or_else(AppError::not_found)
}

async fn update(
    State(state): State<AppState>,
    actor: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateTask>,
) -> AppResult<Json<TaskRow>> {
    if actor.role != "PERAWAT" {
        return Err(AppError::forbidden());
    }
    let mut tx = state.pool.begin().await?;
    let task = load_locked(&mut tx, &id).await?;
    let is_coordinator = coordinator(&actor);
    if task.deleted_at.is_some() || (!is_coordinator && task.pic_id != actor.id) {
        return Err(AppError::not_found());
    }
    if task.version != body.expected_version {
        return Err(AppError::conflict(
            "Tugas berubah. Muat ulang sebelum menyimpan.",
        ));
    }
    if let Some(status) = body.status.as_deref() {
        if !status_allowed(&task.status, status, is_coordinator) {
            return Err(AppError::validation(
                "Perubahan status tugas tidak diizinkan.",
            ));
        }
        if status == "cancelled"
            && (!is_coordinator || body.reason.as_deref().unwrap_or("").trim().is_empty())
        {
            return Err(AppError::validation(
                "Pembatalan memerlukan alasan koordinator.",
            ));
        }
    }
    if body.status.is_none() && body.notes.is_none() {
        return Err(AppError::validation("Tidak ada perubahan tugas."));
    }
    let reason = body
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let new_status = body.status.as_deref().unwrap_or(&task.status);
    let new_notes = body.notes.as_deref().unwrap_or(&task.notes);
    if new_notes.chars().count() > 3000
        || body
            .reason
            .as_ref()
            .is_some_and(|v| v.chars().count() > 500)
    {
        return Err(AppError::validation(
            "Catatan maksimal 3000 karakter dan alasan maksimal 500 karakter.",
        ));
    }
    sqlx::query(
        "UPDATE tasks SET status=$2,notes=$3,version=version+1,updated_at=now() WHERE id=$1",
    )
    .bind(&id)
    .bind(new_status)
    .bind(new_notes)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'updated',$4,jsonb_build_object('status',$5::text,'notes',$6::text,'version',$7::int),jsonb_build_object('status',$8::text,'notes',$9::text,'version',$7::int+1))")
        .bind(db::id()).bind(&id).bind(&actor.id).bind(reason).bind(&task.status).bind(&task.notes).bind(task.version).bind(new_status).bind(new_notes).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(fetch_row(&state.pool, &actor, &id).await?))
}

async fn logical_delete(
    State(state): State<AppState>,
    actor: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<ReasonBody>,
) -> AppResult<Json<serde_json::Value>> {
    actor.require_coordinator()?;
    db::nonempty(&body.reason, "Alasan", 500)?;
    let mut tx = state.pool.begin().await?;
    let task = load_locked(&mut tx, &id).await?;
    if task.deleted_at.is_some() {
        return Err(AppError::not_found());
    }
    if task.version != body.expected_version {
        return Err(AppError::conflict(
            "Tugas berubah. Muat ulang sebelum menghapus.",
        ));
    }
    sqlx::query("UPDATE tasks SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'deleted',$4,jsonb_build_object('title',$5::text,'status',$6::text,'version',$7::int),jsonb_build_object('deleted',true,'version',$7::int+1))")
        .bind(db::id()).bind(&id).bind(&actor.id).bind(body.reason.trim()).bind(&task.title).bind(&task.status).bind(task.version).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(serde_json::json!({"deleted":true})))
}

async fn reassign(
    State(state): State<AppState>,
    actor: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<ReassignBody>,
) -> AppResult<Json<TaskRow>> {
    actor.require_coordinator()?;
    db::nonempty(&body.reason, "Alasan pengalihan", 500)?;
    if body.pic_id == actor.id {
        return Err(AppError::validation(
            "Koordinator tidak dapat ditetapkan sebagai PIC.",
        ));
    }
    let mut tx = state.pool.begin().await?;
    let task = load_locked(&mut tx, &id).await?;
    if task.deleted_at.is_some() {
        return Err(AppError::not_found());
    }
    if task.version != body.expected_version {
        return Err(AppError::conflict(
            "Tugas berubah. Muat ulang sebelum mengalihkan.",
        ));
    }
    if task.status == "done" || task.status == "cancelled" {
        return Err(AppError::validation(
            "Tugas selesai atau dibatalkan tidak dapat dialihkan.",
        ));
    }
    let valid_pic: bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM nurses n JOIN users u ON u.id=n.user_id WHERE n.user_id=$1 AND n.active AND u.active AND u.role='PERAWAT')").bind(&body.pic_id).fetch_one(&mut *tx).await?;
    if !valid_pic {
        return Err(AppError::validation("PIC harus perawat aktif."));
    }
    sqlx::query("UPDATE tasks SET pic_id=$2,version=version+1,updated_at=now() WHERE id=$1")
        .bind(&id)
        .bind(&body.pic_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO task_history(id,task_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'reassigned',$4,jsonb_build_object('picId',$5::text,'version',$6::int),jsonb_build_object('picId',$7::text,'version',$6::int+1))")
        .bind(db::id()).bind(&id).bind(&actor.id).bind(body.reason.trim()).bind(&task.pic_id).bind(task.version).bind(&body.pic_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(fetch_row(&state.pool, &actor, &id).await?))
}

async fn history(
    State(state): State<AppState>,
    actor: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_visible_task(&state.pool, &actor, &id, true).await?;
    let rows=sqlx::query("SELECT h.id,h.actor_id AS actor_id,u.name AS actor_name,h.action,h.reason,h.before_data,h.after_data,h.created_at FROM task_history h JOIN users u ON u.id=h.actor_id JOIN tasks t ON t.id=h.task_id WHERE h.task_id=$1 AND ($2 OR (t.pic_id=$3 AND t.deleted_at IS NULL)) ORDER BY h.created_at,h.id LIMIT 500")
        .bind(id).bind(coordinator(&actor)).bind(&actor.id).fetch_all(&state.pool).await?;
    let items=rows.iter().map(|r|serde_json::json!({"id":r.get::<String,_>("id"),"actorId":r.get::<String,_>("actor_id"),"actorName":r.get::<String,_>("actor_name"),"action":r.get::<String,_>("action"),"reason":r.try_get::<Option<String>,_>("reason").ok().flatten(),"before":r.get::<Option<serde_json::Value>,_>("before_data"),"after":r.get::<serde_json::Value,_>("after_data"),"createdAt":r.get::<DateTime<Utc>,_>("created_at")})).collect::<Vec<_>>();
    Ok(Json(serde_json::json!({"items":items,"total":items.len()})))
}
