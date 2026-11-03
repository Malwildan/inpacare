use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use sqlx::{Executor, Postgres};
pub fn require_clinical(user: &AuthUser) -> AppResult<()> {
    user.require_roles(&["DOKTER", "PERAWAT"])
}
pub async fn can_read_patient<'e, E>(
    executor: E,
    user: &AuthUser,
    patient_id: &str,
) -> AppResult<()>
where
    E: Executor<'e, Database = Postgres>,
{
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM patients WHERE id=$1 AND ($2 <> 'DOKTER' OR EXISTS(SELECT 1 FROM cycles WHERE patient_id=$1 AND doctor_id=$3) OR EXISTS(SELECT 1 FROM medical_records WHERE patient_id=$1 AND doctor_id=$3)))",
    )
    .bind(patient_id)
    .bind(&user.role)
    .bind(&user.id)
    .fetch_one(executor)
    .await?;
    if !exists {
        return Err(AppError::not_found());
    }
    Ok(())
}
