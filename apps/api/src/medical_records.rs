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
struct NewPatientInput {
    name: String,
    medical_record_no: Option<String>,
    birth_date: NaiveDate,
    gender: String,
    #[serde(default)]
    bpjs: bool,
    bpjs_number: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateRecord {
    patient_id: Option<String>,
    new_patient: Option<NewPatientInput>,
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
struct DeleteRecord {
    expected_version: i32,
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

fn validate_record_fields(
    complaint: &str,
    diagnosis: &str,
    treatment: &str,
    notes: Option<&str>,
) -> AppResult<()> {
    for (v, n) in [
        (complaint, "Keluhan"),
        (diagnosis, "Diagnosis"),
        (treatment, "Tindakan"),
    ] {
        db::nonempty(v, n, 5000)?;
    }
    if notes.is_some_and(|v| v.chars().count() > 5000) {
        return Err(AppError::validation(
            "Catatan medis maksimal 5000 karakter.",
        ));
    }
    Ok(())
}

struct ValidatedNewPatient {
    name: String,
    medical_record_no: Option<String>,
    birth_date: NaiveDate,
    gender: String,
    bpjs: bool,
    bpjs_number: Option<String>,
}

fn validate_new_patient(
    input: &NewPatientInput,
    today: NaiveDate,
) -> AppResult<ValidatedNewPatient> {
    db::nonempty(&input.name, "Nama pasien", 120)?;
    if input.birth_date > today {
        return Err(AppError::validation(
            "Tanggal lahir tidak boleh melebihi tanggal hari ini.",
        ));
    }
    let gender = input.gender.trim();
    if !matches!(gender, "L" | "P") {
        return Err(AppError::validation("Jenis kelamin harus L atau P."));
    }
    let medical_record_no = input
        .medical_record_no
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_uppercase);
    if let Some(ref mrn) = medical_record_no {
        let len = mrn.chars().count();
        if !(3..=40).contains(&len)
            || !mrn
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '/')
        {
            return Err(AppError::validation(
                "Nomor rekam medis harus 3–40 karakter (huruf, angka, atau tanda hubung).",
            ));
        }
    }
    let bpjs_number = input
        .bpjs_number
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);
    if !input.bpjs && bpjs_number.is_some() {
        return Err(AppError::validation(
            "Nomor BPJS hanya dapat diisi untuk pasien peserta BPJS.",
        ));
    }
    if let Some(ref num) = bpjs_number {
        if num.chars().count() > 30
            || !num.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err(AppError::validation(
                "Nomor BPJS maksimal 30 karakter (huruf, angka, atau tanda hubung).",
            ));
        }
    }
    Ok(ValidatedNewPatient {
        name: input.name.trim().to_owned(),
        medical_record_no,
        birth_date: input.birth_date,
        gender: gender.to_owned(),
        bpjs: input.bpjs,
        bpjs_number,
    })
}

