# CrowdRelay Control Plane

**The operator plane for tenant provisioning, runtime health, and deployment identity.**

The Control Plane answers three questions: what tenants exist, what is actually running, and at which exact revision. It is not required for tenant request handling — CrowdRelay and Signal serve fans independently. The Control Plane is for the operator who manages the platform.

## What it does

- **Tenant provisioning** — create a new artist workspace or festival and deploy it with one action. Provisioning intent is durable and transactional; a separately authenticated host agent performs the local runtime mutation under crash-recoverable leases. Externally-owned tenants (Virya) trigger the ecosystem-deploy GitHub Actions workflow instead.
- **Runtime health** — server-side freshness tracking: `healthy`, `degraded`, `stale`, or `unknown`. The runtime is treated as stale after a missed heartbeat. Platform health polling probes n8n and other services every 30s.
- **Deployment identity** — exact revision tracking with meaningful audit events. The operator always knows what is running and when it was deployed.
- **Growth operations** — 19 operator pages covering audience intelligence, growth metrics, growth objectives, growth posture, spend envelope, acquisition channels, growth funnel, portfolio, community intelligence, and the brain decision panel.
- **Automation events** — n8n workflow events with ack/resolve/retry, Discord forwarding, mute controls, and workflow config sync.
- **Notifiers** — per-tenant notification channels (Discord, webhook, email relay) with test delivery, platform config display, and n8n routing sync.
- **Release convergence** — tracks release components across the ecosystem and surfaces missing or stale components.
- **Learning loop** — decision → action → outcome → learned cycle with evidence assessment and confidence grading.
- **AI usage** — per-tenant LLM usage tracking with budget gating and provider cost estimation.
- **Fan sources** — 18 connection platforms (Discord, Telegram, Reddit, Spotify, YouTube, Facebook, Instagram, Soundcloud, Last.fm, Deezer, Discogs, Bluesky, Bandcamp, and more) with connect flows and verification.
- **Branding** — per-tenant branding palette with inherited product defaults.
- **Regional profiles** — country, locale, timezone, and currency classification per tenant.
- **Mobile app management** — Play Store URL configuration for Signal and Synesthesia apps.
- **Tenant operators** — platform-admin-managed scoped operator accounts per tenant.
- **Agent management** — proxy to the `crowdrelay-agents` service for LLM-powered creative tasks, including a chat widget. If the agent service isn't configured, tenant traffic is unaffected.
- **AREA forwarding** — tenant operations and management requests forwarded through server-only management keys with path allowlists.

## What it solves

When you run multiple tenants on a shared platform, you need a single pane that shows what exists, what's healthy, and what's running at which version — without SSHing into boxes. The Control Plane is that pane. It also ensures provisioning is durable (survives crashes), transactional (no half-created tenants), and auditable (every action has a paper trail).

## Authority model

Admin, telemetry, provisioner, and tenant-management authorities stay separate. The browser never receives a platform admin bearer. Contradictory terminal results fail closed. Deploy validates before mutating; rollback restores the previous app state without stale config.

## Deploy

Blue-green with zero-downtime Caddy cutover. The agent-service is recreated after the cutover to keep it in sync with the new release. Bootstrap and recovery use a force-recreate fallback.

## Ecosystem

Part of the [CrowdRelay](https://github.com/CrowdRelay) platform. See the [organization README](https://github.com/CrowdRelay/.github) for the full picture.
