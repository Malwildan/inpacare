use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
    AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateCycle {
    patient_id: String,
    doctor_id: String,
    placement_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChangeStatus {
    status: String,
    expected_version: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateRequest {
    kind: String,
    requested_end: Option<NaiveDate>,
    reason: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DecideRequest {
    decision: String,
    note: String,
    expected_version: i32,
}

fn can_transition_cycle(current: &str, next: &str) -> bool {
    matches!(
        (current, next),
        ("pending", "assigned") | ("assigned", "in_care")
    )
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/cycles", get(list).post(create))
        .route("/cycles/{id}", get(detail).patch(update_status))
        .route("/cycles/{id}/requests", post(request_change))
        .route("/cycles/{id}/requests/{request_id}/decision", post(decide))
}

async fn list(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let rows: Vec<Value> = if user.is_doctor() {
        sqlx::query_scalar("SELECT jsonb_build_object('id',c.id,'patientId',c.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',c.placement_id,'room',r.name,'doctorName',d.name,'nurseName',n.name,'status',c.status,'version',c.version,'createdAt',c.created_at,'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'requestedEnd',q.requested_end,'reason',q.reason,'requestedBy',ru.name,'status',q.status,'note',q.decision_note,'createdAt',q.created_at) ORDER BY q.created_at DESC) FROM cycle_requests q JOIN users ru ON ru.id=q.requested_by WHERE q.cycle_id=c.id), '[]'::jsonb)) FROM cycles c JOIN patients p ON p.id=c.patient_id JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id LEFT JOIN placements pl ON pl.id=c.placement_id LEFT JOIN rooms r ON r.id=pl.room_id WHERE c.doctor_id=$1 ORDER BY c.created_at DESC LIMIT 100")
            .bind(&user.id).fetch_all(&state.pool).await?
    } else if user.is_nurse() {
        sqlx::query_scalar("SELECT jsonb_build_object('id',c.id,'patientId',c.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',c.placement_id,'room',r.name,'doctorName',d.name,'nurseName',n.name,'status',c.status,'version',c.version,'createdAt',c.created_at,'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'requestedEnd',q.requested_end,'reason',q.reason,'requestedBy',ru.name,'status',q.status,'note',q.decision_note,'createdAt',q.created_at) ORDER BY q.created_at DESC) FROM cycle_requests q JOIN users ru ON ru.id=q.requested_by WHERE q.cycle_id=c.id), '[]'::jsonb)) FROM cycles c JOIN patients p ON p.id=c.patient_id JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id LEFT JOIN placements pl ON pl.id=c.placement_id LEFT JOIN rooms r ON r.id=pl.room_id WHERE c.nurse_id=$1 ORDER BY c.created_at DESC LIMIT 100")
            .bind(&user.id).fetch_all(&state.pool).await?
    } else {
        return Err(AppError::forbidden());
    };
    Ok(Json(json!({"items": rows, "total": rows.len()})))
}

async fn detail(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    let row: Option<Value> = sqlx::query_scalar("SELECT jsonb_build_object('id',c.id,'patientId',c.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',c.placement_id,'room',r.name,'doctorId',c.doctor_id,'doctorName',d.name,'nurseId',c.nurse_id,'nurseName',n.name,'status',c.status,'version',c.version,'createdAt',c.created_at,'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'requestedEnd',q.requested_end,'reason',q.reason,'requestedBy',ru.name,'status',q.status,'decidedBy',du.name,'note',q.decision_note,'createdAt',q.created_at,'decidedAt',q.decided_at) ORDER BY q.created_at DESC) FROM cycle_requests q JOIN users ru ON ru.id=q.requested_by LEFT JOIN users du ON du.id=q.decided_by WHERE q.cycle_id=c.id), '[]'::jsonb)) FROM cycles c JOIN patients p ON p.id=c.patient_id JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id LEFT JOIN placements pl ON pl.id=c.placement_id LEFT JOIN rooms r ON r.id=pl.room_id WHERE c.id=$1 AND (($2='DOKTER' AND c.doctor_id=$3) OR ($2='PERAWAT' AND c.nurse_id=$3))")
        .bind(id).bind(&user.role).bind(&user.id).fetch_optional(&state.pool).await?;
    row.map(Json).ok_or_else(AppError::not_found)
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(input): Json<CreateCycle>,
) -> AppResult<(axum::http::StatusCode, Json<Value>)> {
    if !user.is_nurse() {
        return Err(AppError::forbidden());
    }
    crate::access::can_read_patient(&state.pool, &user, &input.patient_id).await?;
    let doctor = sqlx::query_scalar::<_, String>(
        "SELECT id FROM users WHERE id=$1 AND role='DOKTER' AND active",
    )
    .bind(&input.doctor_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::validation("Pilih dokter aktif."))?;
    if let Some(placement) = &input.placement_id {
        sqlx::query("SELECT id FROM placements WHERE id=$1 AND patient_id=$2 AND status='active'")
            .bind(placement)
            .bind(&input.patient_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(AppError::not_found)?;
    }
    let id = crate::db::id();
    let row = sqlx::query_scalar::<_, Value>("WITH inserted AS (INSERT INTO cycles(id,patient_id,placement_id,doctor_id,nurse_id) VALUES($1,$2,$3,$4,$5) RETURNING *) SELECT jsonb_build_object('id',inserted.id,'patientId',inserted.patient_id,'placementId',inserted.placement_id,'doctorId',inserted.doctor_id,'nurseId',inserted.nurse_id,'status',inserted.status,'version',inserted.version) FROM inserted")
        .bind(id).bind(input.patient_id).bind(input.placement_id).bind(doctor).bind(&user.id).fetch_one(&state.pool).await?;
    Ok((axum::http::StatusCode::CREATED, Json(row)))
}

async fn update_status(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(input): Json<ChangeStatus>,
) -> AppResult<Json<Value>> {
    if !user.is_nurse() {
        return Err(AppError::forbidden());
    }
    let mut tx = state.pool.begin().await?;
    let current = sqlx::query_as::<_, (String, i32, Option<String>)>(
        "SELECT status,version,placement_id FROM cycles WHERE id=$1 AND nurse_id=$2 FOR UPDATE",
    )
    .bind(&id)
    .bind(&user.id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(AppError::not_found)?;
    if current.1 != input.expected_version {
        return Err(AppError::conflict(
            "Siklus telah berubah. Muat ulang lalu coba lagi.",
        ));
    }
    if !can_transition_cycle(&current.0, &input.status) {
        return Err(AppError::conflict("Transisi siklus tidak diizinkan."));
    }
    let placement=current.2.as_deref().ok_or_else(||AppError::conflict("Rekap belum memiliki penempatan. Pengaitan penempatan pada rekap yang sudah dibuat belum tersedia pada demo ini."))?;
    let active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM placements WHERE id=$1 AND status='active')",
    )
    .bind(placement)
    .fetch_one(&mut *tx)
    .await?;
    if !active {
        return Err(AppError::conflict(
            "Penempatan pada rekap tidak lagi aktif.",
        ));
    }
    sqlx::query("UPDATE cycles SET status=$1,version=version+1,updated_at=now() WHERE id=$2")
        .bind(&input.status)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"ok":true,"status":input.status,"version":input.expected_version+1}),
    ))
}