fn validate_observation_fields(body: &CreateObservation) -> AppResult<()> {
    db::nonempty(&body.symptoms, "Gejala", 3000)?;
    if body
        .nursing_note
        .as_ref()
        .is_some_and(|v| v.chars().count() > 3000)
    {
        return Err(AppError::validation(
            "Catatan keperawatan maksimal 3000 karakter.",
        ));
    }
    validate_vitals(body)
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
        .route(
            "/medical-records/{id}",
            get(detail).patch(update).delete(logical_delete),
        )
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
    let items: Vec<Value> = sqlx::query_scalar(
      "SELECT jsonb_build_object('id',m.id,'patientId',m.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'doctorId',m.doctor_id,'doctorName',u.name,'recordDate',m.record_date,'diagnosis',m.diagnosis,'treatment',m.treatment,'notes',m.notes,'version',m.version,'createdAt',m.created_at,
        'observationCount',(SELECT count(*) FROM observations o WHERE o.record_id=m.id))
       FROM medical_records m JOIN patients p ON p.id=m.patient_id JOIN users u ON u.id=m.doctor_id
       WHERE m.deleted_at IS NULL AND ($1='PERAWAT' OR m.doctor_id=$2 OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=m.patient_id AND c.doctor_id=$2))
         AND ($3='' OR p.name ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%' OR m.diagnosis ILIKE '%'||$3||'%')
       ORDER BY m.record_date DESC, m.created_at DESC, m.id LIMIT $4")
      .bind(&user.role).bind(&user.id).bind(search).bind(limit).fetch_all(&state.pool).await?;
    let total: i64 = sqlx::query_scalar(
      "SELECT count(*)
       FROM medical_records m JOIN patients p ON p.id=m.patient_id
       WHERE m.deleted_at IS NULL AND ($1='PERAWAT' OR m.doctor_id=$2 OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=m.patient_id AND c.doctor_id=$2))
         AND ($3='' OR p.name ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%' OR m.diagnosis ILIKE '%'||$3||'%')")
      .bind(&user.role).bind(&user.id).bind(search).fetch_one(&state.pool).await?;
    Ok(Json(json!({"items":items,"total":total})))
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateRecord>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["DOKTER"])?;
    validate_record_fields(
        &body.complaint,
        &body.diagnosis,
        &body.treatment,
        body.notes.as_deref(),
    )?;
    let patient_id = body
        .patient_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let validated_new = match (patient_id, body.new_patient.as_ref()) {
        (Some(_), Some(_)) => {
            return Err(AppError::validation(
                "Pilih pasien terdaftar atau isi data pasien baru, bukan keduanya.",
            ));
        }
        (None, None) => {
            return Err(AppError::validation(
                "Pilih pasien yang ditangani atau isi data pasien baru.",
            ));
        }
        (Some(_), None) => None,
        (None, Some(new_patient)) => Some(validate_new_patient(new_patient, db::today())?),
    };

    let mut tx = state.pool.begin().await?;
    let resolved_patient_id = if let Some(existing_id) = patient_id {
        can_read_patient(&mut *tx, &user, existing_id).await?;
        existing_id.to_owned()
    } else {
        let patient = validated_new.expect("validated above");
        let pid = db::id();
        let mrn = if let Some(custom_mrn) = patient.medical_record_no {
            custom_mrn
        } else {
            sqlx::query("SELECT pg_advisory_xact_lock(7231902)")
                .execute(&mut *tx)
                .await?;
            let next_no: i64 = sqlx::query_scalar(
                "SELECT (COALESCE(MAX((substring(medical_record_no FROM '^RM-([0-9]{1,9})$'))::bigint), 4217) + 1)::bigint FROM patients WHERE medical_record_no ~ '^RM-[0-9]{1,9}$'",
            )
            .fetch_one(&mut *tx)
            .await?;
            format!("RM-{next_no:05}")
        };
        let inserted = sqlx::query(
            "INSERT INTO patients(id,medical_record_no,name,birth_date,gender,bpjs,bpjs_number) VALUES($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(&pid)
        .bind(&mrn)
        .bind(&patient.name)
        .bind(patient.birth_date)
        .bind(&patient.gender)
        .bind(patient.bpjs)
        .bind(&patient.bpjs_number)
        .execute(&mut *tx)
        .await;
        match inserted {
            Ok(_) => {}
            Err(sqlx::Error::Database(ref db_err))
                if db_err.code().as_deref() == Some("23505") =>
            {
                return Err(AppError::conflict(
                    "Nomor rekam medis sudah terdaftar pada pasien lain.",
                ));
            }
            Err(err) => return Err(err.into()),
        }
        pid
    };

    let id = db::id();
    sqlx::query("INSERT INTO medical_records(id,patient_id,doctor_id,complaint,diagnosis,treatment,notes,record_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
      .bind(&id).bind(&resolved_patient_id).bind(&user.id).bind(body.complaint.trim()).bind(body.diagnosis.trim()).bind(body.treatment.trim()).bind(body.notes.as_deref().unwrap_or("").trim()).bind(body.record_date).execute(&mut *tx).await?;
    tx.commit().await?;
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
       WHERE m.id=$1 AND m.deleted_at IS NULL AND ($2='PERAWAT' OR m.doctor_id=$3 OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=m.patient_id AND c.doctor_id=$3))")
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
    validate_record_fields(
        &body.complaint,
        &body.diagnosis,
        &body.treatment,
        body.notes.as_deref(),
    )?;
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
    can_read_patient(&mut *tx, &user, &patient_id).await?;
    sqlx::query("UPDATE medical_records SET complaint=$2,diagnosis=$3,treatment=$4,notes=$5,record_date=$6,version=version+1,updated_at=now() WHERE id=$1")
      .bind(&id).bind(body.complaint.trim()).bind(body.diagnosis.trim()).bind(body.treatment.trim()).bind(body.notes.as_deref().unwrap_or("").trim()).bind(body.record_date).execute(&mut *tx).await?;
    tx.commit().await?;
    detail_by_id(&state, &user, &id).await
}

async fn logical_delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<DeleteRecord>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["DOKTER"])?;
    let mut tx = state.pool.begin().await?;
    let row = sqlx::query(
        "SELECT patient_id,doctor_id,version FROM medical_records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(AppError::not_found)?;
    let patient_id: String = row.get("patient_id");
    let doctor_id: String = row.get("doctor_id");
    let version: i32 = row.get("version");
    if doctor_id != user.id {
        return Err(AppError::forbidden());
    }
    if version != body.expected_version {
        return Err(AppError::conflict(
            "Rekam medis berubah. Muat ulang sebelum menghapus.",
        ));
    }
    can_read_patient(&mut *tx, &user, &patient_id).await?;
    sqlx::query(
        "UPDATE medical_records SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1",
    )
    .bind(&id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"deleted": true})))
}

