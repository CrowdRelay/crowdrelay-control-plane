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
        // Freshness is the *older* of the two clocks, never the newer one.
        //
        // `checked_at` is the server-controlled receipt: a reporter clock must
        // not keep a dead tenant fresh by sending a future heartbeat.
        // `last_heartbeat_at` is the reporter's own observation: a reporter
        // that keeps calling while the tenant it watches has not been seen for
        // hours must not launder its own liveness into the tenant's. Taking
        // the minimum makes a fresh request against stale upstream state read
        // as stale, which is the honest answer.
        //
        // Without a server receipt there is nothing to bound the reporter's
        // clock with, so freshness cannot be vouched for at all.
        let Some(checked_at) = runtime.checked_at else {
            return Self::Unknown;
        };
        let observed_at = match runtime.last_heartbeat_at {
            Some(heartbeat) => checked_at.min(heartbeat),
            None => checked_at,
        };
        if observed_at < now - Duration::seconds(stale_after_seconds.max(1)) {
            return Self::Stale;
        }
        match (runtime.api_healthy, runtime.worker_healthy) {
            (Some(true), Some(true)) => Self::Healthy,
            (Some(false), _) | (_, Some(false)) => Self::Degraded,
            _ => Self::Unknown,
        }
    }

    /// Lowercase wire form, matching the `#[serde(rename_all = "lowercase")]`
    /// serialization. The command-center global read model uses this to emit
    /// health as a string field alongside the typed enum, so the browser can
    /// render a single health badge without mirroring the enum vocabulary.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Healthy => "healthy",
            Self::Degraded => "degraded",
            Self::Stale => "stale",
            Self::Unknown => "unknown",
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
    /// Optional provider API keys (Bandsintown, YouTube, Spotify, etc.)
    /// written to tenant.env by the provisioner. Only included in the
    /// provisioning plan when deployCrowdrelay=true.
    #[serde(default)]
    pub provider_keys: Option<serde_json::Value>,
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
    /// Optional provider API keys to write to tenant.env.
    pub provider_keys: Option<serde_json::Value>,
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
    /// Optional provider API keys (Bandsintown, YouTube, Spotify, etc.)
    /// written to tenant.env by the provisioner.
    pub provider_keys: Option<serde_json::Value>,
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

/// Map a provisioning job's domain-specific `status` to the universal
/// semantic `phase` the UI reads to distinguish "we asked" from "it
/// happened". The existing `status` field stays for backward compat;
/// `phase` is the semantic layer that makes the accepted-vs-completed
/// distinction explicit.
///
/// - `planned`/`approved` → `accepted`: the Control Plane recorded the
///   intent; the provisioner has not started executing yet.
/// - `running` → `running`: the provisioner claimed the job and is
///   executing it.
/// - `succeeded` → `completed`: the provisioner reported a terminal
///   success result. This is the only phase that means "it happened".
/// - `failed`/`cancelled` → `failed`: the job reached a terminal
///   non-success state.
pub fn provisioning_phase(status: &str) -> &'static str {
    match status {
        "planned" | "approved" => "accepted",
        "running" => "running",
        "succeeded" => "completed",
        "failed" | "cancelled" => "failed",
        _ => "unknown",
    }
}