#[cfg(test)]
mod tests {
    use super::can_transition_cycle;

    #[test]
    fn cycle_flow_only_moves_forward_through_nurse_states() {
        assert!(can_transition_cycle("pending", "assigned"));
        assert!(can_transition_cycle("assigned", "in_care"));
        assert!(!can_transition_cycle("pending", "in_care"));
        assert!(!can_transition_cycle("in_care", "released"));
        assert!(!can_transition_cycle("released", "pending"));
    }
}

async fn request_change(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(input): Json<CreateRequest>,
) -> AppResult<(axum::http::StatusCode, Json<Value>)> {
    if !user.is_nurse() {
        return Err(AppError::forbidden());
    }
    crate::db::nonempty(&input.reason, "Alasan", 500)?;
    if !matches!(input.kind.as_str(), "extend" | "release") {
        return Err(AppError::validation("Jenis permintaan tidak valid."));
    }
    if (input.kind == "extend") != input.requested_end.is_some() {
        return Err(AppError::validation(
            "Isi tanggal baru hanya untuk permintaan perpanjangan.",
        ));
    }
    let mut tx = state.pool.begin().await?;
    sqlx::query_scalar::<_,String>("SELECT id FROM cycles WHERE id=$1 AND nurse_id=$2 AND status IN ('in_care','extend') FOR UPDATE")
        .bind(&id).bind(&user.id).fetch_optional(&mut *tx).await?.ok_or_else(AppError::not_found)?;
    let row = sqlx::query_scalar::<_, Value>("WITH inserted AS (INSERT INTO cycle_requests(id,cycle_id,kind,requested_end,reason,requested_by) SELECT $1,c.id,$3,$4,$5,$6 FROM cycles c WHERE c.id=$2 AND c.nurse_id=$6 AND c.status IN ('in_care','extend') RETURNING *) SELECT jsonb_build_object('id',inserted.id,'cycleId',inserted.cycle_id,'kind',inserted.kind,'requestedEnd',inserted.requested_end,'reason',inserted.reason,'status',inserted.status) FROM inserted")
        .bind(crate::db::id()).bind(id).bind(&input.kind).bind(input.requested_end).bind(input.reason.trim()).bind(&user.id)
        .fetch_optional(&mut *tx).await.map_err(|error| match &error { sqlx::Error::Database(db) if db.constraint() == Some("cycle_one_pending") => AppError::conflict("Sudah ada permintaan yang menunggu keputusan."), _ => AppError::from(error) })?
        .ok_or_else(AppError::not_found)?;
    tx.commit().await?;
    Ok((axum::http::StatusCode::CREATED, Json(row)))
}

