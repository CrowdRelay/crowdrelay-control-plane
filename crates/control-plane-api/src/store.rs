use chrono::{Duration, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::{
    error::ApiError,
    model::{
        AuditRow, AutomationEventRow, AutomationWorkflowConfigRow, BillingEventInput, BillingState,
        BrandingPalette, CreateAutomationEventRequest, CreateTenantRequest, GuaranteeState,
        GuaranteeView, PlatformHealthRow, ProvisioningJobRow, RegionalProfile, RuntimeHealth,
        RuntimeReportRequest, RuntimeStatusRow, TenantDeploymentSpec, TenantGuaranteeRow,
        TenantRow, TenantSummary, TenantSummaryJoinRow,
    },
};

/// Whether a tenant's lifecycle is not fully owned by this plane — any of the
/// three capability columns saying no. Published to the tenant Overview read
/// model so the browser reads the flag instead of restating policy in JSX,
/// which is how it drifted before.
pub fn tenant_lifecycle_is_externally_owned(tenant: &TenantRow) -> bool {
    !(tenant.can_suspend && tenant.can_provision && tenant.can_remove)
}

/// Shared-Postgres placement coordinates the control plane stamps into
/// tenants and provisioning plans. The provisioner resolves them against
/// docker and validates the cluster against its own allowlist.
#[derive(Debug, Clone)]
pub struct SharedPgConfig {
    pub cluster: String,
    pub network: String,
    pub max_tenants: i64,
}

#[derive(Clone)]
pub struct Store {
    pool: PgPool,
    runtime_stale_after_seconds: i64,
    shared_pg: SharedPgConfig,
}

struct AuditRecord<'a> {
    tenant_id: Option<Uuid>,
    actor: &'a str,
    action: &'a str,
    target_kind: &'a str,
    target_id: String,
    request_id: Option<&'a str>,
    detail: Value,
}

pub(crate) struct ControlCommandAudit<'a> {
    pub tenant_id: Uuid,
    pub actor: &'a str,
    pub action: &'static str,
    pub target_kind: &'static str,
    pub target_id: String,
    pub request_id: Option<&'a str>,
    pub outcome: &'a str,
    /// The optimistic-concurrency version the caller sent to CrowdRelay.
    /// When CrowdRelay returns 409 (conflict), the audit row carries the
    /// version that was expected so the operator can see "failed because
    /// expected_version was X but current is Y" instead of just "failed".
    /// None for mutations that don't carry expected_version (notifier
    /// channel config, which is last-write-wins by design).
    pub expected_version: Option<u64>,
}

