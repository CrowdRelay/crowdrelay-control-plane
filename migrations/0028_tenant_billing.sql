-- Billing becomes data.
--
-- The payment provider (Stripe today, translated by n8n) reports through
-- /billing/webhook. Until now the only thing a payment could do was unpark a
-- tenant — nothing recorded that a subscription existed, so "is this tenant
-- paid-up", "is the trial still running", and "when does the guarantee's
-- ninety days start" were unanswerable.
--
-- One row per tenant. `state` is the subscription machine:
--
--   trialing ──payment_succeeded──> active ──payment_failed──> past_due
--      │                            │                          │
--      └────────────┬───────────────┴──────────┬───────────────┘
--                   v                          v
--               canceled                    refunded
--
-- `canceled` and `refunded` are deliberately distinct: a customer who cancels
-- at period end churned; a customer the guarantee refunded is owed money.
-- Conflating them is how refunds get argued about instead of queried.
--
-- `subscription_started_at` anchors the guarantee deadline: the contractual
-- ninety days are the *paid* ninety days, so a tenant who pays before the
-- first measurement still gets its clock started at payment, not whenever
-- provisioning happened to land the first KPI report.

CREATE TABLE IF NOT EXISTS control_plane_tenant_billing (
    tenant_id uuid PRIMARY KEY REFERENCES control_plane_tenants(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (btrim(provider) <> '' AND char_length(provider) <= 32),
    provider_customer_id text,
    provider_subscription_id text,
    state text NOT NULL CHECK (state IN ('trialing','active','past_due','canceled','refunded')),
    subscription_started_at timestamptz NOT NULL,
    trial_ends_at timestamptz,
    current_period_ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- The guarantee deadline may anchor to subscription start, which precedes
-- the first measurement — "the paid ninety days" can end before a baseline
-- captured late. Ordering is policy, not integrity; a deadline in the past
-- honestly reads refund_owed rather than failing the heartbeat that would
-- record it.
ALTER TABLE control_plane_tenant_guarantee
    DROP CONSTRAINT IF EXISTS control_plane_tenant_guarantee_check;
