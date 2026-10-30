use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;

use crate::{
    auth::AuthUser,
    db,
    error::{AppError, AppResult},
    AppState,
};

fn validate_capacity(capacity: i32) -> AppResult<()> {
    if !(1..=20).contains(&capacity) {
        return Err(AppError::validation("Kapasitas harus 1–20."));
    }
    Ok(())
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/rooms", get(list).post(create))
        .route("/rooms/{id}", get(detail).patch(update))
        .route("/rooms/{id}/items", post(add_item))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewRoom {
    name: String,
    room_class: String,
    capacity: i32,
    status: Option<String>,
    pic_id: Option<String>,
    daily_rate: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EditRoom {
    name: String,
    room_class: String,
    capacity: i32,
    status: String,
    pic_id: Option<String>,
    daily_rate: String,
    expected_version: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NewItem {
    name: String,
    category: String,
    quantity: i32,
    unit_price: String,
}

async fn list(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    user.require_roles(&["DOKTER", "PERAWAT", "ADMISI"])?;
    let rooms = sqlx::query_scalar::<_, Value>(
        "SELECT jsonb_build_object('id',r.id,'name',r.name,'roomClass',r.room_class,'capacity',r.capacity,'status',r.status,'picId',r.pic_id,'picName',u.name,'dailyRate',r.daily_rate::text,'version',r.version,'items',COALESCE(i.items,'[]'::jsonb),'totalCost',COALESCE(i.total_cost,0)::text,'occupants',COALESCE(o.occupants,0)) \
         FROM rooms r LEFT JOIN users u ON u.id=r.pic_id \
         LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',ri.id,'name',ri.name,'category',ri.category,'quantity',ri.quantity,'unitPrice',ri.unit_price::text) ORDER BY ri.name) AS items, sum(ri.quantity*ri.unit_price) AS total_cost FROM room_items ri WHERE ri.room_id=r.id) i ON true \
         LEFT JOIN LATERAL (SELECT count(*) AS occupants FROM placements p WHERE p.room_id=r.id AND p.status='active' AND p.starts_on<=timezone('Asia/Jakarta',now())::date AND p.ends_on>=timezone('Asia/Jakarta',now())::date) o ON true \
         ORDER BY r.name LIMIT 100"
    ).fetch_all(&state.pool).await?;
    Ok(Json(json!({"items": rooms})))
}

async fn detail(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["DOKTER", "PERAWAT", "ADMISI"])?;
    Ok(Json(room_json(&state, &id).await?))
}

async fn room_json(state: &AppState, id: &str) -> AppResult<Value> {
    let result = sqlx::query_scalar::<_, Value>(
        "SELECT jsonb_build_object('id',r.id,'name',r.name,'roomClass',r.room_class,'capacity',r.capacity,'status',r.status,'picId',r.pic_id,'picName',u.name,'dailyRate',r.daily_rate::text,'version',r.version,'items',COALESCE(i.items,'[]'::jsonb),'totalCost',COALESCE(i.total_cost,0)::text,'occupants',COALESCE(o.occupants,0)) \
         FROM rooms r LEFT JOIN users u ON u.id=r.pic_id \
         LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',ri.id,'name',ri.name,'category',ri.category,'quantity',ri.quantity,'unitPrice',ri.unit_price::text) ORDER BY ri.name) AS items, sum(ri.quantity*ri.unit_price) AS total_cost FROM room_items ri WHERE ri.room_id=r.id) i ON true \
         LEFT JOIN LATERAL (SELECT count(*) AS occupants FROM placements p WHERE p.room_id=r.id AND p.status='active' AND p.starts_on<=timezone('Asia/Jakarta',now())::date AND p.ends_on>=timezone('Asia/Jakarta',now())::date) o ON true WHERE r.id=$1"
    ).bind(id).fetch_optional(&state.pool).await?;
    result.ok_or_else(AppError::not_found)
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(input): Json<NewRoom>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["PERAWAT"])?;
    db::nonempty(&input.name, "Nama ruangan", 80)?;
    db::nonempty(&input.room_class, "Tipe ruangan", 40)?;
    validate_capacity(input.capacity)?;
    let status = input.status.as_deref().unwrap_or("available");
    if !matches!(status, "available" | "maintenance") {
        return Err(AppError::validation("Status ruangan tidak valid."));
    }
    let rate = input.daily_rate.as_deref().unwrap_or("0");
    if rate
        .parse::<rust_decimal::Decimal>()
        .map_or(true, |v| v < rust_decimal::Decimal::ZERO || v.scale() > 2)
    {
        return Err(AppError::validation(
            "Tarif harian harus berupa nominal nonnegatif dengan maksimal dua desimal.",
        ));
    }
    if let Some(pic_id) = input.pic_id.as_deref() {
        let active_nurse = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users u JOIN nurses n ON n.user_id=u.id WHERE u.id=$1 AND u.role='PERAWAT' AND u.active AND n.active)")
            .bind(pic_id).fetch_one(&state.pool).await?;
        if !active_nurse {
            return Err(AppError::validation("PIC harus berupa perawat aktif."));
        }
    }
    let id = db::id();
    let row = sqlx::query("INSERT INTO rooms(id,name,room_class,capacity,status,pic_id,daily_rate) VALUES($1,$2,$3,$4,$5,$6,$7::numeric) ON CONFLICT(name) DO NOTHING")
        .bind(&id).bind(input.name.trim()).bind(input.room_class.trim()).bind(input.capacity).bind(status).bind(input.pic_id).bind(rate).execute(&state.pool).await?;
    if row.rows_affected() == 0 {
        return Err(AppError::conflict("Nama ruangan sudah digunakan."));
    }
    Ok(Json(room_json(&state, &id).await?))
}

