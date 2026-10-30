use crate::{
    access::can_read_patient,
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
use chrono::{DateTime, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListQuery {
    search: Option<String>,
    limit: Option<i64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateRecord {
    patient_id: String,
    complaint: String,
    diagnosis: String,
    treatment: String,
    notes: Option<String>,
    record_date: NaiveDate,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateRecord {
    expected_version: i32,
    complaint: String,
    diagnosis: String,
    treatment: String,
    notes: Option<String>,
    record_date: NaiveDate,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateObservation {
    symptoms: String,
    nursing_note: Option<String>,
    observed_at: String,
    temperature: Option<f64>,
    systolic: Option<i32>,
    diastolic: Option<i32>,
    pulse: Option<i32>,
    respiratory_rate: Option<i32>,
    spo2: Option<f64>,
}

fn validate_vitals(body: &CreateObservation) -> AppResult<()> {
    for (name, value, max) in [
        ("suhu", body.temperature, 100.0),
        ("saturasi oksigen", body.spo2, 100.0),
    ] {
        if let Some(v) = value {
            if !v.is_finite() || v < 0.0 || v > max {
                return Err(AppError::validation(format!(
                    "{name} harus berada dalam rentang 0–{max}."
                )));
            }
        }
    }
    for (name, value) in [
        ("tekanan sistolik", body.systolic),
        ("tekanan diastolik", body.diastolic),
        ("denyut nadi", body.pulse),
        ("laju pernapasan", body.respiratory_rate),
    ] {
        if value.is_some_and(|v| v < 0) {
            return Err(AppError::validation(format!("{name} tidak boleh negatif.")));
        }
    }
    if body.systolic.is_some() != body.diastolic.is_some() {
        return Err(AppError::validation(
            "Tekanan darah harus diisi lengkap (sistolik dan diastolik).",
        ));
    }
    Ok(())
}

fn clinical_user(user: &AuthUser) -> AppResult<()> {
    if user.is_admission() {
        return Err(AppError::forbidden());
    }
    crate::access::require_clinical(user)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/medical-records", get(list).post(create))
        .route("/medical-records/{id}", get(detail).patch(update))
        .route("/medical-records/{id}/observations", post(observe))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    clinical_user(&user)?;
    let limit = q.limit.unwrap_or(50).clamp(1, 100);
    let search = q.search.as_deref().unwrap_or("").trim();
    let items:Vec<Value>=sqlx::query_scalar(
      "SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'doctorName',u.name,'recordDate',m.record_date,'diagnosis',m.diagnosis,'treatment',m.treatment,'notes',m.notes,'version',m.version,'createdAt',m.created_at,
        'observationCount',(SELECT count(*) FROM observations o WHERE o.record_id=m.id))
       FROM medical_records m JOIN patients p ON p.id=m.patient_id JOIN users u ON u.id=m.doctor_id
       WHERE m.deleted_at IS NULL AND ($1='PERAWAT' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=m.patient_id AND c.doctor_id=$2))
         AND ($3='' OR p.name ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%' OR m.diagnosis ILIKE '%'||$3||'%')
       ORDER BY m.record_date DESC,m.id LIMIT $4")
      .bind(&user.role).bind(&user.id).bind(search).bind(limit).fetch_all(&state.pool).await?;
    let total = items.len();
    Ok(Json(json!({"items":items,"total":total})))
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateRecord>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["DOKTER"])?;
    for (v, n) in [
        (&body.complaint, "Keluhan"),
        (&body.diagnosis, "Diagnosis"),
        (&body.treatment, "Tindakan"),
    ] {
        db::nonempty(v, n, 5000)?;
    }
    can_read_patient(&state.pool, &user, &body.patient_id).await?;
    let id = db::id();
    sqlx::query("INSERT INTO medical_records(id,patient_id,doctor_id,complaint,diagnosis,treatment,notes,record_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
      .bind(&id).bind(&body.patient_id).bind(&user.id).bind(body.complaint.trim()).bind(body.diagnosis.trim()).bind(body.treatment.trim()).bind(body.notes.as_deref().unwrap_or("").trim()).bind(body.record_date).execute(&state.pool).await?;
    detail_by_id(&state, &user, &id).await
}

async fn detail(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    detail_by_id(&state, &user, &id).await
}

async fn detail_by_id(state: &AppState, user: &AuthUser, id: &str) -> AppResult<Json<Value>> {
    clinical_user(user)?;
    let record:Option<Value>=sqlx::query_scalar(
      "SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'doctorId',m.doctor_id,'doctorName',u.name,'recordDate',m.record_date,'complaint',m.complaint,'diagnosis',m.diagnosis,'treatment',m.treatment,'notes',m.notes,'version',m.version,'createdAt',m.created_at,'updatedAt',m.updated_at,
        'observations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'nurseId',o.nurse_id,'nurseName',nu.name,'symptoms',o.symptoms,'nursingNote',o.nursing_note,'observedAt',o.observed_at,'temperature',v.temperature,'bloodPressure',CASE WHEN v.systolic IS NULL THEN NULL ELSE v.systolic::text||'/'||v.diastolic::text END,'pulse',v.pulse,'respiratoryRate',v.respiratory_rate,'spo2',v.spo2) ORDER BY o.observed_at DESC) FROM observations o JOIN users nu ON nu.id=o.nurse_id LEFT JOIN vital_signs v ON v.observation_id=o.id WHERE o.record_id=m.id),'[]'::jsonb))
       FROM medical_records m JOIN patients p ON p.id=m.patient_id JOIN users u ON u.id=m.doctor_id
       WHERE m.id=$1 AND m.deleted_at IS NULL AND ($2='PERAWAT' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=m.patient_id AND c.doctor_id=$3))")
      .bind(id).bind(&user.role).bind(&user.id).fetch_optional(&state.pool).await?;
    record.map(Json).ok_or_else(AppError::not_found)
}

async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateRecord>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["DOKTER"])?;
    for (v, n) in [
        (&body.complaint, "Keluhan"),
        (&body.diagnosis, "Diagnosis"),
        (&body.treatment, "Tindakan"),
    ] {
        db::nonempty(v, n, 5000)?;
    }
    let mut tx = state.pool.begin().await?;
    let row=sqlx::query("SELECT patient_id,doctor_id,version FROM medical_records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE").bind(&id).fetch_optional(&mut *tx).await?.ok_or_else(AppError::not_found)?;
    let patient_id: String = row.get("patient_id");
    let doctor_id: String = row.get("doctor_id");
    let version: i32 = row.get("version");
    if doctor_id != user.id {
        return Err(AppError::forbidden());
    }
    if version != body.expected_version {
        return Err(AppError::conflict(
            "Rekam medis berubah. Muat ulang sebelum menyimpan.",
        ));
    }
    can_read_patient(&state.pool, &user, &patient_id).await?;
    sqlx::query("UPDATE medical_records SET complaint=$2,diagnosis=$3,treatment=$4,notes=$5,record_date=$6,version=version+1,updated_at=now() WHERE id=$1")
      .bind(&id).bind(body.complaint.trim()).bind(body.diagnosis.trim()).bind(body.treatment.trim()).bind(body.notes.as_deref().unwrap_or("").trim()).bind(body.record_date).execute(&mut *tx).await?;
    tx.commit().await?;
    detail_by_id(&state, &user, &id).await
}

async fn observe(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CreateObservation>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["PERAWAT"])?;
    db::nonempty(&body.symptoms, "Gejala", 3000)?;
    validate_vitals(&body)?;
    let observed_at = DateTime::parse_from_rfc3339(&body.observed_at)
        .map(|v| v.with_timezone(&Utc))
        .map_err(|_| AppError::validation("Waktu pemeriksaan harus memakai zona waktu."))?;
    let mut tx = state.pool.begin().await?;
    let patient_id: Option<String> = sqlx::query_scalar(
        "SELECT patient_id FROM medical_records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?;
    let patient_id = patient_id.ok_or_else(AppError::not_found)?;
    can_read_patient(&state.pool, &user, &patient_id).await?;
    let observation_id = db::id();
    sqlx::query("INSERT INTO observations(id,record_id,nurse_id,symptoms,nursing_note,observed_at) VALUES($1,$2,$3,$4,$5,$6)")
      .bind(&observation_id).bind(&id).bind(&user.id).bind(body.symptoms.trim()).bind(body.nursing_note.as_deref().unwrap_or("").trim()).bind(observed_at).execute(&mut *tx).await?;
    let has_vitals = body.temperature.is_some()
        || body.systolic.is_some()
        || body.diastolic.is_some()
        || body.pulse.is_some()
        || body.respiratory_rate.is_some()
        || body.spo2.is_some();
    if has_vitals {
        sqlx::query("INSERT INTO vital_signs(id,observation_id,temperature,systolic,diastolic,pulse,respiratory_rate,spo2) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
        .bind(db::id()).bind(&observation_id).bind(body.temperature).bind(body.systolic).bind(body.diastolic).bind(body.pulse).bind(body.respiratory_rate).bind(body.spo2).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    detail_by_id(&state, &user, &id).await
}
