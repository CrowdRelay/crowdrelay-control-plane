use axum::{Json, http::StatusCode, response::IntoResponse};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden: {0}")]
    Forbidden(String),
    #[error("not found")]
    NotFound,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("unavailable: {0}")]
    Unavailable(String),
    #[error("database error")]
    Database(#[from] sqlx::Error),
    #[error("migration error")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("serialization error")]
    Serialization(#[from] serde_json::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let (status, code, detail) = match &self {
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized", self.to_string()),
            Self::Forbidden(_) => (StatusCode::FORBIDDEN, "forbidden", self.to_string()),
            Self::NotFound => (StatusCode::NOT_FOUND, "not_found", self.to_string()),
            Self::Conflict(_) => (StatusCode::CONFLICT, "conflict", self.to_string()),
            Self::InvalidInput(_) => (StatusCode::BAD_REQUEST, "invalid_input", self.to_string()),
            Self::Unavailable(_) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "unavailable",
                self.to_string(),
            ),
            // Withholding the cause from the browser is right — a database
            // error can carry table names, SQL and row contents. Withholding it
            // from the server log was not: nothing here logged, so an operator
            // saw "internal error" and there was no record anywhere of what
            // failed. A tenant create rejected by a CHECK constraint was
            // indistinguishable from the database being down.
            //
            // A constraint violation is the exception worth translating. The
            // constraint name is a fact about our own schema, not about the
            // caller's data, and it is the difference between "internal error"
            // and "that growth goal is not one this deployment accepts".
            Self::Database(error) => {
                let detail = database_detail(error);
                tracing::error!(error = %error, detail = %detail, "request failed");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", detail)
            }
            Self::Migration(error) => {
                tracing::error!(error = %error, "migration failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "internal error while applying migrations".to_owned(),
                )
            }
            Self::Serialization(error) => {
                tracing::error!(error = %error, "serialization failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "internal error while encoding the response".to_owned(),
                )
            }
        };
        (status, Json(json!({"error": code, "detail": detail}))).into_response()
    }
}

/// Turns a database failure into something an operator can act on.
///
/// Only the shape of the failure is exposed, never its content. A constraint
/// name is a fact about our own schema — `control_plane_tenant_north_star_ck`
/// says which rule was broken without revealing a single row, a column value or
/// any SQL. Everything else stays generic, and the full error goes to the log.
fn database_detail(error: &sqlx::Error) -> String {
    let sqlx::Error::Database(db) = error else {
        return "internal error while reading or writing the database".to_owned();
    };
    match db.constraint() {
        // A unique violation is the caller's problem and they can fix it.
        Some(name) if db.is_unique_violation() => {
            format!("already taken ({name})")
        }
        // A check violation means a value was outside what this deployment
        // allows. Naming the constraint is what turns a shrug into a search.
        Some(name) => format!(
            "a value was rejected by the database rule {name}; \
             this deployment does not accept it"
        ),
        None => "internal error while reading or writing the database".to_owned(),
    }
}