pub(crate) struct ProvisioningCompletion<'a> {
    pub api_port: u16,
    pub workspace_id: Uuid,
    pub schema_version: i32,
    pub deployed_sha: &'a str,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorAccountRow {
    pub id: Uuid,
    pub username: String,
    pub role: String,
    pub tenant_id: Option<Uuid>,
    pub active: bool,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkSnapshotRow {
    pub tenant_id: Uuid,
    pub parked_at: chrono::DateTime<Utc>,
    pub parked_by: String,
    pub agent_enabled: bool,
    pub dry_run: bool,
    pub posture: String,
    pub envelope_version: i64,
    pub weekly_owned_audience_touches: i32,
    pub weekly_third_party_touches: i32,
    pub subject_cooldown_hours: i32,
    pub max_recipients_per_step: i32,
    pub posture_version: i64,
    pub reason: Option<String>,
    pub unparked_at: Option<chrono::DateTime<Utc>>,
    pub unparked_by: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct OperatorAuthRow {
    pub id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub role: String,
    pub tenant_id: Option<Uuid>,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifierChannelRow {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub kind: String,
    pub label: String,
    pub config: Value,
    pub events: Vec<String>,
    pub enabled: bool,
}

#[derive(Debug, sqlx::FromRow)]
pub struct PendingNotification {
    pub id: Uuid,
    pub event: String,
    pub payload: Value,
    pub kind: String,
    pub label: String,
    pub config: Value,
}

/// A notification outbox entry joined with its channel, for the operator-
/// facing outbox read model. Delivery is at-least-once: `status = 'sent'`
/// means the provider accepted the POST, not that the recipient received it.
/// `attempts` is the delivery attempt count (incremented on each claim).
/// `last_error` is the most recent delivery error, if any.
#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct NotifierOutboxRow {
    pub id: Uuid,
    pub event: String,
    pub status: String,
    pub attempts: i32,
    pub last_error: Option<String>,
    pub channel_id: Uuid,
    pub channel_label: String,
    pub channel_kind: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Fleet-level health of the control plane's own notification outbox.
///
/// Per-tenant rows are listed by [`Self::notifier_outbox`], but nothing
/// opens every tenant's list: a dead `approvals.pending` row is a pending
/// approval the operator was never told about — the channel that would
/// report the failure is the one that failed. The command center's system
/// block is the one surface an operator always sees, so the counts live
/// there. `dead_7d` is windowed because dead rows never leave `dead`
/// status and an all-time count alarms forever over long-fixed failures;
/// `overdue_pending` counts rows due for longer than the dispatcher's
/// cadence can explain, i.e. the worker itself is down.
#[derive(Debug, Clone, Copy, sqlx::FromRow)]
pub struct NotificationOutboxHealth {
    pub dead_7d: i64,
    pub overdue_pending: i64,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitlistRow {
    pub id: Uuid,
    pub email: String,
    pub status: String,
    pub role: Option<String>,
    pub roster_size: Option<String>,
    pub fan_sources: Value,
    pub newsletter_opt_in: bool,
    pub referral_code: String,
    pub referred_by: Option<Uuid>,
    pub qualified_at: Option<chrono::DateTime<Utc>>,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

impl Store {
    pub fn new(pool: PgPool, runtime_stale_after_seconds: i64, shared_pg: SharedPgConfig) -> Self {
        Self {
            pool,
            runtime_stale_after_seconds,
            shared_pg,
        }
    }

    pub async fn migrate(&self) -> Result<(), ApiError> {
        sqlx::migrate!("../../migrations").run(&self.pool).await?;
        Ok(())
    }

    pub async fn ensure_virya(
        &self,
        workspace_id: Option<Uuid>,
        crowdrelay_url: &str,
        signal_url: &str,
        management_url: Option<&str>,
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"INSERT INTO control_plane_tenants
               (id, slug, display_name, status, workspace_id, crowdrelay_base_url, signal_base_url, default_country_code, branding_palette, synesthesia_enabled, area_enabled, signal_play_store_url, synesthesia_play_store_url, can_suspend, can_provision, can_remove)
               VALUES ($1, 'virya', 'Virya', 'active', $2, $3, $4, 'PL', NULL, true, true,
                       'https://play.google.com/store/apps/details?id=music.virya.signal',
                       'https://play.google.com/store/apps/details?id=music.virya.synesthesia',
                       true, false, false)
               ON CONFLICT (slug) DO UPDATE SET
                   workspace_id = COALESCE(control_plane_tenants.workspace_id, EXCLUDED.workspace_id),
                   crowdrelay_base_url = COALESCE(control_plane_tenants.crowdrelay_base_url, EXCLUDED.crowdrelay_base_url),
                   signal_base_url = COALESCE(control_plane_tenants.signal_base_url, EXCLUDED.signal_base_url),
                   signal_play_store_url = COALESCE(control_plane_tenants.signal_play_store_url, EXCLUDED.signal_play_store_url),
                   synesthesia_play_store_url = COALESCE(control_plane_tenants.synesthesia_play_store_url, EXCLUDED.synesthesia_play_store_url),
                   synesthesia_enabled = true,
                   can_suspend = true,
                   can_provision = false,
                   can_remove = false,
                   updated_at = now()"#,
        )
        .bind(Uuid::new_v4())
        .bind(workspace_id)
        .bind(crowdrelay_url)
        .bind(signal_url)
        .execute(&self.pool)
        .await?;
        // Virya's management target resolves through the same
        // `latest_management_url` read as every tenant: a succeeded
        // registration job carries the URL. Upserted each boot so the config
        // value stays the source of truth without a second resolution path.
        sqlx::query(
            r#"INSERT INTO control_plane_provisioning_jobs
               (id, tenant_id, status, plan, created_by, finished_at, result)
               SELECT gen_random_uuid(), t.id, 'succeeded',
                      '{"kind":"external_registration"}'::jsonb, 'ensure_virya', now(),
                      jsonb_build_object('localApiUrl', $1::text)
               FROM control_plane_tenants t
               WHERE t.slug = 'virya'
               ON CONFLICT (tenant_id) WHERE plan->>'kind' = 'external_registration'
               DO UPDATE SET result = EXCLUDED.result, updated_at = now()"#,
        )
        .bind(management_url.unwrap_or(crowdrelay_url))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_tenants(&self) -> Result<Vec<TenantSummary>, ApiError> {
        let rows = sqlx::query_as::<_, TenantSummaryJoinRow>(
            r#"SELECT t.id, t.slug, t.display_name, t.status, t.workspace_id,
                      t.crowdrelay_base_url, t.signal_base_url, t.default_country_code, t.regional_profile, t.branding_palette,
                      t.synesthesia_enabled, t.area_enabled,
                      t.signal_enabled, t.north_star_metric, t.fanbase_sources,
                      t.signal_play_store_url, t.synesthesia_play_store_url,
                      t.can_suspend, t.can_provision, t.can_remove, t.archetype,
                      t.placement, t.placement_cluster, t.placement_database,
                      t.team_members,
                      t.created_at, t.updated_at,
                      r.tenant_id AS runtime_tenant_id,
                      r.api_healthy AS runtime_api_healthy,
                      r.worker_healthy AS runtime_worker_healthy,
                      r.schema_version AS runtime_schema_version,
                      r.deployed_sha AS runtime_deployed_sha,
                      r.outbox_pending AS runtime_outbox_pending,
                      r.queue_lag AS runtime_queue_lag,
                      r.awaiting_approval AS runtime_awaiting_approval,
                      r.north_star_fans AS runtime_north_star_fans,
                      r.last_heartbeat_at AS runtime_last_heartbeat_at,
                      r.checked_at AS runtime_checked_at,
                      b.state AS billing_state,
                      b.subscription_started_at AS billing_subscription_started_at,
                      b.trial_ends_at AS billing_trial_ends_at,
                      b.current_period_ends_at AS billing_current_period_ends_at,
                      (SELECT COUNT(*) FROM control_plane_notifier_channels nc
                        WHERE nc.tenant_id = t.id AND nc.enabled) AS enabled_notifier_channels
               FROM control_plane_tenants t
               LEFT JOIN control_plane_runtime_status r ON r.tenant_id = t.id
               LEFT JOIN control_plane_tenant_billing b ON b.tenant_id = t.id
               ORDER BY CASE WHEN t.slug = 'virya' THEN 0 ELSE 1 END, t.display_name"#,
        )
        .fetch_all(&self.pool)
        .await?;
        let now = Utc::now();
        Ok(rows
            .into_iter()
            .map(|row| row.into_summary(now, self.runtime_stale_after_seconds))
            .collect())
    }

    pub async fn tenant_by_slug(&self, slug: &str) -> Result<TenantSummary, ApiError> {
        let row = sqlx::query_as::<_, TenantSummaryJoinRow>(
            r#"SELECT t.id, t.slug, t.display_name, t.status, t.workspace_id,
                      t.crowdrelay_base_url, t.signal_base_url, t.default_country_code, t.regional_profile, t.branding_palette,
                      t.synesthesia_enabled, t.area_enabled,
                      t.signal_enabled, t.north_star_metric, t.fanbase_sources,
                      t.signal_play_store_url, t.synesthesia_play_store_url,
                      t.can_suspend, t.can_provision, t.can_remove, t.archetype,
                      t.placement, t.placement_cluster, t.placement_database,
                      t.team_members,
                      t.created_at, t.updated_at,
                      r.tenant_id AS runtime_tenant_id,
                      r.api_healthy AS runtime_api_healthy,
                      r.worker_healthy AS runtime_worker_healthy,
                      r.schema_version AS runtime_schema_version,
                      r.deployed_sha AS runtime_deployed_sha,
                      r.outbox_pending AS runtime_outbox_pending,
                      r.queue_lag AS runtime_queue_lag,
                      r.awaiting_approval AS runtime_awaiting_approval,
                      r.north_star_fans AS runtime_north_star_fans,
                      r.last_heartbeat_at AS runtime_last_heartbeat_at,
                      r.checked_at AS runtime_checked_at,
                      b.state AS billing_state,
                      b.subscription_started_at AS billing_subscription_started_at,
                      b.trial_ends_at AS billing_trial_ends_at,
                      b.current_period_ends_at AS billing_current_period_ends_at,
                      (SELECT COUNT(*) FROM control_plane_notifier_channels nc
                        WHERE nc.tenant_id = t.id AND nc.enabled) AS enabled_notifier_channels
               FROM control_plane_tenants t
               LEFT JOIN control_plane_runtime_status r ON r.tenant_id = t.id
               LEFT JOIN control_plane_tenant_billing b ON b.tenant_id = t.id
               WHERE t.slug = $1"#,
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
        Ok(row.into_summary(Utc::now(), self.runtime_stale_after_seconds))
    }

    /// Mirrors a north-star change the tenant already accepted into the
    /// control-plane copy. The tenant's own `tenant_settings` row is what the
    /// brain reads — this copy only feeds the read models, so it is updated
    /// after the tenant write succeeds, never instead of it.
    pub async fn mirror_north_star_metric(
        &self,
        tenant_id: Uuid,
        value: &str,
    ) -> Result<(), ApiError> {
        sqlx::query(
            "UPDATE control_plane_tenants SET north_star_metric = $2, updated_at = now() WHERE id = $1",
        )
        .bind(tenant_id)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Slug lookup for session profiles — a cheap projection that never
    /// builds the full read model.
    pub async fn tenant_slug_by_id(&self, tenant_id: Uuid) -> Result<Option<String>, ApiError> {
        Ok(
            sqlx::query_scalar("SELECT slug FROM control_plane_tenants WHERE id = $1")
                .bind(tenant_id)
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    /// Seed/refresh the platform_admin row the panel login needs. The env
    /// password stays authoritative: rotating the env rotates the login on
    /// next boot. Existing sessions survive; new logins require the new
    /// password.
    pub async fn ensure_bootstrap_admin(
        &self,
        username: &str,
        password_hash: &str,
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"INSERT INTO control_plane_operator_accounts
               (id, username, password_hash, role, tenant_id)
               VALUES ($1, $2, $3, 'platform_admin', NULL)
               ON CONFLICT (username) DO UPDATE SET
                   password_hash = EXCLUDED.password_hash,
                   role = 'platform_admin',
                   tenant_id = NULL,
                   active = true,
                   updated_at = now()"#,
        )
        .bind(Uuid::new_v4())
        .bind(username)
        .bind(password_hash)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Seed/refresh the platform_viewer row. Same mechanism as
    /// [`ensure_bootstrap_admin`] but with the read-only role. The auth
    /// middleware blocks all mutations for this identity.
    pub async fn ensure_bootstrap_viewer(
        &self,
        username: &str,
        password_hash: &str,
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"INSERT INTO control_plane_operator_accounts
               (id, username, password_hash, role, tenant_id)
               VALUES ($1, $2, $3, 'platform_viewer', NULL)
               ON CONFLICT (username) DO UPDATE SET
                   password_hash = EXCLUDED.password_hash,
                   role = 'platform_viewer',
                   tenant_id = NULL,
                   active = true,
                   updated_at = now()"#,
        )
        .bind(Uuid::new_v4())
        .bind(username)
        .bind(password_hash)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn create_tenant(
        &self,
        input: CreateTenantRequest,
        palette: Option<BrandingPalette>,
        deployment: Option<&TenantDeploymentSpec>,
        initial_operator: Option<&crate::model::InitialOperator>,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<TenantSummary, ApiError> {
        let slug_exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM control_plane_tenants WHERE slug = $1)",
        )
        .bind(&input.slug)
        .fetch_one(&self.pool)
        .await?;
        if slug_exists {
            return Err(ApiError::Conflict(format!(
                "tenant {} already exists",
                input.slug
            )));
        }
        let id = Uuid::new_v4();
        let palette_json = palette.map(serde_json::to_value).transpose()?;
        let regional_profile_json = serde_json::to_value(&input.regional_profile)?;
        // Placement is validated in the route; an absent value derives from the
        // archetype so a caller that predates the field keeps the intended
        // shape (band/roster share the tenants cluster, label/festival_org go
        // dedicated).
        let archetype = input.archetype.as_deref().unwrap_or("band");
        let placement = input
            .placement
            .as_deref()
            .unwrap_or_else(|| crate::validation::default_placement(archetype));
        let (placement_cluster, placement_database) = if placement == "shared_pg" {
            (
                Some(self.shared_pg.cluster.clone()),
                Some(placement_database_name(&input.slug, &id)),
            )
        } else {
            (None, None)
        };
        // Already validated + key-filled by the route; `[]` covers a direct
        // caller that skips validation.
        let team_members_json =
            serde_json::to_value(input.team_members.as_deref().unwrap_or_default())?;
        let mut tx = self.pool.begin().await?;
        if placement == "shared_pg" {
            // Serialize concurrent shared-pg creations per cluster: without
            // the lock, two racing transactions count the same rows and both
            // pass the capacity check.
            sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
                .bind(&self.shared_pg.cluster)
                .execute(&mut *tx)
                .await?;
            // Refuse rather than degrade: a cluster at capacity must surface as
            // an error, never as a silently different placement.
            let used = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM control_plane_tenants \
                 WHERE placement = 'shared_pg' AND placement_cluster = $1",
            )
            .bind(&self.shared_pg.cluster)
            .fetch_one(&mut *tx)
            .await?;
            if used >= self.shared_pg.max_tenants {
                return Err(ApiError::Conflict(format!(
                    "shared placement cluster {} is at capacity ({} tenants)",
                    self.shared_pg.cluster, used
                )));
            }
        }
        let tenant = sqlx::query_as::<_, TenantRow>(
            r#"INSERT INTO control_plane_tenants
               (id, slug, display_name, status, workspace_id, crowdrelay_base_url, signal_base_url, default_country_code, regional_profile, branding_palette, synesthesia_enabled, area_enabled, signal_enabled, north_star_metric, fanbase_sources, signal_play_store_url, synesthesia_play_store_url, archetype, placement, placement_cluster, placement_database, team_members)
               VALUES ($1, $2, $3, 'provisioning', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
               RETURNING id, slug, display_name, status, workspace_id, crowdrelay_base_url,
                         signal_base_url, default_country_code, regional_profile, branding_palette, synesthesia_enabled, area_enabled,
                         signal_enabled, north_star_metric, fanbase_sources,
                         signal_play_store_url, synesthesia_play_store_url,
                         can_suspend, can_provision, can_remove, archetype,
                         placement, placement_cluster, placement_database,
                         team_members,
                         created_at, updated_at"#,
        )
        .bind(id)
        .bind(&input.slug)
        .bind(&input.display_name)
        .bind(input.workspace_id)
        .bind(&input.crowdrelay_base_url)
        .bind(&input.signal_base_url)
        .bind(&input.regional_profile.country_code)
        .bind(regional_profile_json)
        .bind(palette_json)
        .bind(input.synesthesia_enabled)
        .bind(input.area_enabled)
        .bind(input.signal_enabled)
        .bind(input.north_star_metric.as_deref().unwrap_or("activated_fans_30d"))
        .bind(&input.fanbase_sources)
        .bind(&input.signal_play_store_url)
        .bind(&input.synesthesia_play_store_url)
        // Validated in the route; the column default covers a direct caller.
        .bind(archetype)
        .bind(placement)
        .bind(&placement_cluster)
        .bind(&placement_database)
        .bind(&team_members_json)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| match error {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                ApiError::Conflict("tenant slug or workspace is already registered".to_owned())
            }
            other => ApiError::Database(other),
        })?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(id),
                actor,
                action: "tenant.created",
                target_kind: "tenant",
                target_id: id.to_string(),
                request_id,
                detail: json!({"slug": &input.slug, "regionalProfile": &input.regional_profile}),
            },
        )
        .await?;

        if let Some(operator) = initial_operator {
            Self::create_operator_account(&mut tx, id, &operator.username, &operator.password_hash)
                .await?;
            self.audit_tx(
                &mut tx,
                AuditRecord {
                    tenant_id: Some(id),
                    actor,
                    action: "tenant.operator.created",
                    target_kind: "operator_account",
                    target_id: operator.username.clone(),
                    request_id,
                    detail: json!({"role": "tenant_operator"}),
                },
            )
            .await?;
        }

        if let Some(deployment) = deployment {
            let plan = deployment_plan(&tenant, deployment, &self.shared_pg)?;
            let job_id = Uuid::new_v4();
            let job = sqlx::query_as::<_, ProvisioningJobRow>(
                r#"INSERT INTO control_plane_provisioning_jobs
                   (id, tenant_id, status, desired_version, plan, created_by)
                   VALUES ($1, $2, 'approved', $3, $4, $5)
                   RETURNING id, tenant_id, status, desired_version, plan, created_by,
                             attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                             result, error_code, error_detail, created_at, updated_at"#,
            )
            .bind(job_id)
            .bind(tenant.id)
            .bind(&deployment.desired_version)
            .bind(&plan)
            .bind(actor)
            .fetch_one(&mut *tx)
            .await?;
            self.audit_tx(
                &mut tx,
                AuditRecord {
                    tenant_id: Some(tenant.id),
                    actor,
                    action: "tenant.provisioning.requested",
                    target_kind: "provisioning_job",
                    target_id: job.id.to_string(),
                    request_id,
                    detail: json!({"desiredVersion": &deployment.desired_version, "createdWithTenant": true}),
                },
            )
            .await?;
        }

        tx.commit().await?;
        Ok(TenantSummary {
            tenant,
            runtime: None,
            runtime_health: RuntimeHealth::Unknown,
            billing: None,
            enabled_notifier_channels: 0,
        })
    }

    pub async fn update_branding(
        &self,
        slug: &str,
        palette: Option<BrandingPalette>,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<TenantSummary, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        let inherits_default = palette.is_none();
        let value = palette.map(serde_json::to_value).transpose()?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("UPDATE control_plane_tenants SET branding_palette = $2, updated_at = now() WHERE id = $1")
            .bind(tenant.tenant.id)
            .bind(value)
            .execute(&mut *tx)
            .await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant.tenant.id),
                actor,
                action: "tenant.branding.updated",
                target_kind: "tenant",
                target_id: tenant.tenant.id.to_string(),
                request_id,
                detail: json!({"inheritsDefault": inherits_default}),
            },
        )
        .await?;
        tx.commit().await?;
        self.tenant_by_slug(slug).await
    }

    pub async fn update_mobile_apps(
        &self,
        slug: &str,
        signal_play_store_url: Option<String>,
        synesthesia_play_store_url: Option<String>,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<TenantSummary, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "UPDATE control_plane_tenants SET signal_play_store_url = $2, synesthesia_play_store_url = $3, updated_at = now() WHERE id = $1",
        )
        .bind(tenant.tenant.id)
        .bind(&signal_play_store_url)
        .bind(&synesthesia_play_store_url)
        .execute(&mut *tx)
        .await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant.tenant.id),
                actor,
                action: "tenant.mobile_apps.updated",
                target_kind: "tenant",
                target_id: tenant.tenant.id.to_string(),
                request_id,
                detail: json!({
                    "signalPlayStoreUrl": signal_play_store_url,
                    "synesthesiaPlayStoreUrl": synesthesia_play_store_url,
                }),
            },
        )
        .await?;
        tx.commit().await?;
        self.tenant_by_slug(slug).await
    }

    pub async fn update_regional_profile(
        &self,
        slug: &str,
        profile: RegionalProfile,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<TenantSummary, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        if let Some(current) = tenant.tenant.regional_profile.as_ref() {
            let current: RegionalProfile =
                serde_json::from_value(current.clone()).map_err(|_| {
                    ApiError::Conflict(
                        "stored regional profile is invalid; repair it before editing".to_owned(),
                    )
                })?;
            if current.data_region != profile.data_region {
                return Err(ApiError::Conflict(
                    "dataRegion cannot be changed by ordinary tenant editing; use an explicit residency migration"
                        .to_owned(),
                ));
            }
        }

        let value = serde_json::to_value(&profile)?;
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "UPDATE control_plane_tenants SET regional_profile=$2, default_country_code=$3, updated_at=now() WHERE id=$1",
        )
        .bind(tenant.tenant.id)
        .bind(value)
        .bind(&profile.country_code)
        .execute(&mut *tx)
        .await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant.tenant.id),
                actor,
                action: "tenant.regional_profile.updated",
                target_kind: "tenant",
                target_id: tenant.tenant.id.to_string(),
                request_id,
                detail: json!({
                    "countryCode": profile.country_code,
                    "region": profile.region,
                    "locale": profile.locale,
                    "timezone": profile.timezone,
                    "currency": profile.currency,
                    "dateFormat": profile.date_format,
                    "numberFormat": profile.number_format,
                    "dataRegion": profile.data_region,
                }),
            },
        )
        .await?;
        tx.commit().await?;
        self.tenant_by_slug(slug).await
    }

    pub async fn set_status(
        &self,
        slug: &str,
        status: &str,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<TenantSummary, ApiError> {
        // Enforce the allowed lifecycle states — a future route must not be
        // able to write an arbitrary string into the status column.
        match status {
            "active" | "suspended" | "parked" | "provisioning" => {}
            _ => {
                return Err(ApiError::InvalidInput(
                    "status must be one of: active, suspended, parked, provisioning".to_owned(),
                ));
            }
        }
        // The capability guard only needs the flag, not the full tenant row —
        // the tenant_id for the audit comes from UPDATE ... RETURNING, and the
        // final summary is fetched once at the end.
        let can_suspend = sqlx::query_scalar::<_, bool>(
            "SELECT can_suspend FROM control_plane_tenants WHERE slug = $1",
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?;
        if can_suspend == Some(false) && (status == "suspended" || status == "parked") {
            return Err(ApiError::Conflict(
                "tenant lifecycle is externally owned and cannot be changed from Control Plane"
                    .to_owned(),
            ));
        }
        let mut tx = self.pool.begin().await?;
        let tenant_id: Uuid = sqlx::query_scalar(
            "UPDATE control_plane_tenants SET status = $2, updated_at = now() \
             WHERE slug = $1 RETURNING id",
        )
        .bind(slug)
        .bind(status)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(ApiError::NotFound)?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant_id),
                actor,
                action: "tenant.status.updated",
                target_kind: "tenant",
                target_id: tenant_id.to_string(),
                request_id,
                detail: json!({"status": status}),
            },
        )
        .await?;
        tx.commit().await?;
        self.tenant_by_slug(slug).await
    }

    /// Captures the autopilot envelope snapshot at park time.
    ///
    /// Called by the park route handler after it has read the current envelope
    /// and posture from CrowdRelay. The snapshot is the state restore on
    /// resume — without it, unpark would have to guess what the tenant was
    /// doing before it was parked.
    #[allow(clippy::too_many_arguments)]
    pub async fn save_park_snapshot(
        &self,
        tenant_id: Uuid,
        actor: &str,
        agent_enabled: bool,
        dry_run: bool,
        posture: &str,
        envelope_version: i64,
        weekly_owned_audience_touches: i32,
        weekly_third_party_touches: i32,
        subject_cooldown_hours: i32,
        max_recipients_per_step: i32,
        posture_version: i64,
        reason: Option<&str>,
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"INSERT INTO control_plane_tenant_park_snapshot
               (tenant_id, parked_by, agent_enabled, dry_run, posture, envelope_version,
                weekly_owned_audience_touches, weekly_third_party_touches,
                subject_cooldown_hours, max_recipients_per_step, posture_version, reason)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               ON CONFLICT (tenant_id) DO UPDATE
               SET parked_at = now(),
                   parked_by = EXCLUDED.parked_by,
                   agent_enabled = EXCLUDED.agent_enabled,
                   dry_run = EXCLUDED.dry_run,
                   posture = EXCLUDED.posture,
                   envelope_version = EXCLUDED.envelope_version,
                   weekly_owned_audience_touches = EXCLUDED.weekly_owned_audience_touches,
                   weekly_third_party_touches = EXCLUDED.weekly_third_party_touches,
                   subject_cooldown_hours = EXCLUDED.subject_cooldown_hours,
                   max_recipients_per_step = EXCLUDED.max_recipients_per_step,
                   posture_version = EXCLUDED.posture_version,
                   reason = EXCLUDED.reason,
                   unparked_at = NULL,
                   unparked_by = NULL"#,
        )
        .bind(tenant_id)
        .bind(actor)
        .bind(agent_enabled)
        .bind(dry_run)
        .bind(posture)
        .bind(envelope_version)
        .bind(weekly_owned_audience_touches)
        .bind(weekly_third_party_touches)
        .bind(subject_cooldown_hours)
        .bind(max_recipients_per_step)
        .bind(posture_version)
        .bind(reason)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Reads the park snapshot for a tenant. Returns `None` if the tenant
    /// was never parked or the snapshot was already consumed.
    pub async fn load_park_snapshot(
        &self,
        tenant_id: Uuid,
    ) -> Result<Option<ParkSnapshotRow>, ApiError> {
        let row = sqlx::query_as::<_, ParkSnapshotRow>(
            r#"SELECT tenant_id, parked_at, parked_by, agent_enabled, dry_run,
                      posture, envelope_version, weekly_owned_audience_touches,
                      weekly_third_party_touches, subject_cooldown_hours,
                      max_recipients_per_step, posture_version, reason,
                      unparked_at, unparked_by
               FROM control_plane_tenant_park_snapshot
               WHERE tenant_id = $1 AND unparked_at IS NULL"#,
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    /// Marks the park snapshot as consumed (unparked).
    pub async fn consume_park_snapshot(
        &self,
        tenant_id: Uuid,
        actor: &str,
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"UPDATE control_plane_tenant_park_snapshot
               SET unparked_at = now(), unparked_by = $2
               WHERE tenant_id = $1 AND unparked_at IS NULL"#,
        )
        .bind(tenant_id)
        .bind(actor)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn plan_provisioning(
        &self,
        slug: &str,
        desired_version: Option<String>,
        provider_keys: Option<&serde_json::Value>,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<(ProvisioningJobRow, bool), ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        let job_id = Uuid::new_v4();
        let project = format!("crowdrelay-{}", tenant.tenant.slug);
        let mut plan = json!({
            "schema": 2,
            "mode": "workspace_isolated_deployment",
            "composeProject": project,
            "tenantSlug": tenant.tenant.slug,
            "workspaceId": tenant.tenant.workspace_id,
            "crowdRelayBaseUrl": tenant.tenant.crowdrelay_base_url,
            "signalBaseUrl": tenant.tenant.signal_base_url,
            "defaultCountryCode": tenant.tenant.default_country_code,
            "synesthesiaEnabled": tenant.tenant.synesthesia_enabled,
            "teamMembers": tenant.tenant.team_members,
            "execution": "requires explicit deploy approval and the narrow provisioner agent"
        });
        if let Some(keys) = provider_keys {
            if let Some(obj) = keys.as_object() {
                // Only include non-empty string values — don't write empty keys to tenant.env
                let filtered: serde_json::Map<String, serde_json::Value> = obj
                    .iter()
                    .filter(|(_, v)| v.as_str().is_some_and(|s| !s.is_empty()))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                if !filtered.is_empty() {
                    plan["providerKeys"] = Value::Object(filtered);
                }
            }
        }
        let mut tx = self.pool.begin().await?;
        let inserted = sqlx::query_as::<_, ProvisioningJobRow>(
            r#"INSERT INTO control_plane_provisioning_jobs
               (id, tenant_id, status, desired_version, plan, created_by)
               VALUES ($1, $2, 'planned', $3, $4, $5)
               ON CONFLICT (tenant_id) WHERE status IN ('planned', 'approved', 'running') DO NOTHING
               RETURNING id, tenant_id, status, desired_version, plan, created_by,
                         attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                         result, error_code, error_detail, created_at, updated_at"#,
        )
        .bind(job_id)
        .bind(tenant.tenant.id)
        .bind(desired_version.as_deref())
        .bind(&plan)
        .bind(actor)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(row) = inserted {
            self.audit_tx(
                &mut tx,
                AuditRecord {
                    tenant_id: Some(tenant.tenant.id),
                    actor,
                    action: "tenant.provisioning.planned",
                    target_kind: "provisioning_job",
                    target_id: job_id.to_string(),
                    request_id,
                    detail: plan,
                },
            )
            .await?;
            tx.commit().await?;
            return Ok((row, true));
        }

        let existing = active_provisioning_job(&mut tx, tenant.tenant.id)
            .await?
            .ok_or_else(|| {
                ApiError::Conflict(
                    "active provisioning plan changed concurrently; retry".to_owned(),
                )
            })?;
        if existing.desired_version != desired_version {
            return Err(ApiError::Conflict(format!(
                "active provisioning plan already targets {}; finish or cancel it before requesting {}",
                existing
                    .desired_version
                    .as_deref()
                    .unwrap_or("the default version"),
                desired_version.as_deref().unwrap_or("the default version"),
            )));
        }
        tx.commit().await?;
        Ok((existing, false))
    }

    /// Request a deployment for a provisioner-managed tenant.
    ///
    /// Reached via `POST /tenants/{slug}/provisioning/reprovision`, which is
    /// platform-admin only — the promotion runbook's trigger (shared_pg ->
    /// dedicated) and the recovery primitive for a managed stack that needs a
    /// fresh provisioning pass. Tenant operators never reach it.
    ///
    /// The billing webhook calls this when a `subscription_started` lands on
    /// a tenant still in `provisioning` — payment becomes the provisioning
    /// intent. An operator's explicit deploy request upgrades a `planned`
    /// job the same way.
    pub async fn request_deployment(
        &self,
        slug: &str,
        desired_version: String,
        api_image: &str,
        worker_image: &str,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<(ProvisioningJobRow, bool), ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        if !tenant.tenant.can_provision {
            return Err(ApiError::Conflict(
                "tenant lifecycle is externally owned and is not provisioned by the tenant agent"
                    .to_owned(),
            ));
        }
        if tenant.tenant.status == "suspended" {
            return Err(ApiError::Conflict(
                "resume the tenant before requesting a deployment".to_owned(),
            ));
        }
        if tenant.tenant.status == "parked" {
            return Err(ApiError::Conflict(
                "unpark the tenant before requesting a deployment".to_owned(),
            ));
        }
        let deployment = TenantDeploymentSpec {
            desired_version,
            api_image: api_image.to_owned(),
            worker_image: worker_image.to_owned(),
            provider_keys: None,
        };
        let job_id = Uuid::new_v4();
        let plan = deployment_plan(&tenant.tenant, &deployment, &self.shared_pg)?;

        let mut tx = self.pool.begin().await?;
        let inserted = sqlx::query_as::<_, ProvisioningJobRow>(
            r#"INSERT INTO control_plane_provisioning_jobs
               (id, tenant_id, status, desired_version, plan, created_by)
               VALUES ($1, $2, 'approved', $3, $4, $5)
               ON CONFLICT (tenant_id) WHERE status IN ('planned', 'approved', 'running') DO NOTHING
               RETURNING id, tenant_id, status, desired_version, plan, created_by,
                         attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                         result, error_code, error_detail, created_at, updated_at"#,
        )
        .bind(job_id)
        .bind(tenant.tenant.id)
        .bind(&deployment.desired_version)
        .bind(&plan)
        .bind(actor)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some(row) = inserted {
            self.audit_tx(
                &mut tx,
                AuditRecord {
                    tenant_id: Some(tenant.tenant.id),
                    actor,
                    action: "tenant.provisioning.requested",
                    target_kind: "provisioning_job",
                    target_id: row.id.to_string(),
                    request_id,
                    detail: json!({"desiredVersion": &deployment.desired_version}),
                },
            )
            .await?;
            tx.commit().await?;
            return Ok((row, true));
        }

        let existing = active_provisioning_job(&mut tx, tenant.tenant.id)
            .await?
            .ok_or_else(|| {
                ApiError::Conflict("active provisioning job changed concurrently; retry".to_owned())
            })?;
        if existing.desired_version.as_deref() != Some(deployment.desired_version.as_str()) {
            return Err(ApiError::Conflict(format!(
                "active provisioning job already targets {}; finish or cancel it before requesting {}",
                existing
                    .desired_version
                    .as_deref()
                    .unwrap_or("the default version"),
                deployment.desired_version,
            )));
        }
        if existing.status == "planned" {
            let approved = sqlx::query_as::<_, ProvisioningJobRow>(
                r#"UPDATE control_plane_provisioning_jobs
                   SET status='approved', plan=$2, desired_version=$3, updated_at=now()
                   WHERE id=$1 AND status='planned'
                   RETURNING id, tenant_id, status, desired_version, plan, created_by,
                             attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                             result, error_code, error_detail, created_at, updated_at"#,
            )
            .bind(existing.id)
            .bind(&plan)
            .bind(&deployment.desired_version)
            .fetch_one(&mut *tx)
            .await?;
            self.audit_tx(
                &mut tx,
                AuditRecord {
                    tenant_id: Some(tenant.tenant.id),
                    actor,
                    action: "tenant.provisioning.approved",
                    target_kind: "provisioning_job",
                    target_id: approved.id.to_string(),
                    request_id,
                    detail: json!({"desiredVersion": &deployment.desired_version}),
                },
            )
            .await?;
            tx.commit().await?;
            return Ok((approved, false));
        }
        tx.commit().await?;
        Ok((existing, false))
    }

    pub async fn provisioning_jobs(
        &self,
        slug: &str,
        limit: i64,
    ) -> Result<Vec<ProvisioningJobRow>, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        self.provisioning_jobs_for(tenant.tenant.id, limit).await
    }

    /// Tenant-id variant for callers that already resolved the tenant, so one
    /// request does not pay for the same lookup twice.
    pub async fn provisioning_jobs_for(
        &self,
        tenant_id: uuid::Uuid,
        limit: i64,
    ) -> Result<Vec<ProvisioningJobRow>, ApiError> {
        Ok(sqlx::query_as::<_, ProvisioningJobRow>(
            r#"SELECT id, tenant_id, status, desired_version, plan, created_by,
                      attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                      result, error_code, error_detail, created_at, updated_at
               FROM control_plane_provisioning_jobs
               WHERE tenant_id=$1
               ORDER BY created_at DESC
               LIMIT $2"#,
        )
        .bind(tenant_id)
        .bind(limit.clamp(1, 50))
        .fetch_all(&self.pool)
        .await?)
    }

    pub async fn cancel_provisioning(
        &self,
        slug: &str,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<ProvisioningJobRow, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        let mut tx = self.pool.begin().await?;
        if let Some(running) = active_provisioning_job(&mut tx, tenant.tenant.id).await? {
            if running.status == "running" {
                return Err(ApiError::Conflict(
                    "a running deployment cannot be cancelled from the UI; wait for its lease/result".to_owned(),
                ));
            }
            let row = sqlx::query_as::<_, ProvisioningJobRow>(
                r#"UPDATE control_plane_provisioning_jobs
                   SET status='cancelled', finished_at=now(), claim_token_hash=NULL,
                       lease_expires_at=NULL, updated_at=now()
                   WHERE id=$1 AND status IN ('planned','approved')
                   RETURNING id, tenant_id, status, desired_version, plan, created_by,
                             attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                             result, error_code, error_detail, created_at, updated_at"#,
            )
            .bind(running.id)
            .fetch_one(&mut *tx)
            .await?;
            self.audit_tx(
                &mut tx,
                AuditRecord {
                    tenant_id: Some(tenant.tenant.id),
                    actor,
                    action: "tenant.provisioning.cancelled",
                    target_kind: "provisioning_job",
                    target_id: row.id.to_string(),
                    request_id,
                    detail: json!({}),
                },
            )
            .await?;
            tx.commit().await?;
            return Ok(row);
        }
        Err(ApiError::NotFound)
    }

    pub async fn claim_provisioning(
        &self,
        worker_id: &str,
        data_region: Option<&str>,
        lease_seconds: i64,
        actor: &str,
    ) -> Result<Option<crate::model::ProvisioningClaim>, ApiError> {
        let now = Utc::now();
        let lease_expires_at = now + Duration::seconds(lease_seconds.clamp(60, 3600));
        let mut tx = self.pool.begin().await?;

        let exhausted = sqlx::query_as::<_, ProvisioningJobRow>(
            r#"UPDATE control_plane_provisioning_jobs
               SET status='failed', finished_at=now(), claim_token_hash=NULL, lease_expires_at=NULL,
                   error_code='lease_exhausted', error_detail='provisioner lease expired repeatedly', updated_at=now()
               WHERE status='running' AND lease_expires_at <= now() AND attempt_count >= 3
               RETURNING id, tenant_id, status, desired_version, plan, created_by,
                         attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                         result, error_code, error_detail, created_at, updated_at"#,
        )
        .fetch_all(&mut *tx)
        .await?;
        for row in exhausted {
            self.audit_tx(
                &mut tx,
                AuditRecord {
                    tenant_id: Some(row.tenant_id),
                    actor,
                    action: "tenant.provisioning.lease_exhausted",
                    target_kind: "provisioning_job",
                    target_id: row.id.to_string(),
                    request_id: None,
                    detail: json!({"attemptCount": row.attempt_count}),
                },
            )
            .await?;
        }
        sqlx::query(
            r#"UPDATE control_plane_provisioning_jobs
               SET status='approved', claimed_by=NULL, claim_token_hash=NULL, lease_expires_at=NULL,
                   error_code=NULL, error_detail=NULL, updated_at=now()
               WHERE status='running' AND lease_expires_at <= now() AND attempt_count < 3"#,
        )
        .execute(&mut *tx)
        .await?;

        let candidate = sqlx::query_as::<_, ProvisioningJobRow>(
            r#"SELECT id, tenant_id, status, desired_version, plan, created_by,
                      attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                      result, error_code, error_detail, created_at, updated_at
               FROM control_plane_provisioning_jobs
               WHERE status='approved'
                 AND (
                   plan->>'schema' = '3'
                   OR (
                     plan->>'schema' IN ('4', '5')
                     AND $1::text IS NOT NULL
                     AND plan #>> '{regionalProfile,dataRegion}' = $1
                   )
                 )
               ORDER BY created_at ASC, id ASC
               FOR UPDATE SKIP LOCKED
               LIMIT 1"#,
        )
        .bind(data_region)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(candidate) = candidate else {
            tx.commit().await?;
            return Ok(None);
        };

        let claim_token = Uuid::new_v4().simple().to_string();
        let claim_hash: [u8; 32] = Sha256::digest(claim_token.as_bytes()).into();
        let job = sqlx::query_as::<_, ProvisioningJobRow>(
            r#"UPDATE control_plane_provisioning_jobs
               SET status='running', claimed_by=$2, claim_token_hash=$3, lease_expires_at=$4,
                   attempt_count=attempt_count+1, started_at=COALESCE(started_at, now()),
                   finished_at=NULL, result=NULL, error_code=NULL, error_detail=NULL, updated_at=now()
               WHERE id=$1 AND status='approved'
               RETURNING id, tenant_id, status, desired_version, plan, created_by,
                         attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                         result, error_code, error_detail, created_at, updated_at"#,
        )
        .bind(candidate.id)
        .bind(worker_id)
        .bind(claim_hash.to_vec())
        .bind(lease_expires_at)
        .fetch_one(&mut *tx)
        .await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(job.tenant_id),
                actor,
                action: "tenant.provisioning.claimed",
                target_kind: "provisioning_job",
                target_id: job.id.to_string(),
                request_id: None,
                detail: json!({"workerId": worker_id, "attemptCount": job.attempt_count}),
            },
        )
        .await?;
        tx.commit().await?;
        Ok(Some(crate::model::ProvisioningClaim { job, claim_token }))
    }

    pub async fn renew_provisioning_lease(
        &self,
        job_id: Uuid,
        worker_id: &str,
        claim_token: &str,
        lease_seconds: i64,
    ) -> Result<ProvisioningJobRow, ApiError> {
        let mut tx = self.pool.begin().await?;
        verify_provisioning_claim(&mut tx, job_id, worker_id, claim_token).await?;
        let lease_expires_at = Utc::now() + Duration::seconds(lease_seconds.clamp(60, 3600));
        let job = sqlx::query_as::<_, ProvisioningJobRow>(
            r#"UPDATE control_plane_provisioning_jobs
               SET lease_expires_at=$2, updated_at=now()
               WHERE id=$1 AND status='running'
               RETURNING id, tenant_id, status, desired_version, plan, created_by,
                         attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                         result, error_code, error_detail, created_at, updated_at"#,
        )
        .bind(job_id)
        .bind(lease_expires_at)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(job)
    }

    pub async fn complete_provisioning(
        &self,
        job_id: Uuid,
        worker_id: &str,
        claim_token: &str,
        completion: ProvisioningCompletion<'_>,
        actor: &str,
    ) -> Result<ProvisioningJobRow, ApiError> {
        let ProvisioningCompletion {
            api_port,
            workspace_id,
            schema_version,
            deployed_sha,
        } = completion;
        let mut tx = self.pool.begin().await?;
        let existing = provisioning_job_for_update(&mut tx, job_id)
            .await?
            .ok_or(ApiError::NotFound)?;
        if existing.status == "succeeded" {
            if provisioning_success_matches(
                &existing,
                worker_id,
                api_port,
                workspace_id,
                schema_version,
                deployed_sha,
            ) {
                tx.commit().await?;
                return Ok(existing);
            }
            return Err(ApiError::Conflict(
                "provisioning job already succeeded with a different result".to_owned(),
            ));
        }
        if existing.status != "running" {
            return Err(ApiError::Conflict(format!(
                "provisioning job is already terminal or inactive ({})",
                existing.status
            )));
        }
        let claim = verify_provisioning_claim(&mut tx, job_id, worker_id, claim_token).await?;
        let expected_sha = claim
            .desired_version
            .as_deref()
            .and_then(|value| value.strip_prefix("sha-"))
            .ok_or_else(|| {
                ApiError::Conflict("running provisioning job has no immutable image SHA".to_owned())
            })?;
        if expected_sha != deployed_sha {
            return Err(ApiError::Conflict(format!(
                "deployed SHA {deployed_sha} does not match planned SHA {expected_sha}"
            )));
        }
        // The management URL must resolve from inside this container, so the
        // tenant slug's crowdrelay-shared alias is recorded — 127.0.0.1 in the
        // result is this container's own loopback and answers nothing.
        let slug: String =
            sqlx::query_scalar("SELECT slug FROM control_plane_tenants WHERE id = $1")
                .bind(existing.tenant_id)
                .fetch_one(&mut *tx)
                .await?;
        let result = json!({
            "apiPort": api_port,
            "localApiUrl": format!("http://{slug}-api:8080"),
            "workspaceId": workspace_id,
            "schemaVersion": schema_version,
            "deployedSha": deployed_sha,
            "provisionerWorkerId": worker_id,
            "completedAt": Utc::now(),
        });
        let job = sqlx::query_as::<_, ProvisioningJobRow>(
            r#"UPDATE control_plane_provisioning_jobs
               SET status='succeeded', result=$2, finished_at=now(), claim_token_hash=NULL,
                   lease_expires_at=NULL, error_code=NULL, error_detail=NULL, updated_at=now()
               WHERE id=$1 AND status='running'
               RETURNING id, tenant_id, status, desired_version, plan, created_by,
                         attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                         result, error_code, error_detail, created_at, updated_at"#,
        )
        .bind(job_id)
        .bind(&result)
        .fetch_one(&mut *tx)
        .await?;
        // The workspace mapping is a fact about the completed deployment and
        // is always recorded. The status, however, belongs to the operator:
        // a tenant suspended or parked while its deployment ran stays in that
        // state — finishing a deploy must never silently undo that decision.
        sqlx::query(
            r#"UPDATE control_plane_tenants
               SET status = CASE WHEN status IN ('suspended', 'parked') THEN status ELSE 'active' END,
                   workspace_id=$2, updated_at=now()
               WHERE id=$1"#,
        )
        .bind(job.tenant_id)
        .bind(workspace_id)
        .execute(&mut *tx)
        .await
        .map_err(|error| match error {
            sqlx::Error::Database(db) if db.is_unique_violation() => ApiError::Conflict(
                "reported workspace is already mapped to another tenant".to_owned(),
            ),
            other => ApiError::Database(other),
        })?;
        // A successful provisioning job proves *what was deployed*, not that
        // the deployment is alive: nothing here probed the new build. Writing
        // `api_healthy=true` with a `now()` heartbeat — which this did — made
        // the panel report a healthy, freshly-seen tenant for the whole stale
        // window after a deploy that could have crash-looped on boot.
        //
        // So the provisioner writes deployment identity and explicitly
        // *unknows* every column that belongs to the telemetry authority. The
        // runtime reads `unknown` until an actual observation arrives.
        sqlx::query(
            r#"INSERT INTO control_plane_runtime_status
               (tenant_id, api_healthy, worker_healthy, schema_version, deployed_sha, outbox_pending, queue_lag, awaiting_approval, north_star_fans, last_heartbeat_at, checked_at)
               VALUES ($1,NULL,NULL,$2,$3,NULL,NULL,NULL,NULL,NULL,NULL)
               ON CONFLICT (tenant_id) DO UPDATE SET
                 api_healthy=NULL, worker_healthy=NULL, outbox_pending=NULL, queue_lag=NULL, awaiting_approval=NULL, north_star_fans=NULL,
                 schema_version=EXCLUDED.schema_version, deployed_sha=EXCLUDED.deployed_sha"#,
        )
        .bind(job.tenant_id)
        .bind(schema_version)
        .bind(deployed_sha)
        .execute(&mut *tx)
        .await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(job.tenant_id),
                actor,
                action: "tenant.provisioning.succeeded",
                target_kind: "provisioning_job",
                target_id: job.id.to_string(),
                request_id: None,
                detail: result,
            },
        )
        .await?;
        tx.commit().await?;
        Ok(job)
    }

    pub async fn fail_provisioning(
        &self,
        job_id: Uuid,
        worker_id: &str,
        claim_token: &str,
        error_code: &str,
        error_detail: Option<&str>,
        actor: &str,
    ) -> Result<ProvisioningJobRow, ApiError> {
        let mut tx = self.pool.begin().await?;
        let existing = provisioning_job_for_update(&mut tx, job_id)
            .await?
            .ok_or(ApiError::NotFound)?;
        if existing.status == "failed" {
            if existing.claimed_by.as_deref() == Some(worker_id)
                && existing.error_code.as_deref() == Some(error_code)
                && existing.error_detail.as_deref() == error_detail
            {
                tx.commit().await?;
                return Ok(existing);
            }
            return Err(ApiError::Conflict(
                "provisioning job already failed with a different terminal result".to_owned(),
            ));
        }
        if existing.status != "running" {
            return Err(ApiError::Conflict(format!(
                "provisioning job is already terminal or inactive ({})",
                existing.status
            )));
        }
        let claim = verify_provisioning_claim(&mut tx, job_id, worker_id, claim_token).await?;
        let job = sqlx::query_as::<_, ProvisioningJobRow>(
            r#"UPDATE control_plane_provisioning_jobs
               SET status='failed', finished_at=now(), claim_token_hash=NULL, lease_expires_at=NULL,
                   error_code=$2, error_detail=$3, updated_at=now()
               WHERE id=$1 AND status='running'
               RETURNING id, tenant_id, status, desired_version, plan, created_by,
                         attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                         result, error_code, error_detail, created_at, updated_at"#,
        )
        .bind(job_id)
        .bind(error_code)
        .bind(error_detail)
        .fetch_one(&mut *tx)
        .await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(claim.tenant_id),
                actor,
                action: "tenant.provisioning.failed",
                target_kind: "provisioning_job",
                target_id: job.id.to_string(),
                request_id: None,
                detail: json!({"errorCode": error_code, "attemptCount": job.attempt_count}),
            },
        )
        .await?;
        Self::enqueue_event_tx(
            &mut tx,
            claim.tenant_id,
            "provisioning.failed",
            &json!({
                "event": "provisioning.failed",
                "errorCode": error_code,
                "errorDetail": error_detail,
                "attemptCount": job.attempt_count,
                "desiredVersion": job.desired_version,
            }),
        )
        .await?;
        tx.commit().await?;
        Ok(job)
    }

    pub async fn ping(&self) -> Result<(), ApiError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    /// Total tenant count for metrics.
    pub async fn tenant_count(&self) -> Result<i64, ApiError> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM control_plane_tenants")
            .fetch_one(&self.pool)
            .await?;
        Ok(row.0)
    }

    /// Pending notification queue depth for metrics.
    pub async fn pending_notification_count(&self) -> Result<i64, ApiError> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM control_plane_notification_outbox WHERE status = 'pending'",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }

    /// Platform health summary: (service_name, healthy, last_status) tuples.
    ///
    /// The column is `last_status`, and nullable until a probe has run. This
    /// used to select `status`, which the table has never had, so every call
    /// failed and `/metrics` reported zero services.
    pub async fn platform_health_summary(
        &self,
    ) -> Result<Vec<(String, bool, Option<String>)>, ApiError> {
        let rows = sqlx::query_as::<_, (String, bool, Option<String>)>(
            "SELECT service, healthy, last_status FROM control_plane_platform_health ORDER BY service",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn report_runtime(
        &self,
        slug: &str,
        input: RuntimeReportRequest,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<TenantSummary, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        let previous_health = tenant.runtime_health;
        let first_report = tenant.runtime.is_none();
        let previous_schema = tenant.runtime.as_ref().and_then(|row| row.schema_version);
        let previous_sha = tenant
            .runtime
            .as_ref()
            .and_then(|row| row.deployed_sha.as_deref())
            .map(str::to_owned);
        // The pre-update queue depth is the arming threshold for the
        // `approvals.pending` notifier event below. An absent row arms at
        // zero: a tenant whose first report arrives with a backlog has asks
        // nobody was ever told about, which is exactly the event's case.
        let previous_awaiting = tenant
            .runtime
            .as_ref()
            .and_then(|row| row.awaiting_approval)
            .unwrap_or(0);

        let mut tx = self.pool.begin().await?;
        let runtime = sqlx::query_as::<_, RuntimeStatusRow>(
            r#"INSERT INTO control_plane_runtime_status
               (tenant_id, api_healthy, worker_healthy, schema_version, deployed_sha, outbox_pending, queue_lag, awaiting_approval, north_star_fans, last_heartbeat_at, checked_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
               ON CONFLICT (tenant_id) DO UPDATE SET
                 api_healthy=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                      OR control_plane_runtime_status.last_heartbeat_at IS NULL
                                      OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                  THEN COALESCE(EXCLUDED.api_healthy, control_plane_runtime_status.api_healthy)
                                  ELSE control_plane_runtime_status.api_healthy END,
                 worker_healthy=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                         OR control_plane_runtime_status.last_heartbeat_at IS NULL
                                         OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                     THEN COALESCE(EXCLUDED.worker_healthy, control_plane_runtime_status.worker_healthy)
                                     ELSE control_plane_runtime_status.worker_healthy END,
                 schema_version=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                         OR control_plane_runtime_status.last_heartbeat_at IS NULL
                                         OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                     THEN COALESCE(EXCLUDED.schema_version, control_plane_runtime_status.schema_version)
                                     ELSE control_plane_runtime_status.schema_version END,
                 deployed_sha=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                       OR control_plane_runtime_status.last_heartbeat_at IS NULL
                                       OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                   THEN COALESCE(EXCLUDED.deployed_sha, control_plane_runtime_status.deployed_sha)
                                   ELSE control_plane_runtime_status.deployed_sha END,
                 outbox_pending=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                         OR control_plane_runtime_status.last_heartbeat_at IS NULL
                                         OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                     THEN COALESCE(EXCLUDED.outbox_pending, control_plane_runtime_status.outbox_pending)
                                     ELSE control_plane_runtime_status.outbox_pending END,
                 queue_lag=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                    OR control_plane_runtime_status.last_heartbeat_at IS NULL
                                    OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                THEN COALESCE(EXCLUDED.queue_lag, control_plane_runtime_status.queue_lag)
                                ELSE control_plane_runtime_status.queue_lag END,
                 awaiting_approval=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                    OR control_plane_runtime_status.last_heartbeat_at IS NULL
                                    OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                THEN COALESCE(EXCLUDED.awaiting_approval, control_plane_runtime_status.awaiting_approval)
                                ELSE control_plane_runtime_status.awaiting_approval END,
                 north_star_fans=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                    OR control_plane_runtime_status.last_heartbeat_at IS NULL
                                    OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                THEN COALESCE(EXCLUDED.north_star_fans, control_plane_runtime_status.north_star_fans)
                                ELSE control_plane_runtime_status.north_star_fans END,
                 last_heartbeat_at=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                        THEN control_plane_runtime_status.last_heartbeat_at
                                        WHEN control_plane_runtime_status.last_heartbeat_at IS NULL
                                             OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                        THEN EXCLUDED.last_heartbeat_at
                                        ELSE control_plane_runtime_status.last_heartbeat_at END,
                 checked_at=now()
               RETURNING tenant_id, api_healthy, worker_healthy, schema_version, deployed_sha,
                         outbox_pending, queue_lag, awaiting_approval, north_star_fans, last_heartbeat_at, checked_at"#,
        )
        .bind(tenant.tenant.id)
        .bind(input.api_healthy)
        .bind(input.worker_healthy)
        .bind(input.schema_version)
        .bind(input.deployed_sha.as_deref())
        .bind(input.outbox_pending)
        .bind(input.queue_lag)
        .bind(input.awaiting_approval)
        .bind(input.north_star_fans)
        .bind(input.last_heartbeat_at)
        .fetch_one(&mut *tx)
        .await?;

        // The ninety-day guarantee freezes its baseline on the first report
        // that carries a fan-graph level: "your fan graph" means what was
        // actually measured, so the clock starts at first measurement rather
        // than at provisioning. Once frozen it never moves — ON CONFLICT
        // keeps the earliest baseline, and every later report only updates
        // `north_star_fans` on the runtime row above. When a subscription is
        // already recorded the deadline anchors to its start: the contract's
        // ninety days are the *paid* ninety days, and a tenant that paid
        // before its first measurement still gets its clock from payment.
        if let Some(fans) = input.north_star_fans {
            sqlx::query(
                r#"INSERT INTO control_plane_tenant_guarantee
                   (tenant_id, metric_key, baseline_value, baseline_captured_at, deadline)
                   VALUES ($1, 'activated_fans_30d', $2, COALESCE($3, now()),
                           COALESCE(
                               (SELECT subscription_started_at
                                FROM control_plane_tenant_billing
                                WHERE tenant_id = $1),
                               COALESCE($3, now())
                           ) + INTERVAL '90 days')
                   ON CONFLICT (tenant_id) DO NOTHING"#,
            )
            .bind(tenant.tenant.id)
            .bind(fans)
            .bind(input.last_heartbeat_at)
            .execute(&mut *tx)
            .await?;
        }

        let now = Utc::now();
        let current_health =
            RuntimeHealth::classify(Some(&runtime), now, self.runtime_stale_after_seconds);
        let meaningful_change = first_report
            || previous_health != current_health
            || previous_schema != runtime.schema_version
            || previous_sha.as_deref() != runtime.deployed_sha.as_deref();
        if meaningful_change {
            self.audit_tx(
                &mut tx,
                AuditRecord {
                    tenant_id: Some(tenant.tenant.id),
                    actor,
                    action: "tenant.runtime.changed",
                    target_kind: "tenant",
                    target_id: tenant.tenant.id.to_string(),
                    request_id,
                    detail: json!({
                        "previousHealth": previous_health,
                        "health": current_health,
                        "schemaVersion": runtime.schema_version,
                        "deployedSha": &runtime.deployed_sha,
                    }),
                },
            )
            .await?;
        }
        // Health transitions notify subscribed channels in the same
        // transaction. Schema/sha-only drift stays audit-only.
        if previous_health != current_health {
            let event = match current_health {
                RuntimeHealth::Degraded => Some("runtime.degraded"),
                RuntimeHealth::Stale => Some("runtime.stale"),
                RuntimeHealth::Healthy if !first_report => Some("runtime.recovered"),
                _ => None,
            };
            if let Some(event) = event {
                Self::enqueue_event_tx(
                    &mut tx,
                    tenant.tenant.id,
                    event,
                    &json!({
                        "event": event,
                        "previousHealth": previous_health,
                        "health": current_health,
                        "deployedSha": runtime.deployed_sha,
                        "outboxPending": runtime.outbox_pending,
                    }),
                )
                .await?;
            }
        }
        // A rise in the reported approval-queue depth notifies subscribed
        // channels in the same transaction. "Rise", not "nonzero": the queue
        // sitting ignored at five is the watchdog's story, while the jump
        // from five to eight is asks the operator was never told about — and
        // a 60-second heartbeat re-firing on a flat backlog would train the
        // channel to be ignored. Draining to any lower value re-arms the
        // edge, so the next ask that lands still reaches somebody.
        Self::raise_outreach_alerts(&mut tx, tenant.tenant.id, &input).await?;
        let current_awaiting = runtime.awaiting_approval.unwrap_or(0);
        if current_awaiting > previous_awaiting {
            Self::enqueue_event_tx(
                &mut tx,
                tenant.tenant.id,
                "approvals.pending",
                &json!({
                    "event": "approvals.pending",
                    "awaitingApproval": current_awaiting,
                    "previousAwaitingApproval": previous_awaiting,
                }),
            )
            .await?;
        }
        tx.commit().await?;
        Ok(TenantSummary {
            enabled_notifier_channels: tenant.enabled_notifier_channels,
            tenant: tenant.tenant,
            runtime: Some(runtime),
            runtime_health: current_health,
            billing: tenant.billing,
        })
    }

    /// The ninety-day guarantee as a read: the frozen baseline, the latest
    /// reported fan-graph level, and the verdict derived from both against
    /// the deadline. The verdict is computed here and never stored — a row
    /// that could disagree with its own numbers is how a refund question
    /// turns into an argument.
    ///
    /// `refund_owed` covers "the deadline passed and the graph did not grow"
    /// *and* "the deadline passed with nothing measured": the contract cannot
    /// be judged kept on a number nobody saw.
    pub async fn tenant_guarantee(&self, slug: &str) -> Result<GuaranteeView, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        let guarantee = sqlx::query_as::<_, TenantGuaranteeRow>(
            "SELECT tenant_id, metric_key, baseline_value, baseline_captured_at, deadline, created_at \
             FROM control_plane_tenant_guarantee WHERE tenant_id = $1",
        )
        .bind(tenant.tenant.id)
        .fetch_optional(&self.pool)
        .await?;
        let current = tenant.runtime.as_ref().and_then(|row| row.north_star_fans);
        let current_at = tenant
            .runtime
            .as_ref()
            .and_then(|row| row.last_heartbeat_at);
        let now = Utc::now();
        let Some(row) = guarantee else {
            return Ok(GuaranteeView {
                state: GuaranteeState::Unmeasured,
                metric_key: "activated_fans_30d".to_owned(),
                baseline_value: None,
                baseline_captured_at: None,
                deadline: None,
                current_value: current,
                current_captured_at: current_at,
                days_remaining: None,
            });
        };
        let elapsed = now >= row.deadline;
        let state = GuaranteeState::derive(elapsed, current, row.baseline_value);
        Ok(GuaranteeView {
            state,
            metric_key: row.metric_key,
            baseline_value: Some(row.baseline_value),
            baseline_captured_at: Some(row.baseline_captured_at),
            deadline: Some(row.deadline),
            current_value: current,
            current_captured_at: current_at,
            days_remaining: (!elapsed).then(|| (row.deadline - now).num_days()),
        })
    }

    /// One billing webhook event applied to the tenant's subscription row.
    ///
    /// The state machine lives in `BillingState::apply`: events that do not
    /// move the machine (a `payment_failed` landing after `refunded`) leave
    /// the row untouched and return the current state. `subscription_started`
    /// is the only event that writes every field — a new subscription is a
    /// new contract, so provider ids and the start instant are replaced, not
    /// merged. Other events keep the recorded start: a `payment_succeeded`
    /// arriving before its `subscription_started` (provider ordering is not
    /// guaranteed) still creates a row, anchored to receipt time rather than
    /// invented.
    ///
    /// Returns `(previous, current)` so the caller can audit the transition.
    pub async fn apply_billing_event(
        &self,
        tenant_id: Uuid,
        input: &BillingEventInput,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<(Option<BillingState>, Option<BillingState>), ApiError> {
        let now = Utc::now();
        let mut tx = self.pool.begin().await?;
        let current_raw = sqlx::query_scalar::<_, String>(
            "SELECT state FROM control_plane_tenant_billing WHERE tenant_id = $1 FOR UPDATE",
        )
        .bind(tenant_id)
        .fetch_optional(&mut *tx)
        .await?;
        let previous = current_raw.as_deref().and_then(BillingState::parse);
        let in_trial = input.trial_ends_at.is_some_and(|end| end > now);
        let next = BillingState::apply(previous, &input.event, in_trial);
        let Some(state) = next else {
            tx.commit().await?;
            return Ok((previous, previous));
        };
        let started_at = if input.event == "subscription_started" {
            input.subscription_started_at.unwrap_or(now)
        } else {
            now
        };
        sqlx::query(
            r#"INSERT INTO control_plane_tenant_billing
               (tenant_id, provider, provider_customer_id, provider_subscription_id,
                state, subscription_started_at, trial_ends_at, current_period_ends_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (tenant_id) DO UPDATE SET
                 provider = EXCLUDED.provider,
                 provider_customer_id = COALESCE(EXCLUDED.provider_customer_id,
                                                 control_plane_tenant_billing.provider_customer_id),
                 provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id,
                                                     control_plane_tenant_billing.provider_subscription_id),
                 state = EXCLUDED.state,
                 subscription_started_at = CASE WHEN $9::bool
                     THEN EXCLUDED.subscription_started_at
                     ELSE control_plane_tenant_billing.subscription_started_at END,
                 trial_ends_at = COALESCE(EXCLUDED.trial_ends_at,
                                          control_plane_tenant_billing.trial_ends_at),
                 current_period_ends_at = COALESCE(EXCLUDED.current_period_ends_at,
                                                   control_plane_tenant_billing.current_period_ends_at),
                 updated_at = now()"#,
        )
        .bind(tenant_id)
        .bind(&input.provider)
        .bind(&input.provider_customer_id)
        .bind(&input.provider_subscription_id)
        .bind(state.as_str())
        .bind(started_at)
        .bind(input.trial_ends_at)
        .bind(input.current_period_ends_at)
        .bind(input.event == "subscription_started")
        .execute(&mut *tx)
        .await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant_id),
                actor,
                action: "tenant.billing.transition",
                target_kind: "tenant_billing",
                target_id: tenant_id.to_string(),
                request_id,
                detail: json!({
                    "event": &input.event,
                    "previousState": previous.map(BillingState::as_str),
                    "state": state.as_str(),
                    "provider": &input.provider,
                    "providerSubscriptionId": &input.provider_subscription_id,
                }),
            },
        )
        .await?;
        tx.commit().await?;
        Ok((previous, next))
    }

    /// The paid ninety-day window starts when money changes hands. A pilot
    /// that measured before payment froze a baseline against free days; on
    /// `subscription_started` the contract re-anchors — baseline becomes the
    /// level the graph stood at when the customer started paying (the latest
    /// heartbeat value), and the deadline becomes ninety days from now.
    /// Growth delivered for free before the contract does not count toward
    /// it, and a decline during the paid window cannot hide behind it.
    ///
    /// Returns true when a guarantee row was re-anchored.
    pub async fn anchor_guarantee_to_subscription(
        &self,
        tenant_id: Uuid,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<bool, ApiError> {
        let mut tx = self.pool.begin().await?;
        let anchored = sqlx::query_scalar::<_, i64>(
            r#"UPDATE control_plane_tenant_guarantee
               SET baseline_value = COALESCE(
                       (SELECT north_star_fans FROM control_plane_runtime_status
                        WHERE tenant_id = $1),
                       baseline_value),
                   baseline_captured_at = now(),
                   deadline = now() + INTERVAL '90 days'
               WHERE tenant_id = $1
               RETURNING baseline_value"#,
        )
        .bind(tenant_id)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(baseline) = anchored {
            self.audit_tx(
                &mut tx,
                AuditRecord {
                    tenant_id: Some(tenant_id),
                    actor,
                    action: "tenant.guarantee.anchored_to_subscription",
                    target_kind: "tenant_guarantee",
                    target_id: tenant_id.to_string(),
                    request_id,
                    detail: json!({"baselineValue": baseline}),
                },
            )
            .await?;
        }
        tx.commit().await?;
        Ok(anchored.is_some())
    }

    pub async fn set_area_enabled(
        &self,
        slug: &str,
        enabled: bool,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<bool, ApiError> {
        let mut tx = self.pool.begin().await?;
        let tenant_id: Uuid = sqlx::query_scalar(
            "UPDATE control_plane_tenants SET area_enabled=$2,updated_at=now() \
             WHERE slug=$1 RETURNING id",
        )
        .bind(slug)
        .bind(enabled)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(ApiError::NotFound)?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant_id),
                actor,
                action: "tenant.area.entitlement.updated",
                target_kind: "tenant",
                target_id: tenant_id.to_string(),
                request_id,
                detail: json!({"enabled": enabled}),
            },
        )
        .await?;
        tx.commit().await?;
        Ok(enabled)
    }

    pub async fn latest_management_url(&self, tenant_id: Uuid) -> Result<Option<String>, ApiError> {
        Ok(sqlx::query_scalar::<_, String>(
            r#"SELECT result->>'localApiUrl'
               FROM control_plane_provisioning_jobs
               WHERE tenant_id=$1 AND status='succeeded' AND result ? 'localApiUrl'
               ORDER BY finished_at DESC NULLS LAST, created_at DESC
               LIMIT 1"#,
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn audit_area_command(
        &self,
        tenant_id: Uuid,
        actor: &str,
        action: &'static str,
        drop_id: Option<&str>,
        request_id: Option<&str>,
        outcome: &str,
    ) -> Result<(), ApiError> {
        let mut tx = self.pool.begin().await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant_id),
                actor,
                action,
                target_kind: "area_drop",
                target_id: drop_id.unwrap_or("area").to_owned(),
                request_id,
                detail: json!({"outcome": outcome}),
            },
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Check whether an external deploy dispatch for this tenant was recorded
    /// within the cooldown window. GitHub's `workflow_dispatch` endpoint is not
    /// idempotent, so a duplicate click within the cooldown would trigger a
    /// second workflow run for the same target. Returns the timestamp of the
    /// most recent accepted/unknown dispatch if one exists within the window.
    pub async fn recent_external_deploy(
        &self,
        tenant_id: Uuid,
        cooldown_seconds: i64,
    ) -> Result<Option<chrono::DateTime<chrono::Utc>>, ApiError> {
        let row = sqlx::query_scalar::<_, Option<chrono::DateTime<chrono::Utc>>>(
            "SELECT MAX(created_at) FROM control_plane_audit_log
             WHERE tenant_id = $1
               AND action = 'tenant.deploy.dispatched'
               AND target_kind = 'external_deploy'
               AND (detail->>'outcome') IN ('accepted', 'unknown')
               AND created_at > now() - ($2 || ' seconds')::interval",
        )
        .bind(tenant_id)
        .bind(cooldown_seconds.to_string())
        .fetch_one(&self.pool)
        .await?;
        Ok(row)
    }

    /// Audit for a deploy the Control Plane hands to an external system
    /// (currently the `ecosystem-deploy` GitHub Actions workflow used by
    /// externally-owned tenants). This path mutates a production host through
    /// a third party, so it carries the same actor/request correlation as an
    /// in-house provisioning job plus the identity of what was dispatched —
    /// otherwise the only trace of the most consequential button in the panel
    /// is a log line.
    pub async fn audit_external_deploy(
        &self,
        tenant_id: Uuid,
        slug: &str,
        actor: &str,
        request_id: Option<&str>,
        outcome: &str,
        detail: Value,
    ) -> Result<(), ApiError> {
        let mut tx = self.pool.begin().await?;
        let mut detail = detail;
        if let Some(object) = detail.as_object_mut() {
            object.insert("outcome".to_owned(), Value::String(outcome.to_owned()));
        }
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant_id),
                actor,
                action: "tenant.deploy.dispatched",
                target_kind: "external_deploy",
                target_id: slug.to_owned(),
                request_id,
                detail,
            },
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn audit_control_command(
        &self,
        command: ControlCommandAudit<'_>,
    ) -> Result<(), ApiError> {
        let mut detail = json!({"outcome": command.outcome});
        if let Some(version) = command.expected_version {
            if let Some(obj) = detail.as_object_mut() {
                obj.insert("expectedVersion".to_owned(), json!(version));
            }
        }
        let mut tx = self.pool.begin().await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(command.tenant_id),
                actor: command.actor,
                action: command.action,
                target_kind: command.target_kind,
                target_id: command.target_id.clone(),
                request_id: command.request_id,
                detail,
            },
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Tenant-id variant for callers that already resolved the tenant.
    pub async fn audit_for_tenant_id(
        &self,
        tenant_id: uuid::Uuid,
        limit: i64,
    ) -> Result<Vec<AuditRow>, ApiError> {
        Ok(sqlx::query_as::<_, AuditRow>(
            r#"SELECT id, tenant_id, actor, action, target_kind, target_id, request_id, detail, created_at
               FROM control_plane_audit_log
               WHERE tenant_id = $1
               ORDER BY created_at DESC
               LIMIT $2"#,
        )
        .bind(tenant_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?)
    }

    async fn audit_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        record: AuditRecord<'_>,
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"INSERT INTO control_plane_audit_log
               (id, tenant_id, actor, action, target_kind, target_id, request_id, detail)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)"#,
        )
        .bind(Uuid::new_v4())
        .bind(record.tenant_id)
        .bind(record.actor)
        .bind(record.action)
        .bind(record.target_kind)
        .bind(record.target_id)
        .bind(record.request_id)
        .bind(record.detail)
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    // --- Operator accounts --------------------------------------------------

    pub async fn create_operator_account(
        tx: &mut Transaction<'_, Postgres>,
        tenant_id: Uuid,
        username: &str,
        password_hash: &str,
    ) -> Result<OperatorAccountRow, ApiError> {
        sqlx::query_as::<_, OperatorAccountRow>(
            r#"INSERT INTO control_plane_operator_accounts
               (id, username, password_hash, role, tenant_id)
               VALUES ($1, $2, $3, 'tenant_operator', $4)
               RETURNING id, username, role, tenant_id, active"#,
        )
        .bind(Uuid::new_v4())
        .bind(username)
        .bind(password_hash)
        .bind(tenant_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(|error| match error {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                ApiError::Conflict("operator username is already taken".to_owned())
            }
            other => ApiError::Database(other),
        })
    }

    pub async fn list_operator_accounts(
        &self,
        tenant_id: Uuid,
    ) -> Result<Vec<OperatorAccountRow>, ApiError> {
        Ok(sqlx::query_as::<_, OperatorAccountRow>(
            r#"SELECT id, username, role, tenant_id, active
               FROM control_plane_operator_accounts
               WHERE tenant_id = $1 AND role = 'tenant_operator'
               ORDER BY created_at"#,
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await?)
    }

    /// Standalone account creation with its audit row in one transaction.
    pub async fn create_tenant_operator(
        &self,
        tenant_id: Uuid,
        username: &str,
        password_hash: &str,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<OperatorAccountRow, ApiError> {
        let mut tx = self.pool.begin().await?;
        let account =
            Self::create_operator_account(&mut tx, tenant_id, username, password_hash).await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant_id),
                actor,
                action: "tenant.operator.created",
                target_kind: "operator_account",
                target_id: username.to_owned(),
                request_id,
                detail: json!({"role": "tenant_operator"}),
            },
        )
        .await?;
        tx.commit().await?;
        Ok(account)
    }

    pub async fn delete_operator_account(
        &self,
        tenant_id: Uuid,
        account_id: Uuid,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<bool, ApiError> {
        let mut tx = self.pool.begin().await?;
        let result = sqlx::query(
            "DELETE FROM control_plane_operator_accounts WHERE id = $1 AND tenant_id = $2 AND role = 'tenant_operator'",
        )
        .bind(account_id)
        .bind(tenant_id)
        .execute(&mut *tx)
        .await?;
        if result.rows_affected() == 0 {
            return Err(ApiError::NotFound);
        }
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant_id),
                actor,
                action: "tenant.operator.removed",
                target_kind: "operator_account",
                target_id: account_id.to_string(),
                request_id,
                detail: json!({}),
            },
        )
        .await?;
        tx.commit().await?;
        Ok(true)
    }

    /// Removes a tenant from the control plane.
    ///
    /// This unregisters the tenant here; it does not delete the tenant's own
    /// data. Those rows live in that tenant's CrowdRelay workspace, reached
    /// through `workspace_id`, and nothing in this transaction touches them.
    /// Worth stating plainly — "remove tenant" reads like it means more.
    ///
    /// `caller_confirmation` must repeat the slug. A tenant is removed from a
    /// list where the neighbouring row is a different production system, so the
    /// operator names the one they mean rather than confirming whatever the
    /// click landed on.
    ///
    /// Virya is refused here and refused again by the `BEFORE DELETE` trigger
    /// from migration 0012. This check exists so the operator gets a reason
    /// rather than a database error; the trigger exists because this check is
    /// the kind of thing a future route forgets.
    pub async fn delete_tenant(
        &self,
        slug: &str,
        caller_confirmation: &str,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<(), ApiError> {
        let can_remove = sqlx::query_scalar::<_, bool>(
            "SELECT can_remove FROM control_plane_tenants WHERE slug = $1",
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?;
        if can_remove == Some(false) {
            return Err(ApiError::Forbidden(
                "this tenant's lifecycle is externally owned and cannot be removed".to_owned(),
            ));
        }
        if caller_confirmation != slug {
            return Err(ApiError::InvalidInput(
                "confirmation must repeat the tenant slug".to_owned(),
            ));
        }
        let tenant = self.tenant_by_slug(slug).await?;
        let mut tx = self.pool.begin().await?;
        // Audited before the delete: the audit row's `tenant_id` is
        // `ON DELETE SET NULL`, so writing it afterwards would leave a record
        // that cannot say which tenant it was about. `target_id` carries the
        // slug, so the trail outlives the row it describes.
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant.tenant.id),
                actor,
                action: "tenant.removed",
                target_kind: "tenant",
                target_id: slug.to_owned(),
                request_id,
                detail: json!({
                    "display_name": tenant.tenant.display_name,
                    "workspace_id": tenant.tenant.workspace_id,
                    "status_before_removal": tenant.tenant.status,
                }),
            },
        )
        .await?;
        let removed = sqlx::query("DELETE FROM control_plane_tenants WHERE id = $1 AND slug = $2")
            .bind(tenant.tenant.id)
            .bind(slug)
            .execute(&mut *tx)
            .await?;
        if removed.rows_affected() == 0 {
            return Err(ApiError::NotFound);
        }
        tx.commit().await?;
        Ok(())
    }

    /// Authentication lookup including the password hash — never serialized
    /// to responses.
    pub async fn find_active_account_with_secret(
        &self,
        username: &str,
    ) -> Result<Option<OperatorAuthRow>, ApiError> {
        Ok(sqlx::query_as::<_, OperatorAuthRow>(
            r#"SELECT id, username, password_hash, role, tenant_id
               FROM control_plane_operator_accounts
               WHERE username = $1 AND active"#,
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn create_session(
        &self,
        account_id: Uuid,
        token_hash: &[u8],
        expires_at: chrono::DateTime<Utc>,
    ) -> Result<(), ApiError> {
        sqlx::query("INSERT INTO control_plane_operator_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)")
            .bind(token_hash)
            .bind(account_id)
            .bind(expires_at)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Resolve a session token to its live account and slide `last_seen_at`
    /// forward in the same statement — expired or deactivated accounts stop
    /// resolving immediately.
    pub async fn resolve_session(
        &self,
        token_hash: &[u8; 32],
    ) -> Result<OperatorAccountRow, ApiError> {
        sqlx::query_as::<_, OperatorAccountRow>(
            r#"UPDATE control_plane_operator_sessions s
               SET last_seen_at = now()
               FROM control_plane_operator_accounts a
               WHERE s.token_hash = $1
                 AND a.id = s.account_id
                 AND a.active
                 AND s.expires_at > now()
               RETURNING a.id, a.username, a.role, a.tenant_id, a.active"#,
        )
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::Unauthorized)
    }

    pub async fn revoke_session(&self, token_hash: &[u8]) -> Result<(), ApiError> {
        sqlx::query("DELETE FROM control_plane_operator_sessions WHERE token_hash = $1")
            .bind(token_hash)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Delete expired sessions. Called hourly by the retention worker so the
    /// sessions table does not grow without bound. `resolve_session` already
    /// filters on `expires_at > now()`, so expired rows are dead weight.
    pub async fn sweep_expired_sessions(&self) -> Result<u64, ApiError> {
        let result =
            sqlx::query("DELETE FROM control_plane_operator_sessions WHERE expires_at < now()")
                .execute(&self.pool)
                .await?;
        Ok(result.rows_affected())
    }

    // --- Notifier channels --------------------------------------------------

    pub async fn create_notifier_channel(
        &self,
        tenant_id: Uuid,
        kind: &str,
        label: &str,
        config: Value,
        events: Vec<String>,
        enabled: bool,
    ) -> Result<NotifierChannelRow, ApiError> {
        sqlx::query_as::<_, NotifierChannelRow>(
            r#"INSERT INTO control_plane_notifier_channels
               (id, tenant_id, kind, label, config, events, enabled)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id, tenant_id, kind, label, config, events, enabled"#,
        )
        .bind(Uuid::new_v4())
        .bind(tenant_id)
        .bind(kind)
        .bind(label)
        .bind(config)
        .bind(events)
        .bind(enabled)
        .fetch_one(&self.pool)
        .await
        .map_err(|error| match error {
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                ApiError::Conflict("a channel with this label already exists".to_owned())
            }
            other => ApiError::Database(other),
        })
    }

    pub async fn list_notifier_channels(
        &self,
        tenant_id: Uuid,
    ) -> Result<Vec<NotifierChannelRow>, ApiError> {
        Ok(sqlx::query_as::<_, NotifierChannelRow>(
            r#"SELECT id, tenant_id, kind, label, config, events, enabled
               FROM control_plane_notifier_channels
               WHERE tenant_id = $1
               ORDER BY created_at"#,
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await?)
    }

    pub async fn get_notifier_channel(
        &self,
        tenant_id: Uuid,
        channel_id: Uuid,
    ) -> Result<NotifierChannelRow, ApiError> {
        sqlx::query_as::<_, NotifierChannelRow>(
            r#"SELECT id, tenant_id, kind, label, config, events, enabled
               FROM control_plane_notifier_channels
               WHERE id = $1 AND tenant_id = $2"#,
        )
        .bind(channel_id)
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)
    }

    pub async fn update_notifier_channel(
        &self,
        tenant_id: Uuid,
        channel_id: Uuid,
        label: Option<String>,
        events: Option<Vec<String>>,
        enabled: Option<bool>,
    ) -> Result<NotifierChannelRow, ApiError> {
        sqlx::query_as::<_, NotifierChannelRow>(
            r#"UPDATE control_plane_notifier_channels
               SET label = COALESCE($3, label),
                   events = COALESCE($4, events),
                   enabled = COALESCE($5, enabled),
                   updated_at = now()
               WHERE id = $1 AND tenant_id = $2
               RETURNING id, tenant_id, kind, label, config, events, enabled"#,
        )
        .bind(channel_id)
        .bind(tenant_id)
        .bind(label)
        .bind(events)
        .bind(enabled)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)
    }

    pub async fn delete_notifier_channel(
        &self,
        tenant_id: Uuid,
        channel_id: Uuid,
    ) -> Result<(), ApiError> {
        let result = sqlx::query(
            "DELETE FROM control_plane_notifier_channels WHERE id = $1 AND tenant_id = $2",
        )
        .bind(channel_id)
        .bind(tenant_id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(ApiError::NotFound);
        }
        Ok(())
    }

    /// The heartbeat's outreach gauges, notified on a rise against the last
    /// reported value: the Reddit breaker going from open (or unknown) to
    /// halted, and a rise in replies waiting or in lanes that made no fan.
    /// A gauge the report leaves null keeps its last value and raises
    /// nothing — an unobserved condition is not a change.
    async fn raise_outreach_alerts(
        tx: &mut Transaction<'_, Postgres>,
        tenant_id: Uuid,
        input: &RuntimeReportRequest,
    ) -> Result<(), ApiError> {
        if input.reddit_halted.is_none()
            && input.replies_waiting.is_none()
            && input.cut_candidate_lanes.is_none()
        {
            return Ok(());
        }
        let previous = sqlx::query_as::<_, (Option<bool>, Option<i64>, Option<i64>)>(
            r#"SELECT reddit_halted, replies_waiting, cut_candidate_lanes
               FROM control_plane_outreach_alert_state
               WHERE tenant_id = $1
               FOR UPDATE"#,
        )
        .bind(tenant_id)
        .fetch_optional(&mut **tx)
        .await?
        .unwrap_or((None, None, None));
        sqlx::query(
            r#"INSERT INTO control_plane_outreach_alert_state
               (tenant_id, reddit_halted, replies_waiting, cut_candidate_lanes, updated_at)
               VALUES ($1, $2, $3, $4, now())
               ON CONFLICT (tenant_id) DO UPDATE SET
                 reddit_halted = COALESCE(EXCLUDED.reddit_halted, control_plane_outreach_alert_state.reddit_halted),
                 replies_waiting = COALESCE(EXCLUDED.replies_waiting, control_plane_outreach_alert_state.replies_waiting),
                 cut_candidate_lanes = COALESCE(EXCLUDED.cut_candidate_lanes, control_plane_outreach_alert_state.cut_candidate_lanes),
                 updated_at = now()"#,
        )
        .bind(tenant_id)
        .bind(input.reddit_halted)
        .bind(input.replies_waiting)
        .bind(input.cut_candidate_lanes)
        .execute(&mut **tx)
        .await?;

        if input.reddit_halted == Some(true) && previous.0 != Some(true) {
            Self::enqueue_event_tx(
                tx,
                tenant_id,
                "outreach.reddit_halted",
                &json!({"event": "outreach.reddit_halted", "redditHalted": true}),
            )
            .await?;
        }
        if let Some(waiting) = input.replies_waiting
            && waiting > previous.1.unwrap_or(0)
        {
            Self::enqueue_event_tx(
                tx,
                tenant_id,
                "outreach.replies_waiting",
                &json!({
                    "event": "outreach.replies_waiting",
                    "repliesWaiting": waiting,
                    "previousRepliesWaiting": previous.1.unwrap_or(0),
                }),
            )
            .await?;
        }
        if let Some(lanes) = input.cut_candidate_lanes
            && lanes > previous.2.unwrap_or(0)
        {
            Self::enqueue_event_tx(
                tx,
                tenant_id,
                "outreach.lanes_cut",
                &json!({
                    "event": "outreach.lanes_cut",
                    "cutCandidateLanes": lanes,
                    "previousCutCandidateLanes": previous.2.unwrap_or(0),
                }),
            )
            .await?;
        }
        Ok(())
    }

    /// Fan one event out to every subscribed enabled channel of the tenant.
    /// An empty subscription list means "all events". Runs inside the
    /// caller's transaction so notifications commit atomically with the
    /// state change that caused them.
    pub async fn enqueue_event_tx(
        tx: &mut Transaction<'_, Postgres>,
        tenant_id: Uuid,
        event: &str,
        payload: &Value,
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"INSERT INTO control_plane_notification_outbox (id, channel_id, event, payload)
               SELECT gen_random_uuid(), c.id, $2, $3
               FROM control_plane_notifier_channels c
               WHERE c.tenant_id = $1 AND c.enabled
                 AND (cardinality(c.events) = 0 OR $2 = ANY(c.events))"#,
        )
        .bind(tenant_id)
        .bind(event)
        .bind(payload)
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    /// List recent outbox entries for a tenant, joined with the channel label
    /// so the operator can see which notifications were sent, to which channel,
    /// and what their delivery status is. Delivery is at-least-once: a `sent`
    /// status means the provider accepted the POST, not that the recipient
    /// received it. `attempts` is the delivery attempt count; `dead` means all
    /// retries were exhausted.
    pub async fn notifier_outbox(
        &self,
        tenant_id: Uuid,
        limit: i64,
    ) -> Result<Vec<NotifierOutboxRow>, ApiError> {
        let rows = sqlx::query_as::<_, NotifierOutboxRow>(
            r#"SELECT o.id, o.event, o.status, o.attempts, o.last_error,
                      o.channel_id, c.label AS channel_label, c.kind AS channel_kind,
                      o.created_at, o.updated_at
               FROM control_plane_notification_outbox o
               JOIN control_plane_notifier_channels c ON c.id = o.channel_id
               WHERE c.tenant_id = $1
               ORDER BY o.created_at DESC
               LIMIT $2"#,
        )
        .bind(tenant_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Count the two outbox states the notifier cannot report about itself.
    ///
    /// A `dead` row is a notification that exhausted every retry — for an
    /// `approvals.pending` event that is the silent-churn failure: the
    /// approval waits and the operator was never told. Windowed to seven
    /// days so a repaired channel stops alarming once the backlog drains.
    ///
    /// A `pending` row overdue by fifteen minutes means the dispatcher is
    /// not running: it ticks every five seconds and leases claims for
    /// sixty, so no live worker leaves a due row unclaimed that long. Rows
    /// merely backing off (`next_attempt_at` in the future) are retries in
    /// progress, not a stalled worker, and do not count.
    pub async fn notification_outbox_health(&self) -> Result<NotificationOutboxHealth, ApiError> {
        let row = sqlx::query_as::<_, NotificationOutboxHealth>(
            r#"SELECT
                   COUNT(*) FILTER (WHERE status = 'dead'
                                    AND updated_at > now() - INTERVAL '7 days') AS dead_7d,
                   COUNT(*) FILTER (WHERE status = 'pending'
                                    AND next_attempt_at < now() - INTERVAL '15 minutes') AS overdue_pending
               FROM control_plane_notification_outbox"#,
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(row)
    }

    /// Claim due notifications under SKIP LOCKED so repeated workers or a
    /// restart cannot double-deliver concurrently. The claiming transaction
    /// bumps `attempts` and pushes `next_attempt_at` forward by a lease
    /// interval so the row is not re-claimable while delivery is in flight.
    /// The worker then reports success/failure via
    /// [`Self::complete_notification`], which resets `next_attempt_at` on
    /// failure or closes the row on success. If the worker crashes, the lease
    /// expires and the row becomes re-claimable after 60 seconds.
    pub async fn claim_due_notifications(
        &self,
        limit: i64,
    ) -> Result<Vec<PendingNotification>, ApiError> {
        let mut tx = self.pool.begin().await?;
        let ids: Vec<Uuid> = sqlx::query_scalar(
            r#"SELECT id FROM control_plane_notification_outbox
               WHERE status = 'pending' AND next_attempt_at <= now()
               ORDER BY next_attempt_at
               LIMIT $1
               FOR UPDATE SKIP LOCKED"#,
        )
        .bind(limit)
        .fetch_all(&mut *tx)
        .await?;
        if ids.is_empty() {
            tx.commit().await?;
            return Ok(Vec::new());
        }
        let claimed = sqlx::query_as::<_, PendingNotification>(
            r#"SELECT o.id, o.event, o.payload, c.kind, c.label, c.config
               FROM control_plane_notification_outbox o
               JOIN control_plane_notifier_channels c ON c.id = o.channel_id
               WHERE o.id = ANY($1)"#,
        )
        .bind(&ids)
        .fetch_all(&mut *tx)
        .await?;
        // Bump attempts and push next_attempt_at forward by 60 seconds so a
        // second worker tick (5s later) cannot re-claim the same row while
        // delivery is still in flight. complete_notification overwrites
        // next_attempt_at on failure; success closes the row. A worker crash
        // leaves the row re-claimable after the 60s lease expires.
        sqlx::query(
            r#"UPDATE control_plane_notification_outbox
               SET attempts = attempts + 1,
                   next_attempt_at = now() + INTERVAL '60 seconds',
                   updated_at = now()
               WHERE id = ANY($1)"#,
        )
        .bind(&ids)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(claimed)
    }

    /// Record a delivery outcome: sent closes the row; failure backs off
    /// exponentially until the attempt cap declares it dead.
    pub async fn complete_notification(
        &self,
        id: Uuid,
        error: Option<&str>,
    ) -> Result<(), ApiError> {
        match error {
            None => {
                sqlx::query("UPDATE control_plane_notification_outbox SET status = 'sent', last_error = NULL, updated_at = now() WHERE id = $1 AND status = 'pending'")
                    .bind(id)
                    .execute(&self.pool)
                    .await?;
            }
            Some(error) => {
                sqlx::query(
                    r#"UPDATE control_plane_notification_outbox
                       SET status = CASE WHEN attempts >= 6 THEN 'dead' ELSE status END,
                           next_attempt_at = now() + make_interval(secs => LEAST(1800, 30 * POWER(2, attempts))),
                           last_error = $2,
                           updated_at = now()
                       WHERE id = $1"#,
                )
                .bind(id)
                .bind(error)
                .execute(&self.pool)
                .await?;
            }
        }
        Ok(())
    }

    // --- Platform infrastructure health -------------------------------

    pub async fn list_platform_health(&self) -> Result<Vec<PlatformHealthRow>, ApiError> {
        sqlx::query_as::<_, PlatformHealthRow>(
            r#"SELECT service, label, url, healthy, last_status,
                      last_checked_at, last_healthy_at, latency_ms
               FROM control_plane_platform_health
               ORDER BY service"#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(ApiError::Database)
    }

    pub async fn upsert_platform_health(
        &self,
        service: &str,
        healthy: bool,
        last_status: &str,
        latency_ms: Option<i32>,
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"UPDATE control_plane_platform_health
               SET healthy = $2,
                   last_status = $3,
                   latency_ms = $4,
                   last_checked_at = now(),
                   last_healthy_at = CASE WHEN $2 THEN now()
                                          ELSE last_healthy_at END
               WHERE service = $1"#,
        )
        .bind(service)
        .bind(healthy)
        .bind(last_status)
        .bind(latency_ms)
        .execute(&self.pool)
        .await
        .map_err(ApiError::Database)?;
        Ok(())
    }

    // --- Automation events -------------------------------------------

    pub async fn insert_automation_event(
        &self,
        input: &CreateAutomationEventRequest,
    ) -> Result<(AutomationEventRow, AutomationWorkflowConfigRow), ApiError> {
        // Validate enum-like fields before hitting the DB so a bad payload
        // gets a 400, not a 23514 check violation.
        if !(1..=160).contains(&input.workflow_id.len())
            || !input
                .workflow_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
        {
            return Err(ApiError::InvalidInput(
                "workflowId must be 1-160 alphanumeric/-/_ characters".to_owned(),
            ));
        }
        if input.workflow_name.trim().is_empty() || input.workflow_name.chars().count() > 200 {
            return Err(ApiError::InvalidInput(
                "workflowName must be 1-200 characters".to_owned(),
            ));
        }
        if !matches!(
            input.event_kind.as_str(),
            "error" | "status" | "heartbeat" | "approval"
        ) {
            return Err(ApiError::InvalidInput(
                "eventKind must be one of error/status/heartbeat/approval".to_owned(),
            ));
        }
        if !matches!(input.severity.as_str(), "info" | "warn" | "error") {
            return Err(ApiError::InvalidInput(
                "severity must be one of info/warn/error".to_owned(),
            ));
        }
        if input.message.trim().is_empty() || input.message.chars().count() > 4000 {
            return Err(ApiError::InvalidInput(
                "message must be 1-4000 characters".to_owned(),
            ));
        }
        if let Some(ref exec) = input.execution_id {
            if exec.len() > 80 || !exec.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
                return Err(ApiError::InvalidInput(
                    "executionId must be ≤80 alphanumeric/- characters".to_owned(),
                ));
            }
        }
        if let Some(ref node) = input.node_name {
            if node.chars().count() > 200 {
                return Err(ApiError::InvalidInput(
                    "nodeName must be ≤200 characters".to_owned(),
                ));
            }
        }

        // Resolve the tenant slug from the n8n payload to a tenant_id.
        // The ingestion endpoint is machine-authed (no operator identity),
        // so the slug is the only tenant boundary.
        let tenant = self.tenant_by_slug(&input.tenant_slug).await?;

        let mut tx = self.pool.begin().await?;
        // Lazily seed a default config row for unseen workflows so the UI
        // always has a config to display. Default category='status' means
        // Discord stays quiet until an operator explicitly promotes a
        // workflow to 'real_work'.
        let config = sqlx::query_as::<_, AutomationWorkflowConfigRow>(
            r#"INSERT INTO control_plane_automation_workflow_config (tenant_id, workflow_id, label)
               VALUES ($1, $2, $3)
               ON CONFLICT (tenant_id, workflow_id) DO UPDATE SET updated_at = now()
               RETURNING tenant_id, workflow_id, label, category, discord_enabled, muted, created_at, updated_at"#,
        )
        .bind(tenant.tenant.id)
        .bind(&input.workflow_id)
        .bind(input.workflow_name.trim())
        .fetch_one(&mut *tx)
        .await?;

        let event = sqlx::query_as::<_, AutomationEventRow>(
            r#"INSERT INTO control_plane_automation_events
                   (tenant_id, workflow_id, workflow_name, execution_id, event_kind, severity, node_name, message, payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING id, tenant_id, workflow_id, workflow_name, execution_id, event_kind, severity,
                         node_name, message, payload, occurred_at, status, retry_count,
                         last_retried_at, created_at"#,
        )
        .bind(tenant.tenant.id)
        .bind(&input.workflow_id)
        .bind(input.workflow_name.trim())
        .bind(input.execution_id.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .bind(&input.event_kind)
        .bind(&input.severity)
        .bind(input.node_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .bind(input.message.trim())
        .bind(&input.payload)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok((event, config))
    }

    pub async fn list_automation_events(
        &self,
        tenant_id: Uuid,
        limit: i64,
        status_filter: Option<&str>,
        workflow_filter: Option<&str>,
    ) -> Result<Vec<AutomationEventRow>, ApiError> {
        let limit = limit.clamp(1, 200);
        if let Some(s) = status_filter {
            if !matches!(s, "new" | "acknowledged" | "retried" | "resolved" | "muted") {
                return Err(ApiError::InvalidInput("invalid status filter".to_owned()));
            }
        }
        sqlx::query_as::<_, AutomationEventRow>(
            r#"SELECT id, tenant_id, workflow_id, workflow_name, execution_id, event_kind, severity,
                      node_name, message, payload, occurred_at, status, retry_count,
                      last_retried_at, created_at
               FROM control_plane_automation_events
               WHERE tenant_id = $1
                 AND ($2::text IS NULL OR status = $2)
                 AND ($3::text IS NULL OR workflow_id = $3)
               ORDER BY occurred_at DESC
               LIMIT $4"#,
        )
        .bind(tenant_id)
        .bind(status_filter)
        .bind(workflow_filter)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(ApiError::Database)
    }

    pub async fn ack_automation_event(&self, id: Uuid, tenant_id: Uuid) -> Result<(), ApiError> {
        let result = sqlx::query(
            r#"UPDATE control_plane_automation_events
               SET status = 'acknowledged', created_at = created_at
               WHERE id = $1 AND tenant_id = $2 AND status = 'new'"#,
        )
        .bind(id)
        .bind(tenant_id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(ApiError::NotFound);
        }
        Ok(())
    }

    pub async fn resolve_automation_event(
        &self,
        id: Uuid,
        tenant_id: Uuid,
    ) -> Result<(), ApiError> {
        let result = sqlx::query(
            r#"UPDATE control_plane_automation_events
               SET status = 'resolved'
               WHERE id = $1 AND tenant_id = $2"#,
        )
        .bind(id)
        .bind(tenant_id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(ApiError::NotFound);
        }
        Ok(())
    }

    pub async fn mark_automation_event_retried(
        &self,
        id: Uuid,
        tenant_id: Uuid,
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"UPDATE control_plane_automation_events
               SET retry_count = retry_count + 1,
                   last_retried_at = now(),
                   status = 'retried'
               WHERE id = $1 AND tenant_id = $2"#,
        )
        .bind(id)
        .bind(tenant_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_automation_event(
        &self,
        id: Uuid,
        tenant_id: Uuid,
    ) -> Result<AutomationEventRow, ApiError> {
        sqlx::query_as::<_, AutomationEventRow>(
            r#"SELECT id, tenant_id, workflow_id, workflow_name, execution_id, event_kind, severity,
                      node_name, message, payload, occurred_at, status, retry_count,
                      last_retried_at, created_at
               FROM control_plane_automation_events
               WHERE id = $1 AND tenant_id = $2"#,
        )
        .bind(id)
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)
    }

    pub async fn list_automation_workflow_configs(
        &self,
        tenant_id: Uuid,
    ) -> Result<Vec<AutomationWorkflowConfigRow>, ApiError> {
        sqlx::query_as::<_, AutomationWorkflowConfigRow>(
            r#"SELECT tenant_id, workflow_id, label, category, discord_enabled, muted, created_at, updated_at
               FROM control_plane_automation_workflow_config
               WHERE tenant_id = $1
               ORDER BY label"#,
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await
        .map_err(ApiError::Database)
    }

    pub async fn upsert_automation_workflow_config(
        &self,
        tenant_id: Uuid,
        workflow_id: &str,
        label: Option<&str>,
        category: Option<&str>,
        discord_enabled: Option<bool>,
        muted: Option<bool>,
    ) -> Result<AutomationWorkflowConfigRow, ApiError> {
        if !(1..=160).contains(&workflow_id.len())
            || !workflow_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
        {
            return Err(ApiError::InvalidInput(
                "workflowId must be 1-160 alphanumeric/-/_ characters".to_owned(),
            ));
        }
        if let Some(cat) = category {
            if !matches!(cat, "real_work" | "status" | "system") {
                return Err(ApiError::InvalidInput(
                    "category must be one of real_work/status/system".to_owned(),
                ));
            }
        }
        if let Some(lbl) = label {
            if lbl.trim().is_empty() || lbl.chars().count() > 200 {
                return Err(ApiError::InvalidInput(
                    "label must be 1-200 characters".to_owned(),
                ));
            }
        }
        sqlx::query_as::<_, AutomationWorkflowConfigRow>(
            r#"INSERT INTO control_plane_automation_workflow_config
                   (tenant_id, workflow_id, label, category, discord_enabled, muted)
               VALUES ($1, $2, COALESCE($3, $2), COALESCE($4, 'status'), COALESCE($5, false), COALESCE($6, false))
               ON CONFLICT (tenant_id, workflow_id) DO UPDATE SET
                   label = COALESCE($3, control_plane_automation_workflow_config.label),
                   category = COALESCE($4, control_plane_automation_workflow_config.category),
                   discord_enabled = COALESCE($5, control_plane_automation_workflow_config.discord_enabled),
                   muted = COALESCE($6, control_plane_automation_workflow_config.muted),
                   updated_at = now()
               RETURNING tenant_id, workflow_id, label, category, discord_enabled, muted, created_at, updated_at"#,
        )
        .bind(tenant_id)
        .bind(workflow_id)
        .bind(label.map(str::trim))
        .bind(category)
        .bind(discord_enabled)
        .bind(muted)
        .fetch_one(&self.pool)
        .await
        .map_err(ApiError::Database)
    }

    /// Best-effort retention sweep: delete resolved/retried/muted events
    /// older than 30 days. The partial index `automation_events_retention_idx`
    /// keeps this cheap. Called from a background loop, never the request path.
    pub async fn sweep_automation_events(&self) -> Result<u64, ApiError> {
        let result = sqlx::query(
            r#"DELETE FROM control_plane_automation_events
               WHERE status IN ('resolved','retried','muted')
                 AND occurred_at < now() - interval '30 days'"#,
        )
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }

    // ── Waitlist ───────────────────────────────────────────────────

    pub async fn create_waitlist_applicant(
        &self,
        email: &str,
        newsletter_opt_in: bool,
        referred_by: Option<Uuid>,
    ) -> Result<WaitlistRow, ApiError> {
        let id = Uuid::new_v4();
        let email_hash = Sha256::digest(email.to_lowercase().as_bytes()).to_vec();
        let referral_code = generate_referral_code();
        let row = sqlx::query_as::<_, WaitlistRow>(
            r#"INSERT INTO control_plane_waitlist
                 (id, email, email_hash, newsletter_opt_in, referral_code, referred_by)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (email_hash) DO UPDATE SET updated_at = now()
               RETURNING id, email, status, role, roster_size, fan_sources,
                         newsletter_opt_in, referral_code, referred_by,
                         qualified_at, created_at, updated_at"#,
        )
        .bind(id)
        .bind(email)
        .bind(&email_hash)
        .bind(newsletter_opt_in)
        .bind(&referral_code)
        .bind(referred_by)
        .fetch_one(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn get_waitlist_applicant_by_id(
        &self,
        id: Uuid,
    ) -> Result<Option<WaitlistRow>, ApiError> {
        let row = sqlx::query_as::<_, WaitlistRow>(
            r#"SELECT id, email, status, role, roster_size, fan_sources,
                      newsletter_opt_in, referral_code, referred_by,
                      qualified_at, created_at, updated_at
               FROM control_plane_waitlist WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn get_waitlist_applicant_by_referral(
        &self,
        code: &str,
    ) -> Result<Option<WaitlistRow>, ApiError> {
        let row = sqlx::query_as::<_, WaitlistRow>(
            r#"SELECT id, email, status, role, roster_size, fan_sources,
                      newsletter_opt_in, referral_code, referred_by,
                      qualified_at, created_at, updated_at
               FROM control_plane_waitlist WHERE referral_code = $1"#,
        )
        .bind(code)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn qualify_waitlist_applicant(
        &self,
        id: Uuid,
        role: &str,
        roster_size: &str,
        fan_sources: &[String],
    ) -> Result<WaitlistRow, ApiError> {
        let row = sqlx::query_as::<_, WaitlistRow>(
            r#"UPDATE control_plane_waitlist
               SET role = $2, roster_size = $3, fan_sources = $4,
                   status = 'qualified', qualified_at = now(), updated_at = now()
               WHERE id = $1
               RETURNING id, email, status, role, roster_size, fan_sources,
                         newsletter_opt_in, referral_code, referred_by,
                         qualified_at, created_at, updated_at"#,
        )
        .bind(id)
        .bind(role)
        .bind(roster_size)
        .bind(serde_json::to_value(fan_sources)?)
        .fetch_one(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn count_confirmed_referrals(&self, referrer_id: Uuid) -> Result<i64, ApiError> {
        let row: (i64,) = sqlx::query_as(
            r#"SELECT count(*) FROM control_plane_waitlist
               WHERE referred_by = $1 AND status IN ('qualified', 'invited')"#,
        )
        .bind(referrer_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }
}

/// 8-char lowercase alphanumeric referral code. Collisions are astronomically
/// unlikely for a waitlist (36^8 ≈ 2.8 trillion), and the UNIQUE constraint
/// catches one if it ever happens — the caller retries.
fn generate_referral_code() -> String {
    use rand_core::{OsRng, RngCore};
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut buf = [0u8; 8];
    OsRng.fill_bytes(&mut buf);
    buf.iter()
        .map(|b| CHARSET[(*b as usize) % CHARSET.len()] as char)
        .collect()
}

/// The tenant's database (and role) name on a shared Postgres cluster.
///
/// Derived deterministically from the slug: slugs are unique and cannot
/// contain underscores, so `t_` + underscored slug is unique and never
/// requires identifier quoting in DDL. Postgres caps identifiers at 63 bytes;
/// a slug that would overflow is truncated and disambiguated with a tenant-id
/// fragment, which stays unique because the tenant id is unique.
fn placement_database_name(slug: &str, tenant_id: &Uuid) -> String {
    let underscored = slug.replace('-', "_");
    let candidate = format!("t_{underscored}");
    if candidate.len() <= 63 {
        return candidate;
    }
    let id_fragment = tenant_id.simple().to_string();
    format!("t_{}_{}", &underscored[..52], &id_fragment[..8])
}

fn deployment_plan(
    tenant: &TenantRow,
    deployment: &TenantDeploymentSpec,
    shared_pg: &SharedPgConfig,
) -> Result<Value, ApiError> {
    let crowdrelay_base_url = tenant.crowdrelay_base_url.as_deref().ok_or_else(|| {
        ApiError::InvalidInput("crowdrelayBaseUrl is required before deployment".to_owned())
    })?;
    // Signal is an optional add-on product. If the tenant has no
    // signal_base_url, the provisioner deploys CrowdRelay without a
    // public site and with no CORS origins beyond the API itself.
    let signal_base_url = tenant.signal_base_url.as_deref();
    let regional_profile: RegionalProfile =
        serde_json::from_value(tenant.regional_profile.clone().ok_or_else(|| {
            ApiError::InvalidInput(
                "regionalProfile must be explicitly classified before deployment".to_owned(),
            )
        })?)
        .map_err(|_| ApiError::Conflict("stored regionalProfile is invalid".to_owned()))?;
    // Schema 5 adds `placement`/`sharedPg`: where the tenant's database lives.
    // Older schemas remain accepted by the provisioner and mean `dedicated`.
    let mut plan = json!({
        "schema": 5,
        "mode": "local_docker_compose",
        "placement": tenant.placement.as_str(),
        "composeProject": format!("crowdrelay-{}", tenant.slug),
        "tenantId": tenant.id.to_string(),
        "tenantSlug": tenant.slug.as_str(),
        "displayName": tenant.display_name.as_str(),
        "workspaceSlug": tenant.slug.as_str(),
        "workspaceId": tenant.workspace_id,
        "crowdRelayBaseUrl": crowdrelay_base_url,
        "publicSiteBaseUrl": signal_base_url,
        "allowedOrigins": signal_base_url.map(|u| vec![u]).unwrap_or_default(),
        "defaultCountryCode": tenant.default_country_code.as_str(),
        "regionalProfile": regional_profile,
        "brandingPalette": tenant.branding_palette.as_ref(),
        "desiredVersion": deployment.desired_version.as_str(),
        "apiImage": format!("{}:{}", deployment.api_image, deployment.desired_version),
        "workerImage": format!("{}:{}", deployment.worker_image, deployment.desired_version),
        "tenantStatusBefore": tenant.status.as_str(),
        "security": {
            "secrets": "generated-and-retained-on-provisioner-host",
            "dockerCapability": "provisioner-only",
            "browserReceivesSecrets": false
        }
    });
    if tenant.placement == "shared_pg" {
        let (Some(cluster), Some(database)) = (
            tenant.placement_cluster.as_deref(),
            tenant.placement_database.as_deref(),
        ) else {
            // The CHECK constraint makes this unreachable; refuse rather than
            // hand the provisioner a plan it cannot place.
            return Err(ApiError::Conflict(
                "shared_pg tenant is missing placement cluster or database".to_owned(),
            ));
        };
        plan["sharedPg"] = json!({
            "host": cluster,
            "network": shared_pg.network,
            "database": database,
        });
    }
    // The crew roster is tenant state, not per-request input: whatever the
    // wizard collected is re-rendered into CROWDRELAY_TEAM_MEMBERS_JSON on
    // every deploy, so a redeploy never strands the roster. The schema bump to
    // 5 makes a pre-roster provisioner reject the plan instead of silently
    // dropping teamMembers and booting the tenant into an empty crew.
    if let Some(members) = tenant.team_members.as_array()
        && !members.is_empty()
    {
        plan["teamMembers"] = Value::Array(members.clone());
        plan["schema"] = json!(5);
    }
    // Include provider API keys in the plan if provided.
    // The provisioner writes them to tenant.env.
    if let Some(keys) = &deployment.provider_keys {
        if let Some(obj) = keys.as_object() {
            let filtered: serde_json::Map<String, serde_json::Value> = obj
                .iter()
                .filter(|(_, v)| v.as_str().is_some_and(|s| !s.is_empty()))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            if !filtered.is_empty() {
                plan["providerKeys"] = Value::Object(filtered);
            }
        }
    }
    Ok(plan)
}

struct ProvisioningClaimState {
    tenant_id: Uuid,
    desired_version: Option<String>,
}

async fn provisioning_job_for_update(
    tx: &mut Transaction<'_, Postgres>,
    job_id: Uuid,
) -> Result<Option<ProvisioningJobRow>, ApiError> {
    Ok(sqlx::query_as::<_, ProvisioningJobRow>(
        r#"SELECT id, tenant_id, status, desired_version, plan, created_by,
                  attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                  result, error_code, error_detail, created_at, updated_at
           FROM control_plane_provisioning_jobs
           WHERE id=$1
           FOR UPDATE"#,
    )
    .bind(job_id)
    .fetch_optional(&mut **tx)
    .await?)
}

fn provisioning_success_matches(
    job: &ProvisioningJobRow,
    worker_id: &str,
    api_port: u16,
    workspace_id: Uuid,
    schema_version: i32,
    deployed_sha: &str,
) -> bool {
    let Some(result) = job.result.as_ref() else {
        return false;
    };
    result.get("apiPort").and_then(Value::as_u64) == Some(u64::from(api_port))
        && result
            .get("workspaceId")
            .and_then(Value::as_str)
            .and_then(|value| Uuid::parse_str(value).ok())
            == Some(workspace_id)
        && result.get("schemaVersion").and_then(Value::as_i64) == Some(i64::from(schema_version))
        && result.get("deployedSha").and_then(Value::as_str) == Some(deployed_sha)
        && result.get("provisionerWorkerId").and_then(Value::as_str) == Some(worker_id)
}

async fn active_provisioning_job(
    tx: &mut Transaction<'_, Postgres>,
    tenant_id: Uuid,
) -> Result<Option<ProvisioningJobRow>, ApiError> {
    Ok(sqlx::query_as::<_, ProvisioningJobRow>(
        r#"SELECT id, tenant_id, status, desired_version, plan, created_by,
                  attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                  result, error_code, error_detail, created_at, updated_at
           FROM control_plane_provisioning_jobs
           WHERE tenant_id=$1 AND status IN ('planned','approved','running')
           ORDER BY created_at DESC, id DESC
           LIMIT 1
           FOR UPDATE"#,
    )
    .bind(tenant_id)
    .fetch_optional(&mut **tx)
    .await?)
}

async fn verify_provisioning_claim(
    tx: &mut Transaction<'_, Postgres>,
    job_id: Uuid,
    worker_id: &str,
    claim_token: &str,
) -> Result<ProvisioningClaimState, ApiError> {
    let row = sqlx::query(
        r#"SELECT tenant_id, desired_version, status, claimed_by, claim_token_hash, lease_expires_at
           FROM control_plane_provisioning_jobs
           WHERE id=$1
           FOR UPDATE"#,
    )
    .bind(job_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(ApiError::NotFound)?;
    let status: String = row.try_get("status")?;
    let claimed_by: Option<String> = row.try_get("claimed_by")?;
    let stored_hash: Option<Vec<u8>> = row.try_get("claim_token_hash")?;
    let lease_expires_at: Option<chrono::DateTime<Utc>> = row.try_get("lease_expires_at")?;
    if status != "running"
        || claimed_by.as_deref() != Some(worker_id)
        || lease_expires_at.is_none_or(|deadline| deadline <= Utc::now())
    {
        return Err(ApiError::Conflict(
            "provisioning claim is not active for this worker".to_owned(),
        ));
    }
    let supplied: [u8; 32] = Sha256::digest(claim_token.as_bytes()).into();
    let Some(stored_hash) = stored_hash else {
        return Err(ApiError::Conflict(
            "provisioning claim token is unavailable".to_owned(),
        ));
    };
    if stored_hash.len() != supplied.len()
        || supplied
            .as_slice()
            .ct_eq(stored_hash.as_slice())
            .unwrap_u8()
            != 1
    {
        return Err(ApiError::Unauthorized);
    }
    Ok(ProvisioningClaimState {
        tenant_id: row.try_get("tenant_id")?,
        desired_version: row.try_get("desired_version")?,
    })
}
