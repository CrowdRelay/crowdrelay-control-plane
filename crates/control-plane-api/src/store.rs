use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    error::ApiError,
    model::{
        AuditRow, BrandingPalette, CreateTenantRequest, ProvisioningJobRow, RuntimeReportRequest,
        RuntimeStatusRow, TenantRow, TenantSummary,
    },
};

#[derive(Clone)]
pub struct Store {
    pool: PgPool,
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

impl Store {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
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
               (id, slug, display_name, status, workspace_id, crowdrelay_base_url, signal_base_url, branding_palette, synesthesia_enabled)
               VALUES ($1, 'virya', 'Virya', 'active', $2, $3, $4, NULL, true)
               ON CONFLICT (slug) DO UPDATE SET
                   workspace_id = COALESCE(control_plane_tenants.workspace_id, EXCLUDED.workspace_id),
                   crowdrelay_base_url = COALESCE(control_plane_tenants.crowdrelay_base_url, EXCLUDED.crowdrelay_base_url),
                   signal_base_url = COALESCE(control_plane_tenants.signal_base_url, EXCLUDED.signal_base_url),
                   synesthesia_enabled = true,
                   updated_at = now()"#,
        )
        .bind(Uuid::new_v4()).bind(workspace_id).bind(crowdrelay_url).bind(signal_url)
        .execute(&self.pool).await?;
        Ok(())
    }

    pub async fn list_tenants(&self) -> Result<Vec<TenantSummary>, ApiError> {
        let rows = sqlx::query_as::<_, TenantRow>(
            r#"SELECT id, slug, display_name, status, workspace_id, crowdrelay_base_url,
                      signal_base_url, branding_palette, synesthesia_enabled, created_at, updated_at
               FROM control_plane_tenants ORDER BY CASE WHEN slug = 'virya' THEN 0 ELSE 1 END, display_name"#,
        ).fetch_all(&self.pool).await?;
        let statuses = sqlx::query_as::<_, RuntimeStatusRow>(
            r#"SELECT tenant_id, api_healthy, worker_healthy, schema_version, deployed_sha,
                      outbox_pending, queue_lag, last_heartbeat_at, checked_at
               FROM control_plane_runtime_status"#,
        )
        .fetch_all(&self.pool)
        .await?;
        let mut by_tenant = std::collections::HashMap::with_capacity(statuses.len());
        for status in statuses {
            by_tenant.insert(status.tenant_id, status);
        }
        Ok(rows
            .into_iter()
            .map(|tenant| TenantSummary {
                runtime: by_tenant.remove(&tenant.id),
                tenant,
            })
            .collect())
    }

    pub async fn tenant_by_slug(&self, slug: &str) -> Result<TenantSummary, ApiError> {
        let tenant = sqlx::query_as::<_, TenantRow>(
            r#"SELECT id, slug, display_name, status, workspace_id, crowdrelay_base_url,
                      signal_base_url, branding_palette, synesthesia_enabled, created_at, updated_at
               FROM control_plane_tenants WHERE slug = $1"#,
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
        let runtime = sqlx::query_as::<_, RuntimeStatusRow>(
            r#"SELECT tenant_id, api_healthy, worker_healthy, schema_version, deployed_sha,
                      outbox_pending, queue_lag, last_heartbeat_at, checked_at
               FROM control_plane_runtime_status WHERE tenant_id = $1"#,
        )
        .bind(tenant.id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(TenantSummary { tenant, runtime })
    }

    pub async fn create_tenant(
        &self,
        input: CreateTenantRequest,
        palette: Option<BrandingPalette>,
        actor: &str,
        request_id: Option<&str>,
    ) -> Result<TenantSummary, ApiError> {
        if input.slug == "virya" {
            return Err(ApiError::Conflict("Virya tenant already exists".to_owned()));
        }
        let id = Uuid::new_v4();
        let palette_json =
            palette.map(|value| serde_json::to_value(value).expect("palette serialization"));
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            r#"INSERT INTO control_plane_tenants
               (id, slug, display_name, status, workspace_id, crowdrelay_base_url, signal_base_url, branding_palette, synesthesia_enabled)
               VALUES ($1, $2, $3, 'provisioning', $4, $5, $6, $7, false)"#,
        )
        .bind(id).bind(&input.slug).bind(&input.display_name).bind(input.workspace_id)
        .bind(&input.crowdrelay_base_url).bind(&input.signal_base_url).bind(palette_json)
        .execute(&mut *tx).await.map_err(|error| match error {
            sqlx::Error::Database(db) if db.is_unique_violation() => ApiError::Conflict("tenant slug or workspace is already registered".to_owned()),
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
                detail: json!({"slug": &input.slug}),
            },
        )
        .await?;
        tx.commit().await?;
        self.tenant_by_slug(&input.slug).await
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
            .bind(tenant.tenant.id).bind(value).execute(&mut *tx).await?;
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
    ) -> Result<ProvisioningJobRow, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        let job_id = Uuid::new_v4();
        let project = format!("crowdrelay-{}", tenant.tenant.slug);
        let plan = json!({
            "mode": "workspace_isolated_deployment",
            "composeProject": project,
            "tenantSlug": tenant.tenant.slug,
            "workspaceId": tenant.tenant.workspace_id,
            "crowdRelayBaseUrl": tenant.tenant.crowdrelay_base_url,
            "signalBaseUrl": tenant.tenant.signal_base_url,
            "synesthesiaEnabled": tenant.tenant.synesthesia_enabled,
            "steps": [
                "validate workspace mapping",
                "render tenant environment",
                "run migrations",
                "start api and worker",
                "wait for readiness",
                "publish Signal tenant configuration"
            ]
        });
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query_as::<_, ProvisioningJobRow>(
            r#"INSERT INTO control_plane_provisioning_jobs
               (id, tenant_id, status, desired_version, plan, created_by)
               VALUES ($1, $2, 'planned', $3, $4, $5)
               RETURNING id, tenant_id, status, desired_version, plan, created_by, created_at, updated_at"#,
        ).bind(job_id).bind(tenant.tenant.id).bind(desired_version).bind(&plan).bind(actor).fetch_one(&mut *tx).await?;
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
        Ok(row)
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
        if input.outbox_pending.is_some_and(|value| value < 0)
            || input.queue_lag.is_some_and(|value| value < 0)
        {
            return Err(ApiError::InvalidInput(
                "runtime counters cannot be negative".to_owned(),
            ));
        }
        if input.deployed_sha.as_ref().is_some_and(|sha| {
            sha.is_empty() || sha.len() > 128 || !sha.bytes().all(|b| b.is_ascii_hexdigit())
        }) {
            return Err(ApiError::InvalidInput(
                "deployedSha must be a hexadecimal identifier up to 128 characters".to_owned(),
            ));
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(r#"INSERT INTO control_plane_runtime_status
            (tenant_id, api_healthy, worker_healthy, schema_version, deployed_sha, outbox_pending, queue_lag, last_heartbeat_at, checked_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
            ON CONFLICT (tenant_id) DO UPDATE SET
              api_healthy=EXCLUDED.api_healthy, worker_healthy=EXCLUDED.worker_healthy, schema_version=EXCLUDED.schema_version,
              deployed_sha=EXCLUDED.deployed_sha, outbox_pending=EXCLUDED.outbox_pending, queue_lag=EXCLUDED.queue_lag,
              last_heartbeat_at=EXCLUDED.last_heartbeat_at, checked_at=now()"#)
            .bind(tenant.tenant.id).bind(input.api_healthy).bind(input.worker_healthy).bind(input.schema_version)
            .bind(input.deployed_sha).bind(input.outbox_pending).bind(input.queue_lag).bind(input.last_heartbeat_at)
            .execute(&mut *tx).await?;
        self.audit_tx(
            &mut tx,
            AuditRecord {
                tenant_id: Some(tenant.tenant.id),
                actor,
                action: "tenant.runtime.reported",
                target_kind: "tenant",
                target_id: tenant.tenant.id.to_string(),
                request_id,
                detail: json!({}),
            },
        )
        .await?;
        tx.commit().await?;
        self.tenant_by_slug(slug).await
    }

    pub async fn audit_for_tenant(
        &self,
        slug: &str,
        limit: i64,
    ) -> Result<Vec<AuditRow>, ApiError> {
        let tenant = self.tenant_by_slug(slug).await?;
        Ok(sqlx::query_as::<_, AuditRow>(
            r#"SELECT id, tenant_id, actor, action, target_kind, target_id, request_id, detail, created_at
               FROM control_plane_audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2"#,
        ).bind(tenant.tenant.id).bind(limit).fetch_all(&self.pool).await?)
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