async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(input): Json<EditRoom>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["PERAWAT"])?;
    db::nonempty(&input.name, "Nama ruangan", 80)?;
    db::nonempty(&input.room_class, "Tipe ruangan", 40)?;
    validate_capacity(input.capacity)?;
    if !matches!(input.status.as_str(), "available" | "maintenance") {
        return Err(AppError::validation("Status ruangan tidak valid."));
    }
    let rate = input
        .daily_rate
        .parse::<rust_decimal::Decimal>()
        .map_err(|_| AppError::validation("Tarif harian tidak valid."))?;
    if rate < rust_decimal::Decimal::ZERO || rate.scale() > 2 {
        return Err(AppError::validation(
            "Tarif harian harus nonnegatif dan maksimal dua desimal.",
        ));
    }
    if let Some(pic_id) = input.pic_id.as_deref() {
        let active_nurse = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users u JOIN nurses n ON n.user_id=u.id WHERE u.id=$1 AND u.role='PERAWAT' AND u.active AND n.active)")
            .bind(pic_id).fetch_one(&state.pool).await?;
        if !active_nurse {
            return Err(AppError::validation("PIC harus berupa perawat aktif."));
        }
    }
    let mut tx = state.pool.begin().await?;
    let current = sqlx::query("SELECT version FROM rooms WHERE id=$1 FOR UPDATE")
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?;
    let Some(current) = current else {
        return Err(AppError::not_found());
    };
    let version: i32 = current.try_get("version")?;
    if version != input.expected_version {
        return Err(AppError::conflict(
            "Ruangan telah berubah; muat ulang sebelum menyimpan.",
        ));
    }
    let over_capacity=sqlx::query_scalar::<_,bool>(
        "WITH events AS (SELECT starts_on AS day,1::bigint AS change FROM placements WHERE room_id=$1 AND status='active' UNION ALL SELECT ends_on+1,-1::bigint FROM placements WHERE room_id=$1 AND status='active'), daily AS (SELECT day,sum(change) AS change FROM events GROUP BY day), occupancy AS (SELECT sum(change) OVER(ORDER BY day ROWS UNBOUNDED PRECEDING) AS count FROM daily) SELECT COALESCE(max(count),0)>$2 FROM occupancy"
    ).bind(&id).bind(i64::from(input.capacity)).fetch_one(&mut *tx).await?;
    if over_capacity {
        return Err(AppError::conflict(
            "Kapasitas tidak boleh kurang dari penempatan yang sudah tersimpan.",
        ));
    }
    let updated=sqlx::query("UPDATE rooms SET name=$2, room_class=$3, capacity=$4, status=$5,pic_id=$6,daily_rate=$7,version=version+1 WHERE id=$1 AND version=$8")
        .bind(&id).bind(input.name.trim()).bind(input.room_class.trim()).bind(input.capacity).bind(&input.status).bind(input.pic_id).bind(rate).bind(input.expected_version).execute(&mut *tx).await;
    match updated {
        Ok(row) if row.rows_affected() == 1 => {
            tx.commit().await?;
            Ok(Json(room_json(&state, &id).await?))
        }
        Ok(_) => Err(AppError::conflict(
            "Ruangan telah berubah; muat ulang sebelum menyimpan.",
        )),
        Err(e)
            if e.as_database_error()
                .is_some_and(|db| db.code().as_deref() == Some("23505")) =>
        {
            Err(AppError::conflict("Nama ruangan sudah digunakan."))
        }
        Err(e) => Err(e.into()),
    }
}

async fn add_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(input): Json<NewItem>,
) -> AppResult<Json<Value>> {
    user.require_roles(&["PERAWAT"])?;
    db::nonempty(&input.name, "Nama item", 80)?;
    db::nonempty(&input.category, "Kategori item", 40)?;
    if !(1..=10000).contains(&input.quantity) {
        return Err(AppError::validation("Jumlah item harus positif."));
    }
    let price = input
        .unit_price
        .parse::<rust_decimal::Decimal>()
        .map_err(|_| AppError::validation("Harga item tidak valid."))?;
    if price < rust_decimal::Decimal::ZERO || price.scale() > 2 {
        return Err(AppError::validation(
            "Harga item harus nonnegatif dan maksimal dua desimal.",
        ));
    }
    let row = sqlx::query_scalar::<_, String>("INSERT INTO room_items(id,room_id,name,category,quantity,unit_price) SELECT $1,id,$3,$4,$5,$6 FROM rooms WHERE id=$2 RETURNING id")
        .bind(db::id()).bind(&id).bind(input.name.trim()).bind(input.category.trim()).bind(input.quantity).bind(price).fetch_optional(&state.pool).await?;
    if row.is_none() {
        return Err(AppError::not_found());
    }
    Ok(Json(room_json(&state, &id).await?))
}

#[cfg(test)]
mod tests {
    use super::validate_capacity;
    #[test]
    fn room_capacity_accepts_boundary_values_only() {
        assert!(validate_capacity(1).is_ok());
        assert!(validate_capacity(20).is_ok());
        assert!(validate_capacity(0).is_err());
        assert!(validate_capacity(21).is_err());
    }
}