/// Map a notifier outbox `status` to the universal semantic `phase`.
///
/// - `pending` → `accepted`: the notification is queued for delivery; the
///   provider has not been contacted yet.
/// - `sent` → `accepted`: the provider accepted the POST. This does NOT
///   mean the recipient received the notification — it means the provider
///   took responsibility for delivery. The phase is "accepted" (not
///   "completed") to make this distinction explicit.
/// - `dead` → `failed`: delivery exhausted all retries without success.
pub fn notifier_phase(status: &str) -> &'static str {
    match status {
        "pending" | "sent" => "accepted",
        "dead" => "failed",
        _ => "unknown",
    }
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

    #[test]
    fn a_fresh_report_about_a_long_unseen_tenant_is_stale_not_healthy() {
        // The runtime observer keeps calling every 30s. If it reports a
        // heartbeat it observed hours ago, the *tenant* has not been seen
        // since — the observer's own liveness must not launder into the
        // tenant's. Before this, `checked_at=now()` alone decided freshness
        // and the panel rendered `healthy` for a tenant nobody had heard from.
        let now = Utc::now();
        let mut lagging = status(Some(true), Some(true), now);
        lagging.last_heartbeat_at = Some(now - Duration::hours(2));
        assert_eq!(
            RuntimeHealth::classify(Some(&lagging), now, 180),
            RuntimeHealth::Stale
        );

        // A report with no heartbeat at all still leans on the receipt: the
        // reporter observed the tenant now and simply had no heartbeat field.
        let mut receipt_only = status(Some(true), Some(true), now);
        receipt_only.last_heartbeat_at = None;
        assert_eq!(
            RuntimeHealth::classify(Some(&receipt_only), now, 180),
            RuntimeHealth::Healthy
        );

        // No server receipt means no bound on the reporter's clock, so the
        // row cannot vouch for its own freshness.
        let mut unreceipted = status(Some(true), Some(true), now);
        unreceipted.checked_at = None;
        assert_eq!(
            RuntimeHealth::classify(Some(&unreceipted), now, 180),
            RuntimeHealth::Unknown
        );
    }

    /// The stale threshold is the boundary between "live" and "stale". The
    /// boundary is inclusive on the live side: a heartbeat exactly at the
    /// threshold (180s ago) is still healthy; one second past (181s) is stale.
    /// This test pins the boundary so a refactor of the classification
    /// can't silently shift it.
    #[test]
    fn stale_threshold_boundary_is_respected() {
        let now = Utc::now();
        // Heartbeat exactly at the threshold (180s ago) → healthy (inclusive).
        let mut at_boundary = status(Some(true), Some(true), now);
        at_boundary.last_heartbeat_at = Some(now - Duration::seconds(180));
        assert_eq!(
            RuntimeHealth::classify(Some(&at_boundary), now, 180),
            RuntimeHealth::Healthy,
            "heartbeat at the threshold boundary must be healthy (inclusive)"
        );
        // Heartbeat one second inside (179s ago) → healthy.
        let mut inside = status(Some(true), Some(true), now);
        inside.last_heartbeat_at = Some(now - Duration::seconds(179));
        assert_eq!(
            RuntimeHealth::classify(Some(&inside), now, 180),
            RuntimeHealth::Healthy,
            "heartbeat one second inside the threshold must be healthy"
        );
        // Heartbeat one second past (181s ago) → stale.
        let mut past = status(Some(true), Some(true), now);
        past.last_heartbeat_at = Some(now - Duration::seconds(181));
        assert_eq!(
            RuntimeHealth::classify(Some(&past), now, 180),
            RuntimeHealth::Stale,
            "heartbeat one second past the threshold must be stale"
        );
    }

    // ── External operation phase mapping (#4) ────────────────────────────
    // The phase field distinguishes "we asked" from "it happened". The
    // existing status field stays for backward compat; phase is the
    // semantic layer the UI reads.

    #[test]
    fn provisioning_phase_distinguishes_accepted_from_completed() {
        // planned/approved: the Control Plane recorded the intent; the
        // provisioner has not started executing yet.
        assert_eq!(provisioning_phase("planned"), "accepted");
        assert_eq!(provisioning_phase("approved"), "accepted");
        // running: the provisioner claimed the job and is executing it.
        assert_eq!(provisioning_phase("running"), "running");
        // succeeded: the provisioner reported a terminal success result.
        // This is the only phase that means "it happened".
        assert_eq!(provisioning_phase("succeeded"), "completed");
        // failed/cancelled: terminal non-success state.
        assert_eq!(provisioning_phase("failed"), "failed");
        assert_eq!(provisioning_phase("cancelled"), "failed");
        // unknown status must not be fabricated as any other phase.
        assert_eq!(provisioning_phase("garbage"), "unknown");
    }

    #[test]
    fn notifier_phase_distinguishes_accepted_from_completed() {
        // pending: queued for delivery; provider not contacted yet.
        assert_eq!(notifier_phase("pending"), "accepted");
        // sent: provider accepted the POST. This does NOT mean the
        // recipient received the notification — it means the provider
        // took responsibility. Phase is "accepted", not "completed".
        assert_eq!(notifier_phase("sent"), "accepted");
        // dead: delivery exhausted all retries.
        assert_eq!(notifier_phase("dead"), "failed");
        // unknown status must not be fabricated as any other phase.
        assert_eq!(notifier_phase("garbage"), "unknown");
    }

    #[test]
    fn phase_is_never_completed_for_async_external_operations() {
        // The core invariant: any operation that crosses a process/network
        // boundary and does not synchronously observe the side effect must
        // not be "completed". Provisioning "succeeded" is the exception —
        // it is a terminal report from the provisioner, not a provider
        // acceptance. Notifier "sent" is NOT "completed" — the provider
        // accepted, but the recipient may not have received.
        assert_ne!(notifier_phase("sent"), "completed");
        assert_ne!(provisioning_phase("planned"), "completed");
        assert_ne!(provisioning_phase("approved"), "completed");
        assert_ne!(provisioning_phase("running"), "completed");
        // Only "succeeded" maps to "completed".
        assert_eq!(provisioning_phase("succeeded"), "completed");
    }
}
