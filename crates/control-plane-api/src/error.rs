use axum::{Json, http::StatusCode, response::IntoResponse};
use serde_json::{Map, Value, json};

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
    /// The upstream tenant did not answer within the request timeout. A
    /// distinct variant (not `Unavailable("timeout")`) so section failure
    /// classification matches the variant, not a substring of the message —
    /// a message reword can no longer reclassify a timeout as unreachable.
    #[error("upstream timeout")]
    Timeout,
    /// Nothing accepted the connection on the upstream management target, or
    /// the connection was established but the read/write half failed. Distinct
    /// from `Timeout` (which means the upstream answered too slowly) and from
    /// `UpstreamError` (which means it answered with an error status).
    #[error("upstream unreachable")]
    Unreachable,
    /// The upstream answered with a non-success HTTP status that this transport
    /// does not translate into a more specific variant. The status code is kept
    /// so the operator sees which HTTP status the tenant returned, and so
    /// section classification can distinguish 401/403 (credential refused)
    /// from other server errors.
    #[error("upstream returned HTTP {0}")]
    UpstreamError(u16),
    /// The upstream answered successfully but the response did not match the
    /// contract this transport expects (malformed framing, wrong JSON shape,
    /// empty body where a body was required, redirect refused, etc.). The
    /// static reason is kept for the operator-facing detail but the *variant*
    /// is what section classification matches on — the reason text can no
    /// longer reclassify a contract mismatch as a transient blip.
    #[error("upstream contract mismatch: {0}")]
    ContractMismatch(&'static str),
    /// Every section of a read-model fan-out failed. Unlike `Unavailable`,
    /// this carries the per-section verdicts so the operator sees *which*
    /// section failed *how* instead of a generic "tenant unavailable".
    /// The response is a structured 503, not a string detail.
    #[error("tenant read-model channel returned no usable section")]
    AllSectionsFailed {
        detail: Box<AllSectionsFailedDetail>,
    },
    #[error("database error")]
    Database(#[from] sqlx::Error),
    #[error("migration error")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("serialization error")]
    Serialization(#[from] serde_json::Error),
}

/// Per-section diagnosis carried by [`ApiError::AllSectionsFailed`]. Every
/// field is preserved so the operator sees exactly which section failed how,
/// instead of a generic "tenant unavailable" that throws away the verdict
/// system's whole purpose.
#[derive(Debug)]
pub struct AllSectionsFailedDetail {
    pub slug: String,
    pub channel: String,
    pub verdicts: Map<String, Value>,
    pub degraded: Vec<String>,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        // AllSectionsFailed carries a structured per-section diagnosis that
        // the generic {error, detail} body cannot represent. It gets its own
        // response shape so the operator sees every section's state and
        // remediation instead of a collapsed "tenant unavailable" string.
        if let Self::AllSectionsFailed { detail } = &self {
            let body = json!({
                "error": "all_sections_failed",
                "detail": self.to_string(),
                "id": detail.slug,
                "channel": detail.channel,
                "sections": detail.verdicts,
                "degraded": detail.degraded,
                "anyTrustworthy": false,
            });
            return (StatusCode::SERVICE_UNAVAILABLE, Json(body)).into_response();
        }

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
            // A timeout is a gateway problem, not a service problem: the
            // upstream may still be working. 504 (not 503) tells the operator
            // to retry, not to treat the service as down.
            Self::Timeout => (
                StatusCode::GATEWAY_TIMEOUT,
                "upstream_timeout",
                self.to_string(),
            ),
            Self::Unreachable => (
                StatusCode::BAD_GATEWAY,
                "upstream_unreachable",
                self.to_string(),
            ),
            Self::UpstreamError(status) => (
                StatusCode::BAD_GATEWAY,
                "upstream_error",
                format!("upstream returned HTTP {status}"),
            ),
            Self::ContractMismatch(reason) => (
                StatusCode::BAD_GATEWAY,
                "contract_mismatch",
                format!("upstream contract mismatch: {reason}"),
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
            // Handled by the early return above; if the early return is ever
            // removed, this arm produces a safe 503 instead of panicking.
            Self::AllSectionsFailed { .. } => (
                StatusCode::SERVICE_UNAVAILABLE,
                "all_sections_failed",
                "tenant unavailable".to_owned(),
            ),
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
