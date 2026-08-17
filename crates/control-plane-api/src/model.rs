use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrandingPalette {
    pub primary: String,
    pub primary_contrast: String,
    pub accent: String,
    pub surface: String,
    pub surface_elevated: String,
    pub text: String,
    pub text_muted: String,
    pub success: String,
    pub warning: String,
    pub danger: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TenantRow {
    pub id: Uuid,
    pub slug: String,
    pub display_name: String,
    pub status: String,
    pub workspace_id: Option<Uuid>,
    pub crowdrelay_base_url: Option<String>,
    pub signal_base_url: Option<String>,
    pub branding_palette: Option<Value>,
    pub synesthesia_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatusRow {
    pub tenant_id: Uuid,
    pub api_healthy: Option<bool>,
    pub worker_healthy: Option<bool>,
    pub schema_version: Option<i32>,
    pub deployed_sha: Option<String>,
    pub outbox_pending: Option<i64>,
    pub queue_lag: Option<i64>,
    pub last_heartbeat_at: Option<DateTime<Utc>>,
    pub checked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantSummary {
    #[serde(flatten)]
    pub tenant: TenantRow,
    pub runtime: Option<RuntimeStatusRow>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuditRow {
    pub id: Uuid,
    pub tenant_id: Option<Uuid>,
    pub actor: String,
    pub action: String,
    pub target_kind: String,
    pub target_id: String,
    pub request_id: Option<String>,
    pub detail: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeReportRequest {
    pub api_healthy: Option<bool>,
    pub worker_healthy: Option<bool>,
    pub schema_version: Option<i32>,
    pub deployed_sha: Option<String>,
    pub outbox_pending: Option<i64>,
    pub queue_lag: Option<i64>,
    pub last_heartbeat_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateTenantRequest {
    pub slug: String,
    pub display_name: String,
    pub workspace_id: Option<Uuid>,
    pub crowdrelay_base_url: Option<String>,
    pub signal_base_url: Option<String>,
    pub branding_palette: Option<BrandingPalette>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateBrandingRequest {
    pub branding_palette: Option<BrandingPalette>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanProvisioningRequest {
    pub desired_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProvisioningJobRow {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub status: String,
    pub desired_version: Option<String>,
    pub plan: Value,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
