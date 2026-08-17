use chrono::{DateTime, Duration, Utc};
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

#[derive(Debug, Clone, Serialize, FromRow, PartialEq, Eq)]
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

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeHealth {
    Healthy,
    Degraded,
    Stale,
    Unknown,
}

impl RuntimeHealth {
    pub fn classify(
        runtime: Option<&RuntimeStatusRow>,
        now: DateTime<Utc>,
        stale_after_seconds: i64,
    ) -> Self {
        let Some(runtime) = runtime else {
            return Self::Unknown;
        };
        let Some(observed_at) = runtime
            .last_heartbeat_at
            .as_ref()
            .or(runtime.checked_at.as_ref())
        else {
            return Self::Unknown;
        };
        if observed_at < &(now - Duration::seconds(stale_after_seconds.max(1))) {
            return Self::Stale;
        }
        match (runtime.api_healthy, runtime.worker_healthy) {
            (Some(true), Some(true)) => Self::Healthy,
            (Some(false), _) | (_, Some(false)) => Self::Degraded,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantSummary {
    #[serde(flatten)]
    pub tenant: TenantRow,
    pub runtime: Option<RuntimeStatusRow>,
    pub runtime_health: RuntimeHealth,
}

#[derive(Debug, FromRow)]
pub struct TenantSummaryJoinRow {
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
    pub runtime_tenant_id: Option<Uuid>,
    pub runtime_api_healthy: Option<bool>,
    pub runtime_worker_healthy: Option<bool>,
    pub runtime_schema_version: Option<i32>,
    pub runtime_deployed_sha: Option<String>,
    pub runtime_outbox_pending: Option<i64>,
    pub runtime_queue_lag: Option<i64>,
    pub runtime_last_heartbeat_at: Option<DateTime<Utc>>,
    pub runtime_checked_at: Option<DateTime<Utc>>,
}

impl TenantSummaryJoinRow {
    pub fn into_summary(self, now: DateTime<Utc>, stale_after_seconds: i64) -> TenantSummary {
        let runtime = self.runtime_tenant_id.map(|tenant_id| RuntimeStatusRow {
            tenant_id,
            api_healthy: self.runtime_api_healthy,
            worker_healthy: self.runtime_worker_healthy,
            schema_version: self.runtime_schema_version,
            deployed_sha: self.runtime_deployed_sha,
            outbox_pending: self.runtime_outbox_pending,
            queue_lag: self.runtime_queue_lag,
            last_heartbeat_at: self.runtime_last_heartbeat_at,
            checked_at: self.runtime_checked_at,
        });
        let runtime_health = RuntimeHealth::classify(runtime.as_ref(), now, stale_after_seconds);
        TenantSummary {
            tenant: TenantRow {
                id: self.id,
                slug: self.slug,
                display_name: self.display_name,
                status: self.status,
                workspace_id: self.workspace_id,
                crowdrelay_base_url: self.crowdrelay_base_url,
                signal_base_url: self.signal_base_url,
                branding_palette: self.branding_palette,
                synesthesia_enabled: self.synesthesia_enabled,
                created_at: self.created_at,
                updated_at: self.updated_at,
            },
            runtime,
            runtime_health,
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn status(
        api: Option<bool>,
        worker: Option<bool>,
        observed_at: DateTime<Utc>,
    ) -> RuntimeStatusRow {
        RuntimeStatusRow {
            tenant_id: Uuid::nil(),
            api_healthy: api,
            worker_healthy: worker,
            schema_version: Some(1),
            deployed_sha: Some("0123456789abcdef".to_owned()),
            outbox_pending: Some(0),
            queue_lag: Some(0),
            last_heartbeat_at: Some(observed_at),
            checked_at: Some(observed_at),
        }
    }

    #[test]
    fn runtime_health_respects_freshness_before_boolean_health() {
        let now = Utc::now();
        assert_eq!(
            RuntimeHealth::classify(None, now, 180),
            RuntimeHealth::Unknown
        );
        assert_eq!(
            RuntimeHealth::classify(
                Some(&status(Some(true), Some(true), now)),
                now,
                180,
            ),
            RuntimeHealth::Healthy
        );
        assert_eq!(
            RuntimeHealth::classify(
                Some(&status(Some(false), Some(true), now)),
                now,
                180,
            ),
            RuntimeHealth::Degraded
        );
        assert_eq!(
            RuntimeHealth::classify(
                Some(&status(
                    Some(true),
                    Some(true),
                    now - Duration::seconds(181),
                )),
                now,
                180,
            ),
            RuntimeHealth::Stale
        );
        assert_eq!(
            RuntimeHealth::classify(Some(&status(Some(true), None, now)), now, 180,),
            RuntimeHealth::Unknown
        );
    }
}
