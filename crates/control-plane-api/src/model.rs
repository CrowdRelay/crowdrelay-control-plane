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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegionalProfile {
    pub country_code: String,
    pub region: String,
    pub locale: String,
    pub timezone: String,
    pub currency: String,
    pub date_format: String,
    pub number_format: String,
    pub data_region: String,
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
    pub default_country_code: String,
    pub regional_profile: Option<Value>,
    pub branding_palette: Option<Value>,
    pub synesthesia_enabled: bool,
    pub area_enabled: bool,
    pub signal_enabled: bool,
    pub north_star_metric: String,
    pub fanbase_sources: Vec<String>,
    pub signal_play_store_url: Option<String>,
    pub synesthesia_play_store_url: Option<String>,
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
        // Prefer the server-controlled receipt timestamp. A reporter clock must not
        // be able to keep a dead tenant fresh by sending a future heartbeat.
        let Some(observed_at) = runtime
            .checked_at
            .as_ref()
            .or(runtime.last_heartbeat_at.as_ref())
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
    pub default_country_code: String,
    pub regional_profile: Option<Value>,
    pub branding_palette: Option<Value>,
    pub synesthesia_enabled: bool,
    pub area_enabled: bool,
    pub signal_enabled: bool,
    pub north_star_metric: String,
    pub fanbase_sources: Vec<String>,
    pub signal_play_store_url: Option<String>,
    pub synesthesia_play_store_url: Option<String>,
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
                default_country_code: self.default_country_code,
                regional_profile: self.regional_profile,
                branding_palette: self.branding_palette,
                synesthesia_enabled: self.synesthesia_enabled,
                area_enabled: self.area_enabled,
                signal_enabled: self.signal_enabled,
                north_star_metric: self.north_star_metric,
                fanbase_sources: self.fanbase_sources,
                signal_play_store_url: self.signal_play_store_url,
                synesthesia_play_store_url: self.synesthesia_play_store_url,
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

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PlatformHealthRow {
    pub service: String,
    pub label: String,
    pub url: String,
    pub healthy: bool,
    pub last_status: Option<String>,
    pub last_checked_at: DateTime<Utc>,
    pub last_healthy_at: Option<DateTime<Utc>>,
    pub latency_ms: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateTenantRequest {
    pub slug: String,
    pub display_name: String,
    pub workspace_id: Option<Uuid>,
    pub crowdrelay_base_url: Option<String>,
    pub signal_base_url: Option<String>,
    pub default_country_code: Option<String>,
    pub regional_profile: RegionalProfile,
    pub branding_palette: Option<BrandingPalette>,
    #[serde(default)]
    pub deploy_crowdrelay: bool,
    pub desired_version: Option<String>,
    /// Convenience path for tenant onboarding: create the first scoped
    /// operator account in the same transaction as the tenant itself.
    #[serde(default)]
    pub initial_operator: Option<InitialOperatorRequest>,
    /// Product opt-ins and growth intent from the onboarding wizard.
    ///
    /// These are declared because the wizard has always sent them and this
    /// struct is `deny_unknown_fields`: without them every wizard submission
    /// is rejected with 422 and no tenant can be created through the UI.
    /// Signal defaults to true so an API caller that omits it keeps the
    /// historical behaviour.
    #[serde(default = "default_true")]
    pub signal_enabled: bool,
    #[serde(default)]
    pub synesthesia_enabled: bool,
    #[serde(default)]
    pub area_enabled: bool,
    /// Brain growth goal. Validated against the CrowdRelay NorthStarMetric
    /// vocabulary, and rejected as `signal_installs` when Signal is disabled.
    pub north_star_metric: Option<String>,
    /// Discovery platforms the operator selected. Advisory only.
    #[serde(default)]
    pub fanbase_sources: Vec<String>,
    /// Google Play Store URL for this tenant's Signal app. NULL until published.
    #[serde(default)]
    pub signal_play_store_url: Option<String>,
    /// Google Play Store URL for this tenant's Synesthesia app. NULL until published.
    #[serde(default)]
    pub synesthesia_play_store_url: Option<String>,
}

const fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InitialOperatorRequest {
    pub username: String,
    pub password: String,
}

/// Hashed form of the initial operator, computed before the transaction so
/// the expensive KDF never runs inside it.
#[derive(Debug, Clone)]
pub struct InitialOperator {
    pub username: String,
    pub password_hash: String,
}

#[derive(Debug, Clone)]
pub struct TenantDeploymentSpec {
    pub desired_version: String,
    pub api_image: String,
    pub worker_image: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateBrandingRequest {
    pub branding_palette: Option<BrandingPalette>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateRegionalProfileRequest {
    pub regional_profile: RegionalProfile,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateMobileAppsRequest {
    pub signal_play_store_url: Option<String>,
    pub synesthesia_play_store_url: Option<String>,
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
    pub attempt_count: i32,
    pub claimed_by: Option<String>,
    pub lease_expires_at: Option<DateTime<Utc>>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub result: Option<Value>,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeployTenantRequest {
    pub desired_version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProvisioningClaimRequest {
    pub worker_id: String,
    pub data_region: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvisioningClaim {
    pub job: ProvisioningJobRow,
    pub claim_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProvisioningLeaseRequest {
    pub worker_id: String,
    pub claim_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProvisioningSuccessRequest {
    pub worker_id: String,
    pub claim_token: String,
    pub api_port: u16,
    pub workspace_id: Uuid,
    pub schema_version: i32,
    pub deployed_sha: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProvisioningFailureRequest {
    pub worker_id: String,
    pub claim_token: String,
    pub error_code: String,
    pub error_detail: Option<String>,
}

// --- Automation events (n8n → control plane) -------------------------------

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AutomationEventRow {
    pub id: Uuid,
    pub workflow_id: String,
    pub workflow_name: String,
    pub execution_id: Option<String>,
    pub event_kind: String,
    pub severity: String,
    pub node_name: Option<String>,
    pub message: String,
    pub payload: Value,
    pub occurred_at: DateTime<Utc>,
    pub status: String,
    pub retry_count: i32,
    pub last_retried_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AutomationWorkflowConfigRow {
    pub workflow_id: String,
    pub label: String,
    pub category: String,
    pub discord_enabled: bool,
    pub muted: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateAutomationEventRequest {
    pub workflow_id: String,
    pub workflow_name: String,
    pub execution_id: Option<String>,
    pub event_kind: String,
    pub severity: String,
    pub node_name: Option<String>,
    pub message: String,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateAutomationWorkflowConfigRequest {
    pub category: Option<String>,
    pub discord_enabled: Option<bool>,
    pub muted: Option<bool>,
    pub label: Option<String>,
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
            RuntimeHealth::classify(Some(&status(Some(true), Some(true), now)), now, 180,),
            RuntimeHealth::Healthy
        );
        assert_eq!(
            RuntimeHealth::classify(Some(&status(Some(false), Some(true), now)), now, 180,),
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

        let mut skewed = status(Some(true), Some(true), now + Duration::hours(1));
        skewed.checked_at = Some(now - Duration::seconds(181));
        assert_eq!(
            RuntimeHealth::classify(Some(&skewed), now, 180),
            RuntimeHealth::Stale,
            "server receipt time must be authoritative over reporter clock skew"
        );
    }
}
