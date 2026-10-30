use crate::{access::can_read_patient, auth::AuthUser, error::AppResult, AppState};
use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/reference", get(reference))
        .route("/patients", get(patients))
        .route("/patients/{id}/context", get(context))
        .route("/staff", get(staff))
}
const PATIENT_SQL:&str="SELECT jsonb_build_object('id',p.id,'name',p.name,'medicalRecordNo',p.medical_record_no,'birthDate',p.birth_date,'gender',p.gender,'bpjs',p.bpjs,'bpjsNumber',p.bpjs_number) FROM patients p WHERE ($1 <> 'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.id AND c.doctor_id=$2)) AND ($3='' OR p.name ILIKE '%' || $3 || '%' OR p.medical_record_no ILIKE '%' || $3 || '%') ORDER BY p.name,p.id LIMIT $4";
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Filter {
    #[serde(default)]
    q: String,
    limit: Option<i64>,
}
async fn patients(
    State(state): State<AppState>,
    user: AuthUser,
    Query(filter): Query<Filter>,
) -> AppResult<Json<Value>> {
    let items: Vec<Value> = sqlx::query_scalar(PATIENT_SQL)
        .bind(&user.role)
        .bind(&user.id)
        .bind(filter.q.trim())
        .bind(filter.limit.unwrap_or(50).clamp(1, 100))
        .fetch_all(&state.pool)
        .await?;
    let total:i64=sqlx::query_scalar("SELECT count(*) FROM patients p WHERE ($1<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.id AND c.doctor_id=$2)) AND ($3='' OR p.name ILIKE '%'||$3||'%' OR p.medical_record_no ILIKE '%'||$3||'%')").bind(&user.role).bind(&user.id).bind(filter.q.trim()).fetch_one(&state.pool).await?;
    Ok(Json(json!({"items":items,"total":total})))
}
async fn staff(State(state): State<AppState>, _user: AuthUser) -> AppResult<Json<Value>> {
    let items:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',u.id,'name',u.name,'role',u.role,'coordinator',u.coordinator,'active',u.active AND coalesce(n.active,true)) FROM users u LEFT JOIN nurses n ON n.user_id=u.id WHERE u.active AND u.role IN ('DOKTER','PERAWAT') ORDER BY u.name LIMIT 100").fetch_all(&state.pool).await?;
    Ok(Json(json!({"total":items.len(),"items":items})))
}
async fn reference(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let patient_future = sqlx::query_scalar::<_, Value>(PATIENT_SQL)
        .bind(&user.role)
        .bind(&user.id)
        .bind("")
        .bind(100i64)
        .fetch_all(&state.pool);
    let staff_future=sqlx::query_scalar::<_,Value>("SELECT jsonb_build_object('id',u.id,'name',u.name,'role',u.role,'coordinator',u.coordinator,'active',u.active AND coalesce(n.active,true)) FROM users u LEFT JOIN nurses n ON n.user_id=u.id WHERE u.active AND u.role IN ('DOKTER','PERAWAT') ORDER BY name LIMIT 100").fetch_all(&state.pool);
    let rooms_future=sqlx::query_scalar::<_,Value>("SELECT jsonb_build_object('id',id,'name',name,'roomClass',room_class,'capacity',capacity,'status',status,'picId',pic_id,'dailyRate',daily_rate::text,'version',version) FROM rooms ORDER BY name LIMIT 100").fetch_all(&state.pool);
    let placements_future=sqlx::query_scalar::<_,Value>("SELECT jsonb_build_object('id',p.id,'patientId',p.patient_id,'patientName',pt.name,'roomId',p.room_id,'roomName',r.name,'startsOn',p.starts_on,'endsOn',p.ends_on,'status',p.status,'version',p.version) FROM placements p JOIN patients pt ON pt.id=p.patient_id JOIN rooms r ON r.id=p.room_id WHERE p.status='active' AND ($1<>'DOKTER' OR EXISTS(SELECT 1 FROM cycles c WHERE c.patient_id=p.patient_id AND c.doctor_id=$2)) ORDER BY p.starts_on DESC,p.id LIMIT 100").bind(&user.role).bind(&user.id).fetch_all(&state.pool);
    let (patients, staff, rooms, placements) = tokio::try_join!(
        patient_future,
        staff_future,
        rooms_future,
        placements_future
    )?;
    Ok(Json(
        json!({"patients":patients,"staff":staff,"rooms":rooms,"placements":placements}),
    ))
}
async fn context(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    can_read_patient(&state.pool, &user, &id).await?;
    let patient:Value=sqlx::query_scalar("SELECT jsonb_build_object('id',id,'name',name,'medicalRecordNo',medical_record_no,'birthDate',birth_date,'gender',gender,'bpjs',bpjs,'bpjsNumber',bpjs_number) FROM patients WHERE id=$1").bind(&id).fetch_one(&state.pool).await?;
    let placements:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',p.id,'roomId',p.room_id,'roomName',r.name,'startsOn',p.starts_on,'endsOn',p.ends_on,'status',p.status) FROM placements p JOIN rooms r ON r.id=p.room_id WHERE patient_id=$1 ORDER BY starts_on DESC LIMIT 50").bind(&id).fetch_all(&state.pool).await?;
    let cycles:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',c.id,'status',c.status,'doctorName',d.name,'nurseName',n.name,'version',c.version) FROM cycles c JOIN users d ON d.id=c.doctor_id JOIN users n ON n.id=c.nurse_id WHERE c.patient_id=$1 ORDER BY c.created_at DESC LIMIT 30").bind(&id).fetch_all(&state.pool).await?;
    Ok(Json(
        json!({"patient":patient,"placements":placements,"cycles":cycles}),
    ))
}
