use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;

use crate::{
    auth::AuthUser,
    db,
    error::{AppError, AppResult},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/occupancy", get(occupancy))
        .route("/placements", post(create))
}

fn validate_span(starts_on: NaiveDate, ends_on: NaiveDate) -> AppResult<i64> {
    let span = (ends_on - starts_on).num_days();
    if span < 0 {
        return Err(AppError::validation(
            "Tanggal selesai tidak boleh sebelum tanggal masuk.",
        ));
    }
    if span > 365 {
        return Err(AppError::validation(
            "Rentang penempatan maksimal satu tahun.",
        ));
    }
    Ok(span)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DateRange {
    from: NaiveDate,
    to: NaiveDate,
    room_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewPlacement {
    patient_id: String,
    room_id: String,
    starts_on: NaiveDate,
    ends_on: NaiveDate,
}

async fn occupancy(
    State(state): State<AppState>,
    user: AuthUser,
    Query(range): Query<DateRange>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["DOKTER", "PERAWAT", "ADMISI"])?;
    if range.to < range.from || (range.to - range.from).num_days() > 30 {
        return Err(AppError::validation("Rentang kalender maksimal 31 hari."));
    }
    let rows = sqlx::query_scalar::<_, Value>(
        "SELECT jsonb_build_object('id',p.id,'patientId',p.patient_id,'patientName',pt.name,'medicalRecordNo',pt.medical_record_no,'roomId',p.room_id,'roomName',r.name,'roomClass',r.room_class,'startsOn',p.starts_on,'endsOn',p.ends_on,'status',p.status,'version',p.version) \
         FROM placements p JOIN patients pt ON pt.id=p.patient_id JOIN rooms r ON r.id=p.room_id \
         WHERE p.status='active' AND p.starts_on<=$4 AND p.ends_on >= $3 AND ($5::text IS NULL OR p.room_id=$5) \
           AND ($1<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.patient_id AND c.doctor_id=$2)) \
         ORDER BY r.name,p.starts_on,pt.name LIMIT 500"
    ).bind(&user.role).bind(&user.id).bind(range.from).bind(range.to).bind(range.room_id.as_deref()).fetch_all(&state.pool).await?;
    Ok(Json(json!({"items":rows,"from":range.from,"to":range.to})))
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(input): Json<NewPlacement>,
) -> AppResult<(axum::http::StatusCode, Json<Value>)> {
    user.require_roles(&["PERAWAT"])?;
    validate_span(input.starts_on, input.ends_on)?;
    let mut tx = state.pool.begin().await?;
    // Lock patient then room for every writer, so duplicate bookings and
    // room-capacity races serialize in the same order.
    let patient = sqlx::query("SELECT id FROM patients WHERE id=$1 FOR UPDATE")
        .bind(&input.patient_id)
        .fetch_optional(&mut *tx)
        .await?;
    if patient.is_none() {
        return Err(AppError::not_found());
    }
    let room = sqlx::query("SELECT id,capacity,status FROM rooms WHERE id=$1 FOR UPDATE")
        .bind(&input.room_id)
        .fetch_optional(&mut *tx)
        .await?;
    let Some(room) = room else {
        return Err(AppError::not_found());
    };
    let capacity: i32 = room.try_get("capacity")?;
    let status: String = room.try_get("status")?;
    if status != "available" {
        return Err(AppError::conflict(
            "Ruangan tidak tersedia untuk penempatan.",
        ));
    }
    let patient_overlap = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM placements WHERE patient_id=$1 AND status='active' AND starts_on<=$3 AND ends_on >= $2)")
        .bind(&input.patient_id).bind(input.starts_on).bind(input.ends_on).fetch_one(&mut *tx).await?;
    if patient_overlap {
        return Err(AppError::conflict(
            "Pasien sudah memiliki penempatan pada rentang tanggal tersebut.",
        ));
    }
    let peak: i64 = sqlx::query_scalar(
        "SELECT COALESCE(max(day_count),0)::bigint FROM (SELECT d.day::date AS day,count(p.id) AS day_count FROM generate_series($2::timestamp,$3::timestamp,interval '1 day') d(day) LEFT JOIN placements p ON p.room_id=$1 AND p.status='active' AND p.starts_on<=d.day::date AND p.ends_on>=d.day::date GROUP BY d.day::date) days"
    ).bind(&input.room_id).bind(input.starts_on).bind(input.ends_on).fetch_one(&mut *tx).await?;
    if peak >= i64::from(capacity) {
        return Err(AppError::conflict(
            "Kapasitas ruangan tidak mencukupi pada sebagian rentang tanggal.",
        ));
    }
    let id = db::id();
    sqlx::query("INSERT INTO placements(id,patient_id,room_id,starts_on,ends_on,status,created_by) VALUES($1,$2,$3,$4,$5,'active',$6)")
        .bind(&id).bind(&input.patient_id).bind(&input.room_id).bind(input.starts_on).bind(input.ends_on).bind(&user.id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(
            json!({"id":id,"patientId":input.patient_id,"roomId":input.room_id,"startsOn":input.starts_on,"endsOn":input.ends_on,"status":"active","version":1}),
        ),
    ))
}

#[cfg(test)]
mod tests {
    use super::validate_span;
    use crate::error::AppError;
    #[test]
    fn placement_date_validation_accepts_single_day_and_rejects_invalid_intervals() {
        let start = chrono::NaiveDate::from_ymd_opt(2026, 10, 20).unwrap();
        assert_eq!(validate_span(start, start).unwrap(), 0);
        assert_eq!(
            validate_span(start, start + chrono::Duration::days(365)).unwrap(),
            365
        );
        assert!(matches!(
            validate_span(start, start - chrono::Duration::days(1)),
            Err(AppError {
                code: "VALIDATION_FAILED",
                ..
            })
        ));
        assert!(validate_span(start, start + chrono::Duration::days(366)).is_err());
    }
}