async fn observe(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CreateObservation>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["PERAWAT"])?;
    validate_observation_fields(&body)?;
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
    can_read_patient(&mut *tx, &user, &patient_id).await?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_observation() -> CreateObservation {
        CreateObservation {
            symptoms: "Demam menurun".into(),
            nursing_note: Some("Observasi shift pagi".into()),
            observed_at: "2026-10-29T08:00:00Z".into(),
            temperature: Some(36.8),
            systolic: Some(120),
            diastolic: Some(80),
            pulse: Some(76),
            respiratory_rate: Some(18),
            spo2: Some(98.0),
        }
    }

    #[test]
    fn record_validation_checks_required_fields_and_notes_length() {
        assert!(validate_record_fields("Keluhan", "Diagnosis", "Tindakan", None).is_ok());
        assert!(validate_record_fields("   ", "Diagnosis", "Tindakan", None).is_err());
        let too_long = "x".repeat(5001);
        assert!(validate_record_fields("Keluhan", "Diagnosis", "Tindakan", Some(&too_long)).is_err());
    }

    #[test]
    fn new_patient_validation_checks_fields_gender_birth_date_and_bpjs() {
        let today = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();
        let valid = NewPatientInput {
            name: "  Fajar Nugroho ".into(),
            medical_record_no: Some("rm-09001".into()),
            birth_date: NaiveDate::from_ymd_opt(1994, 6, 15).unwrap(),
            gender: "L".into(),
            bpjs: true,
            bpjs_number: Some("0001234599001".into()),
        };
        let parsed = validate_new_patient(&valid, today).unwrap();
        assert_eq!(parsed.name, "Fajar Nugroho");
        assert_eq!(parsed.medical_record_no.as_deref(), Some("RM-09001"));

        let future_birth = NewPatientInput {
            name: "Tes".into(),
            medical_record_no: None,
            birth_date: NaiveDate::from_ymd_opt(2026, 11, 3).unwrap(),
            gender: "P".into(),
            bpjs: false,
            bpjs_number: None,
        };
        assert!(validate_new_patient(&future_birth, today).is_err());

        let invalid_bpjs = NewPatientInput {
            name: "Tes".into(),
            medical_record_no: None,
            birth_date: today,
            gender: "P".into(),
            bpjs: false,
            bpjs_number: Some("000111".into()),
        };
        assert!(validate_new_patient(&invalid_bpjs, today).is_err());
    }

    #[test]
    fn observation_validation_enforces_paired_bp_ranges_and_note_limit() {
        let valid = sample_observation();
        assert!(validate_observation_fields(&valid).is_ok());

        let mut unpaired = sample_observation();
        unpaired.diastolic = None;
        assert!(validate_observation_fields(&unpaired).is_err());

        let mut negative_pulse = sample_observation();
        negative_pulse.pulse = Some(-1);
        assert!(validate_observation_fields(&negative_pulse).is_err());

        let mut invalid_spo2 = sample_observation();
        invalid_spo2.spo2 = Some(101.0);
        assert!(validate_observation_fields(&invalid_spo2).is_err());

        let mut long_note = sample_observation();
        long_note.nursing_note = Some("n".repeat(3001));
        assert!(validate_observation_fields(&long_note).is_err());
    }
}