async fn decide(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, request_id)): Path<(String, String)>,
    Json(input): Json<DecideRequest>,
) -> AppResult<Json<Value>> {
    if !user.is_doctor() {
        return Err(AppError::forbidden());
    }
    crate::db::nonempty(&input.note, "Catatan keputusan", 500)?;
    if !matches!(input.decision.as_str(), "approve" | "reject") {
        return Err(AppError::validation("Keputusan tidak valid."));
    }
    let mut tx = state.pool.begin().await?;
    let request = sqlx::query_as::<_, (String, String, Option<NaiveDate>, String)>("SELECT q.kind,q.cycle_id,q.requested_end,c.patient_id FROM cycle_requests q JOIN cycles c ON c.id=q.cycle_id WHERE q.id=$1 AND c.id=$2 AND c.doctor_id=$3 AND q.status='pending' FOR UPDATE OF q,c")
        .bind(&request_id).bind(&id).bind(&user.id).fetch_optional(&mut *tx).await?.ok_or_else(AppError::not_found)?;
    let (kind, cycle_id, requested_end, patient_id) = request;
    let cycle_version = sqlx::query_scalar::<_, i32>("SELECT version FROM cycles WHERE id=$1")
        .bind(&cycle_id)
        .fetch_one(&mut *tx)
        .await?;
    if cycle_version != input.expected_version {
        return Err(AppError::conflict(
            "Siklus telah berubah. Muat ulang lalu coba lagi.",
        ));
    }
    if input.decision == "approve" {
        let placement_id =
            sqlx::query_scalar::<_, Option<String>>("SELECT placement_id FROM cycles WHERE id=$1")
                .bind(&cycle_id)
                .fetch_one(&mut *tx)
                .await?;
        let placement_id =
            placement_id.ok_or_else(|| AppError::conflict("Siklus belum memiliki penempatan."))?;
        let room_id = sqlx::query_scalar::<_, String>("SELECT room_id FROM placements WHERE id=$1")
            .bind(&placement_id)
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query("SELECT id FROM patients WHERE id=$1 FOR UPDATE")
            .bind(&patient_id)
            .fetch_one(&mut *tx)
            .await?;
        let room = sqlx::query_as::<_, (i32, String)>(
            "SELECT capacity,status FROM rooms WHERE id=$1 FOR UPDATE",
        )
        .bind(&room_id)
        .fetch_one(&mut *tx)
        .await?;
        if room.1 != "available" {
            return Err(AppError::conflict(
                "Ruang tidak menerima perubahan penempatan.",
            ));
        }
        let placement = sqlx::query_as::<_, (NaiveDate, NaiveDate)>(
            "SELECT starts_on,ends_on FROM placements WHERE id=$1 AND status='active' FOR UPDATE",
        )
        .bind(&placement_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::conflict("Penempatan tidak lagi aktif."))?;
        match kind.as_str() {
            "extend" => {
                let end = requested_end
                    .ok_or_else(|| AppError::conflict("Tanggal permintaan tidak tersedia."))?;
                if end <= placement.1 {
                    return Err(AppError::conflict(
                        "Tanggal akhir harus melewati jadwal yang berlaku.",
                    ));
                }
                if (end - placement.0).num_days() > 365 {
                    return Err(AppError::validation(
                        "Rentang penempatan maksimal 366 hari.",
                    ));
                }
                let overlaps:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM placements WHERE patient_id=$1 AND id<>$2 AND status='active' AND starts_on<=$3 AND ends_on>$4)").bind(&patient_id).bind(&placement_id).bind(end).bind(placement.1).fetch_one(&mut *tx).await?;
                if overlaps {
                    return Err(AppError::conflict(
                        "Pasien memiliki penempatan lain pada tanggal perpanjangan.",
                    ));
                }
                let max_occupants = sqlx::query_scalar::<_, Option<i64>>("WITH events AS (SELECT GREATEST(starts_on,$2)::date AS day,1::bigint AS delta FROM placements WHERE room_id=$1 AND status='active' AND id<>$4 AND starts_on<=$3 AND ends_on>=$2 UNION ALL SELECT (LEAST(ends_on,$3)+1)::date AS day,-1::bigint AS delta FROM placements WHERE room_id=$1 AND status='active' AND id<>$4 AND starts_on<=$3 AND ends_on>=$2), daily AS (SELECT day,sum(delta) AS change FROM events GROUP BY day), occupancy AS (SELECT sum(change) OVER(ORDER BY day) AS count FROM daily) SELECT max(count)::bigint FROM occupancy")
                    .bind(&room_id).bind(placement.1.succ_opt().unwrap_or(placement.1)).bind(end).bind(&placement_id).fetch_one(&mut *tx).await?;
                if max_occupants.unwrap_or(0) >= i64::from(room.0) {
                    return Err(AppError::conflict(
                        "Ruang sudah penuh pada tanggal perpanjangan.",
                    ));
                }
                sqlx::query("UPDATE placements SET ends_on=$1,version=version+1 WHERE id=$2")
                    .bind(end)
                    .bind(&placement_id)
                    .execute(&mut *tx)
                    .await?;
                sqlx::query("UPDATE cycles SET status='extend',version=version+1,updated_at=now() WHERE id=$1").bind(&cycle_id).execute(&mut *tx).await?;
            }
            "release" => {
                let today = crate::db::today();
                if placement.0 > today {
                    return Err(AppError::conflict(
                        "Penempatan belum dimulai; pelepasan otomatis tidak tersedia.",
                    ));
                }
                let future_tasks = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM tasks WHERE placement_id=$1 AND deleted_at IS NULL AND status NOT IN ('done','cancelled') AND ends_at > now()")
                    .bind(&placement_id).fetch_one(&mut *tx).await?;
                if future_tasks > 0 {
                    return Err(AppError::conflict(
                        "Selesaikan atau batalkan tugas mendatang sebelum pelepasan.",
                    ));
                }
                sqlx::query(
                    "UPDATE placements SET ends_on=LEAST(ends_on,$1),version=version+1 WHERE id=$2",
                )
                .bind(today)
                .bind(&placement_id)
                .execute(&mut *tx)
                .await?;
                sqlx::query("UPDATE cycles SET status='released',version=version+1,updated_at=now() WHERE id=$1").bind(&cycle_id).execute(&mut *tx).await?;
            }
            _ => {
                return Err(AppError::conflict(
                    "Jenis permintaan tidak mendukung keputusan.",
                ))
            }
        }
    } else {
        sqlx::query("UPDATE cycles SET version=version+1,updated_at=now() WHERE id=$1")
            .bind(&cycle_id)
            .execute(&mut *tx)
            .await?;
    }
    let decision_status = if input.decision == "approve" {
        "approved"
    } else {
        "rejected"
    };
    sqlx::query("UPDATE cycle_requests SET status=$1,decided_by=$2,decision_note=$3,decided_at=now() WHERE id=$4")
        .bind(decision_status).bind(&user.id).bind(input.note.trim()).bind(&request_id).execute(&mut *tx).await?;
    let nurse_id = sqlx::query_scalar::<_, String>("SELECT nurse_id FROM cycles WHERE id=$1")
        .bind(&cycle_id)
        .fetch_one(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO notifications(id,user_id,cycle_id,message) VALUES($1,$2,$3,$4)")
        .bind(crate::db::id())
        .bind(nurse_id)
        .bind(&cycle_id)
        .bind(format!(
            "Permintaan {} {}.",
            kind,
            if input.decision == "approve" {
                "disetujui"
            } else {
                "ditolak"
            }
        ))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"ok":true,"status":decision_status,"version":input.expected_version+1}),
    ))
}
