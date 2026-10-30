use crate::error::{AppError, AppResult};
use chrono::{FixedOffset, NaiveDate, Utc};
pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
pub fn today() -> NaiveDate {
    Utc::now()
        .with_timezone(&FixedOffset::east_opt(7 * 3600).unwrap())
        .date_naive()
}
pub fn nonempty(value: &str, label: &str, max: usize) -> AppResult<()> {
    if value.trim().is_empty() || value.chars().count() > max {
        return Err(AppError::validation(format!(
            "{label} wajib diisi (maksimal {max} karakter)."
        )));
    }
    Ok(())
}
