use chrono::{Duration, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::{
    error::ApiError,
    model::{
        AuditRow, BrandingPalette, CreateTenantRequest, ProvisioningJobRow, RegionalProfile,
        RuntimeHealth, RuntimeReportRequest, RuntimeStatusRow, TenantDeploymentSpec, TenantRow,
        TenantSummary, TenantSummaryJoinRow,
    },
};

#[derive(Clone)]
pub struct Store {
    pool: PgPool,
    runtime_stale_after_seconds: i64,
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

pub(crate) struct ProvisioningCompletion<'a> {
    pub api_port: u16,
    pub workspace_id: Uuid,
    pub schema_version: i32,
    pub deployed_sha: &'a str,
}

impl Store {
    pub fn new(pool: PgPool, runtime_stale_after_seconds: i64) -> Self {
        Self {
            pool,
            runtime_stale_after_seconds,
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
    ) -> Result<(), ApiError> {
        sqlx::query(
            r#"INSERT INTO control_plane_tenants
               (id, slug, display_name, status, workspace_id, crowdrelay_base_url, signal_base_url, default_country_code, branding_palette, synesthesia_enabled, area_enabled)
               VALUES ($1, 'virya', 'Virya', 'active', $2, $3, $4, 'PL', NULL, true, true)
               ON CONFLICT (slug) DO UPDATE SET
                   workspace_id = COALESCE(control_plane_tenants.workspace_id, EXCLUDED.workspace_id),
                   crowdrelay_base_url = COALESCE(control_plane_tenants.crowdrelay_base_url, EXCLUDED.crowdrelay_base_url),
                   signal_base_url = COALESCE(control_plane_tenants.signal_base_url, EXCLUDED.signal_base_url),
                   synesthesia_enabled = true,
                   updated_at = now()"#,
        )
        .bind(Uuid::new_v4())
        .bind(workspace_id)
        .bind(crowdrelay_url)
        .bind(signal_url)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_tenants(&self) -> Result<Vec<TenantSummary>, ApiError> {
        let rows = sqlx::query_as::<_, TenantSummaryJoinRow>(
            r#"SELECT t.id, t.slug, t.display_name, t.status, t.workspace_id,
                      t.crowdrelay_base_url, t.signal_base_url, t.default_country_code, t.regional_profile, t.branding_palette,
                      t.synesthesia_enabled, t.area_enabled, t.created_at, t.updated_at,
                      r.tenant_id AS runtime_tenant_id,
                      r.api_healthy AS runtime_api_healthy,
                      r.worker_healthy AS runtime_worker_healthy,
                      r.schema_version AS runtime_schema_version,
                      r.deployed_sha AS runtime_deployed_sha,
                      r.outbox_pending AS runtime_outbox_pending,
                      r.queue_lag AS runtime_queue_lag,
                      r.last_heartbeat_at AS runtime_last_heartbeat_at,
                      r.checked_at AS runtime_checked_at
               FROM control_plane_tenants t
               LEFT JOIN control_plane_runtime_status r ON r.tenant_id = t.id
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
                      t.synesthesia_enabled, t.area_enabled, t.created_at, t.updated_at,
                      r.tenant_id AS runtime_tenant_id,
                      r.api_healthy AS runtime_api_healthy,
                      r.worker_healthy AS runtime_worker_healthy,
                      r.schema_version AS runtime_schema_version,
                      r.deployed_sha AS runtime_deployed_sha,
                      r.outbox_pending AS runtime_outbox_pending,
                      r.queue_lag AS runtime_queue_lag,
                      r.last_heartbeat_at AS runtime_last_heartbeat_at,
                      r.checked_at AS runtime_checked_at
               FROM control_plane_tenants t
               LEFT JOIN control_plane_runtime_status r ON r.tenant_id = t.id
               WHERE t.slug = $1"#,
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
        Ok(row.into_summary(Utc::now(), self.runtime_stale_after_seconds))
    }

    pub async fn create_tenant(
        &self,
        input: CreateTenantRequest,
        palette: Option<BrandingPalette>,
        deployment: Option<&TenantDeploymentSpec>,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<TenantSummary, ApiError> {
        if input.slug == "virya" {
            return Err(ApiError::Conflict("Virya tenant already exists".to_owned()));
        }
        let id = Uuid::new_v4();
        let palette_json =
            palette.map(|value| serde_json::to_value(value).expect("palette serialization"));
        let regional_profile_json =
            serde_json::to_value(&input.regional_profile).expect("regional profile serialization");
        let mut tx = self.pool.begin().await?;
        let tenant = sqlx::query_as::<_, TenantRow>(
            r#"INSERT INTO control_plane_tenants
               (id, slug, display_name, status, workspace_id, crowdrelay_base_url, signal_base_url, default_country_code, regional_profile, branding_palette, synesthesia_enabled, area_enabled)
               VALUES ($1, $2, $3, 'provisioning', $4, $5, $6, $7, $8, $9, false, false)
               RETURNING id, slug, display_name, status, workspace_id, crowdrelay_base_url,
                         signal_base_url, default_country_code, regional_profile, branding_palette, synesthesia_enabled, area_enabled,
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

        if let Some(deployment) = deployment {
            let plan = deployment_plan(&tenant, deployment)?;
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
        let value =
            palette.map(|value| serde_json::to_value(value).expect("palette serialization"));
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

        let value = serde_json::to_value(&profile).expect("regional profile serialization");
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
        let tenant = self.tenant_by_slug(slug).await?;
        if tenant.tenant.slug == "virya" && status == "suspended" {
            return Err(ApiError::Conflict(
                "Virya cannot be suspended from Control Plane".to_owned(),
            ));
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "UPDATE control_plane_tenants SET status = $2, updated_at = now() WHERE id = $1",
        )
        .bind(tenant.tenant.id)
        .bind(status)
        .execute(&mut *tx)
        .await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant.tenant.id),
                actor,
                action: "tenant.status.updated",
                target_kind: "tenant",
                target_id: tenant.tenant.id.to_string(),
                request_id,
                detail: json!({"status": status}),
            },
        )
        .await?;
        tx.commit().await?;
        self.tenant_by_slug(slug).await
    }

    pub async fn plan_provisioning(
        &self,
        slug: &str,
        desired_version: Option<String>,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<(ProvisioningJobRow, bool), ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        let job_id = Uuid::new_v4();
        let project = format!("crowdrelay-{}", tenant.tenant.slug);
        let plan = json!({
            "schema": 2,
            "mode": "workspace_isolated_deployment",
            "composeProject": project,
            "tenantSlug": tenant.tenant.slug,
            "workspaceId": tenant.tenant.workspace_id,
            "crowdRelayBaseUrl": tenant.tenant.crowdrelay_base_url,
            "signalBaseUrl": tenant.tenant.signal_base_url,
            "defaultCountryCode": tenant.tenant.default_country_code,
            "synesthesiaEnabled": tenant.tenant.synesthesia_enabled,
            "execution": "requires explicit deploy approval and the narrow provisioner agent"
        });
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
        if tenant.tenant.slug == "virya" {
            return Err(ApiError::Conflict(
                "Virya uses the existing production deployment and is not provisioned by the tenant agent".to_owned(),
            ));
        }
        if tenant.tenant.status == "suspended" {
            return Err(ApiError::Conflict(
                "resume the tenant before requesting a deployment".to_owned(),
            ));
        }
        let deployment = TenantDeploymentSpec {
            desired_version,
            api_image: api_image.to_owned(),
            worker_image: worker_image.to_owned(),
        };
        let job_id = Uuid::new_v4();
        let plan = deployment_plan(&tenant.tenant, &deployment)?;

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
        Ok(sqlx::query_as::<_, ProvisioningJobRow>(
            r#"SELECT id, tenant_id, status, desired_version, plan, created_by,
                      attempt_count, claimed_by, lease_expires_at, started_at, finished_at,
                      result, error_code, error_detail, created_at, updated_at
               FROM control_plane_provisioning_jobs
               WHERE tenant_id=$1
               ORDER BY created_at DESC
               LIMIT $2"#,
        )
        .bind(tenant.tenant.id)
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
                     plan->>'schema' = '4'
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
        let result = json!({
            "apiPort": api_port,
            "localApiUrl": format!("http://127.0.0.1:{api_port}"),
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
        sqlx::query(
            r#"UPDATE control_plane_tenants
               SET status='active', workspace_id=$2, updated_at=now()
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
        sqlx::query(
            r#"INSERT INTO control_plane_runtime_status
               (tenant_id, api_healthy, worker_healthy, schema_version, deployed_sha, outbox_pending, queue_lag, last_heartbeat_at, checked_at)
               VALUES ($1,true,true,$2,$3,0,0,now(),now())
               ON CONFLICT (tenant_id) DO UPDATE SET
                 api_healthy=true, worker_healthy=true, schema_version=EXCLUDED.schema_version,
                 deployed_sha=EXCLUDED.deployed_sha, last_heartbeat_at=now(), checked_at=now()"#,
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
        tx.commit().await?;
        Ok(job)
    }

    pub async fn ping(&self) -> Result<(), ApiError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
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

        let mut tx = self.pool.begin().await?;
        let runtime = sqlx::query_as::<_, RuntimeStatusRow>(
            r#"INSERT INTO control_plane_runtime_status
               (tenant_id, api_healthy, worker_healthy, schema_version, deployed_sha, outbox_pending, queue_lag, last_heartbeat_at, checked_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
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
                 last_heartbeat_at=CASE WHEN EXCLUDED.last_heartbeat_at IS NULL
                                        THEN control_plane_runtime_status.last_heartbeat_at
                                        WHEN control_plane_runtime_status.last_heartbeat_at IS NULL
                                             OR EXCLUDED.last_heartbeat_at >= control_plane_runtime_status.last_heartbeat_at
                                        THEN EXCLUDED.last_heartbeat_at
                                        ELSE control_plane_runtime_status.last_heartbeat_at END,
                 checked_at=now()
               RETURNING tenant_id, api_healthy, worker_healthy, schema_version, deployed_sha,
                         outbox_pending, queue_lag, last_heartbeat_at, checked_at"#,
        )
        .bind(tenant.tenant.id)
        .bind(input.api_healthy)
        .bind(input.worker_healthy)
        .bind(input.schema_version)
        .bind(input.deployed_sha.as_deref())
        .bind(input.outbox_pending)
        .bind(input.queue_lag)
        .bind(input.last_heartbeat_at)
        .fetch_one(&mut *tx)
        .await?;

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
        tx.commit().await?;
        Ok(TenantSummary {
            tenant: tenant.tenant,
            runtime: Some(runtime),
            runtime_health: current_health,
        })
    }

    pub async fn set_area_enabled(
        &self,
        slug: &str,
        enabled: bool,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<bool, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "UPDATE control_plane_tenants SET area_enabled=$2,updated_at=now() WHERE id=$1",
        )
        .bind(tenant.tenant.id)
        .bind(enabled)
        .execute(&mut *tx)
        .await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant.tenant.id),
                actor,
                action: "tenant.area.entitlement.updated",
                target_kind: "tenant",
                target_id: tenant.tenant.id.to_string(),
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

    pub async fn audit_for_tenant(
        &self,
        slug: &str,
        limit: i64,
    ) -> Result<Vec<AuditRow>, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        Ok(sqlx::query_as::<_, AuditRow>(
            r#"SELECT id, tenant_id, actor, action, target_kind, target_id, request_id, detail, created_at
               FROM control_plane_audit_log
               WHERE tenant_id = $1
               ORDER BY created_at DESC
               LIMIT $2"#,
        )
        .bind(tenant.tenant.id)
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
}

fn deployment_plan(
    tenant: &TenantRow,
    deployment: &TenantDeploymentSpec,
) -> Result<Value, ApiError> {
    let crowdrelay_base_url = tenant.crowdrelay_base_url.as_deref().ok_or_else(|| {
        ApiError::InvalidInput("crowdrelayBaseUrl is required before deployment".to_owned())
    })?;
    let signal_base_url = tenant.signal_base_url.as_deref().ok_or_else(|| {
        ApiError::InvalidInput("signalBaseUrl is required before deployment".to_owned())
    })?;
    let regional_profile: RegionalProfile =
        serde_json::from_value(tenant.regional_profile.clone().ok_or_else(|| {
            ApiError::InvalidInput(
                "regionalProfile must be explicitly classified before deployment".to_owned(),
            )
        })?)
        .map_err(|_| ApiError::Conflict("stored regionalProfile is invalid".to_owned()))?;
    Ok(json!({
        "schema": 4,
        "mode": "local_docker_compose",
        "composeProject": format!("crowdrelay-{}", tenant.slug),
        "tenantId": tenant.id.to_string(),
        "tenantSlug": tenant.slug.as_str(),
        "displayName": tenant.display_name.as_str(),
        "workspaceSlug": tenant.slug.as_str(),
        "workspaceId": tenant.workspace_id,
        "crowdRelayBaseUrl": crowdrelay_base_url,
        "publicSiteBaseUrl": signal_base_url,
        "allowedOrigins": [signal_base_url],
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
    }))
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
