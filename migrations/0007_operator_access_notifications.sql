-- Operator identities and per-tenant notification channels.
--
-- Operator accounts: the platform admin keeps its env-token authority; these
-- rows add named, scoped human operators. A tenant_operator is hard-scoped to
-- one tenant at the row level; platform_admin rows are optional named
-- administrators (the edge-injected bearer remains the primary admin path).
CREATE TABLE control_plane_operator_accounts (
    id uuid PRIMARY KEY,
    username text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('platform_admin', 'tenant_operator')),
    tenant_id uuid REFERENCES control_plane_tenants(id) ON DELETE CASCADE,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT operator_username_unique UNIQUE (username),
    CONSTRAINT operator_role_scope_check CHECK (
        (role = 'platform_admin' AND tenant_id IS NULL)
        OR (role = 'tenant_operator' AND tenant_id IS NOT NULL)
    )
);

-- Opaque bearer sessions for operator accounts. Only the sha256 of the token
-- is stored; a leaked row cannot be replayed as a login.
CREATE TABLE control_plane_operator_sessions (
    token_hash bytea PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES control_plane_operator_accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operator_sessions_account_idx ON control_plane_operator_sessions (account_id);
CREATE INDEX operator_sessions_expiry_idx ON control_plane_operator_sessions (expires_at);

-- End notifier channels configured per tenant. The Control Plane owns only
-- configuration and bounded delivery attempts; the target endpoints are the
-- tenant's own infrastructure (Discord webhook, generic webhook or the
-- platform's optional email relay).
CREATE TABLE control_plane_notifier_channels (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES control_plane_tenants(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('discord', 'webhook', 'email_relay')),
    label text NOT NULL,
    config jsonb NOT NULL,
    events text[] NOT NULL DEFAULT '{}',
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notifier_channel_tenant_label_unique UNIQUE (tenant_id, label)
);

-- Bounded best-effort delivery queue. Failures back off exponentially and die
-- after the attempt cap; nothing here can block request handling.
CREATE TABLE control_plane_notification_outbox (
    id uuid PRIMARY KEY,
    channel_id uuid NOT NULL REFERENCES control_plane_notifier_channels(id) ON DELETE CASCADE,
    event text NOT NULL CHECK (event IN (
        'provisioning.failed', 'runtime.degraded', 'runtime.stale', 'runtime.recovered', 'test'
    )),
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dead')),
    attempts int NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_outbox_due_idx ON control_plane_notification_outbox (next_attempt_at)
    WHERE status = 'pending';
