use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{json, Value};
use std::str::FromStr;

use crate::{
    auth::AuthUser,
    db,
    error::{AppError, AppResult},
    AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InvoiceQuery {
    search: Option<String>,
    status: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewLine {
    description: String,
    quantity: i32,
    unit_price: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewInvoice {
    patient_id: String,
    placement_id: Option<String>,
    covered_amount: String,
    lines: Vec<NewLine>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChangePayment {
    status: String,
    reason: String,
    expected_version: i32,
}

fn parse_money(value: &str, label: &str) -> AppResult<Decimal> {
    let value = Decimal::from_str(value.trim()).map_err(|_| {
        AppError::validation(format!("{label} harus berupa nominal desimal yang valid."))
    })?;
    if value.is_sign_negative()
        || value.scale() > 2
        || value >= Decimal::from(10_000_000_000_000_i64)
    {
        return Err(AppError::validation(format!(
            "{label} tidak boleh negatif dan maksimal memakai dua desimal."
        )));
    }
    Ok(value)
}

fn validate_coverage(bpjs: bool, covered: Decimal, total: Decimal) -> AppResult<()> {
    if covered > total {
        return Err(AppError::validation(
            "Jumlah jaminan tidak boleh melebihi total tagihan.",
        ));
    }
    if !bpjs && covered != Decimal::ZERO {
        return Err(AppError::validation(
            "Pasien tanpa BPJS tidak dapat menggunakan nilai jaminan.",
        ));
    }
    Ok(())
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/invoices", get(list).post(create))
        .route("/invoices/{id}", get(detail).patch(change_status))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<InvoiceQuery>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["ADMISI"])?;
    if query
        .status
        .as_deref()
        .is_some_and(|s| !matches!(s, "paid" | "unpaid"))
    {
        return Err(AppError::validation("Status pembayaran tidak valid."));
    }
    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    let search = query.search.as_deref().unwrap_or("").trim();
    let pattern = format!("%{search}%");
    let rows = sqlx::query_scalar::<_, Value>(
        "SELECT jsonb_build_object('id',i.id,'patientId',i.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',i.placement_id,'bpjsSnapshot',i.bpjs_snapshot,'totalAmount',i.total_amount::text,'coveredAmount',i.covered_amount::text,'payableAmount',i.payable_amount::text,'status',i.status,'version',i.version,'createdAt',i.created_at,'lineCount',count(l.id)) FROM invoices i JOIN patients p ON p.id=i.patient_id LEFT JOIN invoice_lines l ON l.invoice_id=i.id WHERE ($1='' OR p.name ILIKE $2 OR p.medical_record_no ILIKE $2 OR i.id ILIKE $2) AND ($3::text IS NULL OR i.status=$3) GROUP BY i.id,p.name,p.medical_record_no ORDER BY i.created_at DESC,i.id LIMIT $4"
    ).bind(search).bind(pattern).bind(query.status.as_deref()).bind(limit).fetch_all(&state.pool).await?;
    let total = rows.len();
    Ok(Json(json!({"items":rows,"total":total})))
}

async fn detail(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["ADMISI"])?;
    let row = sqlx::query_scalar::<_, Value>(
        "SELECT jsonb_build_object('id',i.id,'patientId',i.patient_id,'patientName',p.name,'medicalRecordNo',p.medical_record_no,'placementId',i.placement_id,'bpjsSnapshot',i.bpjs_snapshot,'totalAmount',i.total_amount::text,'coveredAmount',i.covered_amount::text,'payableAmount',i.payable_amount::text,'status',i.status,'version',i.version,'createdAt',i.created_at,'lines',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'description',l.description,'quantity',l.quantity,'unitPrice',l.unit_price::text,'lineTotal',l.line_total::text) ORDER BY l.id) FROM invoice_lines l WHERE l.invoice_id=i.id),'[]'::jsonb),'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'reason',h.reason,'actor',u.name,'before',h.before_data,'after',h.after_data,'createdAt',h.created_at) ORDER BY h.created_at DESC) FROM invoice_history h JOIN users u ON u.id=h.actor_id WHERE h.invoice_id=i.id),'[]'::jsonb)) FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.id=$1"
    ).bind(id).fetch_optional(&state.pool).await?.ok_or_else(AppError::not_found)?;
    Ok(Json(row))
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(input): Json<NewInvoice>,
) -> AppResult<(axum::http::StatusCode, Json<Value>)> {
    user.require_roles(&["ADMISI"])?;
    if input.lines.is_empty() || input.lines.len() > 30 {
        return Err(AppError::validation("Tagihan harus memuat 1–30 rincian."));
    }
    let patient = sqlx::query_as::<_, (String, bool)>("SELECT name,bpjs FROM patients WHERE id=$1")
        .bind(&input.patient_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(AppError::not_found)?;
    if let Some(placement_id) = &input.placement_id {
        sqlx::query("SELECT id FROM placements WHERE id=$1 AND patient_id=$2")
            .bind(placement_id)
            .bind(&input.patient_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(|| AppError::validation("Penempatan pasien tidak cocok."))?;
    }
    let mut total = Decimal::ZERO;
    let mut parsed_lines = Vec::with_capacity(input.lines.len());
    for line in input.lines {
        db::nonempty(&line.description, "Nama layanan", 160)?;
        if !(1..=10_000).contains(&line.quantity) {
            return Err(AppError::validation("Jumlah layanan harus 1–10.000."));
        }
        let unit_price = parse_money(&line.unit_price, "Harga satuan")?;
        let line_total = unit_price
            .checked_mul(Decimal::from(line.quantity))
            .ok_or_else(|| AppError::validation("Total rincian terlalu besar."))?;
        total = total
            .checked_add(line_total)
            .ok_or_else(|| AppError::validation("Total tagihan terlalu besar."))?;
        parsed_lines.push((
            line.description.trim().to_owned(),
            line.quantity,
            unit_price,
            line_total,
        ));
    }
    let covered = parse_money(&input.covered_amount, "Nilai jaminan")?;
    validate_coverage(patient.1, covered, total)?;
    let payable = total
        .checked_sub(covered)
        .ok_or_else(|| AppError::validation("Nilai jaminan tidak valid."))?;
    let id = db::id();
    let mut tx = state.pool.begin().await?;
    sqlx::query("INSERT INTO invoices(id,patient_id,placement_id,bpjs_snapshot,total_amount,covered_amount,payable_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)")
        .bind(&id).bind(&input.patient_id).bind(&input.placement_id).bind(patient.1).bind(total).bind(covered).bind(payable).bind(&user.id).execute(&mut *tx).await?;
    let mut after_lines = Vec::with_capacity(parsed_lines.len());
    for (description, quantity, unit_price, line_total) in &parsed_lines {
        let line_id = db::id();
        sqlx::query("INSERT INTO invoice_lines(id,invoice_id,description,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(&line_id).bind(&id).bind(description).bind(quantity).bind(unit_price).bind(line_total).execute(&mut *tx).await?;
        after_lines.push(json!({"id":line_id,"description":description,"quantity":quantity,"unitPrice":unit_price.to_string(),"lineTotal":line_total.to_string()}));
    }
    let after = json!({"status":"unpaid","totalAmount":total.to_string(),"coveredAmount":covered.to_string(),"payableAmount":payable.to_string(),"lines":after_lines});
    sqlx::query("INSERT INTO invoice_history(id,invoice_id,actor_id,action,reason,after_data) VALUES($1,$2,$3,'created','Tagihan dibuat',$4)")
        .bind(db::id()).bind(&id).bind(&user.id).bind(&after).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(
            json!({"id":id,"patientId":input.patient_id,"patientName":patient.0,"bpjsSnapshot":patient.1,"totalAmount":total.to_string(),"coveredAmount":covered.to_string(),"payableAmount":payable.to_string(),"status":"unpaid","version":1,"lines":after_lines}),
        ),
    ))
}

async fn change_status(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(input): Json<ChangePayment>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["ADMISI"])?;
    db::nonempty(&input.reason, "Alasan", 500)?;
    if !matches!(input.status.as_str(), "paid" | "unpaid") {
        return Err(AppError::validation("Status pembayaran tidak valid."));
    }
    let mut tx = state.pool.begin().await?;
    let before = sqlx::query_scalar::<_,Value>("SELECT jsonb_build_object('id',id,'status',status,'version',version,'totalAmount',total_amount::text,'coveredAmount',covered_amount::text,'payableAmount',payable_amount::text) FROM invoices WHERE id=$1 FOR UPDATE")
        .bind(&id).fetch_optional(&mut *tx).await?.ok_or_else(AppError::not_found)?;
    let current_version = before["version"]
        .as_i64()
        .and_then(|v| i32::try_from(v).ok())
        .ok_or_else(|| AppError::conflict("Nomor versi tagihan tidak valid."))?;
    if current_version != input.expected_version {
        return Err(AppError::conflict(
            "Tagihan telah berubah. Muat ulang lalu coba lagi.",
        ));
    }
    if before["status"].as_str() == Some(&input.status) {
        return Err(AppError::validation(
            "Tagihan sudah memiliki status tersebut.",
        ));
    }
    let changed = sqlx::query("UPDATE invoices SET status=$1,version=version+1,updated_at=now() WHERE id=$2 AND version=$3")
        .bind(&input.status).bind(&id).bind(input.expected_version).execute(&mut *tx).await?;
    if changed.rows_affected() != 1 {
        return Err(AppError::conflict(
            "Tagihan telah berubah. Muat ulang lalu coba lagi.",
        ));
    }
    let after = json!({"id":id,"status":input.status,"version":input.expected_version+1,"totalAmount":before["totalAmount"],"coveredAmount":before["coveredAmount"],"payableAmount":before["payableAmount"]});
    sqlx::query("INSERT INTO invoice_history(id,invoice_id,actor_id,action,reason,before_data,after_data) VALUES($1,$2,$3,'status_changed',$4,$5,$6)")
        .bind(db::id()).bind(&id).bind(&user.id).bind(input.reason.trim()).bind(before).bind(&after).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(after))
}

#[cfg(test)]
mod tests {
    use super::{validate_coverage, Decimal, FromStr};

    #[test]
    fn invoice_amount_is_exact_and_coverage_cannot_exceed_total_or_apply_without_bpjs() {
        let price = Decimal::from_str("650000.00").unwrap();
        let total = price * Decimal::from(4);
        assert_eq!(total, Decimal::from_str("2600000.00").unwrap());
        assert!(validate_coverage(true, Decimal::from_str("100000.00").unwrap(), total).is_ok());
        assert!(validate_coverage(false, Decimal::from(1), total).is_err());
        assert!(validate_coverage(true, total + Decimal::from(1), total).is_err());
    }
}
