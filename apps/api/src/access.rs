use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use sqlx::PgPool;
pub fn require_clinical(user: &AuthUser) -> AppResult<()> {
    user.require_roles(&["DOKTER", "PERAWAT"])
}
pub async fn can_read_patient(pool: &PgPool, user: &AuthUser, patient_id: &str) -> AppResult<()> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM patients WHERE id=$1 AND ($2 <> 'DOKTER' OR EXISTS(SELECT 1 FROM cycles WHERE patient_id=$1 AND doctor_id=$3)))")
  .bind(patient_id).bind(&user.role).bind(&user.id).fetch_one(pool).await?;
    if !exists {
        return Err(AppError::not_found());
    }
    Ok(())
}
