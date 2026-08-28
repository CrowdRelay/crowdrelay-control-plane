# CrowdRelay Control Plane

**Rust / Axum / SQLx / PostgreSQL + SolidJS operations plane for tenant provisioning, runtime health, branding, deployment identity and audit.**

The Control Plane answers what tenants exist, what is actually running, and at which exact revision. Provisioning intent is durable and transactional; a separately authenticated host agent performs the local runtime mutation under crash-recoverable leases. It is not required for CrowdRelay or Signal request handling.

## Features

- tenant registry and atomic **Create & deploy** provisioning intent;
- leased, crash-recoverable provisioning jobs;
- server-side runtime freshness: `healthy`, `degraded`, `stale` or `unknown`;
- per-tenant branding with inherited product defaults;
- exact deployment identity and meaningful audit events;
- tenant AREA/operations forwarding through server-only management keys and path allowlists;
- separate admin, telemetry, provisioner and tenant-management authorities;
- fail-closed recovery and rollback-aware deployment;
- **AI agents** — proxy to the `crowdrelay-agents` service for LLM-powered creative
  tasks (press pitches, social posts, community engagement, growth strategy, Reddit
  scanning, signal invites, campaign analysis, audience research) seeded with real
  tenant data;
- **Reddit authenticated scraping** — the agents service runs a Playwright-based
  scraper that logs into Reddit via Google OAuth and extracts session cookies for
  the CrowdRelay worker, bypassing Reddit's JS bot-detection challenge;
- **Audience intelligence** — fan list, fan detail, fan journey, fan tags, audience
  segments, referral codes;
- **Growth metrics** — coverage and trends across metric series;
- **Growth objectives** — declare and retire growth objectives;
- **Growth posture** — read and set the growth posture (grounded/working/full_send);
- **Growth envelope** — set the monthly spend envelope;
- **Acquisition channels** — track fan acquisition sources;
- **Tour/show economics** — per-show and per-tour financial breakdowns;
- **Chief of Staff** — exception cockpit for growth operations.

## AI Agent Integration

The control plane proxies to a separately deployed `crowdrelay-agents` service
(Node.js + Fastify). The proxy is configured via `CONTROL_PLANE_AGENT_SERVICE_URL`
and is optional — if not set, the agent panel returns 503 and tenant traffic is
unaffected.

### Proxy routes (`/v1/tenants/:slug/agents/*`)

| Route | Method | Description |
|-------|--------|-------------|
| `/templates` | GET | List available agent templates |
| `/templates/:id` | GET | Get template details |
| `/suggestions` | GET | Data-driven task suggestions (events, fans, campaigns) |
| `/tasks` | GET, POST | List tasks / Create + start a task |
| `/tasks/:id` | GET | Get task status |
| `/tasks/:id/result` | GET | Get completed task result |
| `/providers` | GET | List available LLM providers |
| `/credentials` | GET, POST | List / Paste+validate API keys |
| `/credentials/:provider` | DELETE | Disconnect a provider |
| `/credentials/:provider/validate` | POST | Re-validate a credential |
| `/models` | GET | List models available to this tenant |
| `/oauth/google/start` | GET | Start Google OAuth flow |
| `/oauth/google/callback` | GET | Handle OAuth callback |
| `/reddit/status` | GET | Reddit cookie status (active/expired/missing) |
| `/reddit/cookies` | GET | Get Reddit session cookies for authenticated API access |
| `/reddit/login` | POST | Trigger manual Reddit login via Google OAuth (Playwright) |
| `/health` | GET | Agent service health |

The proxy resolves the tenant slug to a workspace ID, derives an HMAC token using
the management master key, and forwards the request with `Authorization: Bearer`
and `X-Workspace-Id` headers. The agent service validates the token and scopes
all data access to that workspace.

### Supported LLM providers

- **OpenCode Zen** (free, no key needed — Laguna S 2.1, Nemotron 3.5 Lightning, MiMo v2.5)
- **OpenAI** (GPT-4o, o1 — paste API key)
- **Anthropic** (Claude 3.5 Sonnet, Opus, Haiku — paste API key)
- **Google Gemini** (Gemini 3.6 Flash — OAuth or paste API key)
- **Groq** (GPT-OSS 120B — free tier, paste API key)
- **OpenRouter** (200+ models via one key — GLM-5.2, Llama, Mistral, etc.)

Credentials are encrypted with AES-256-GCM in the agent service's credential vault.
Keys are never sent back to the frontend.

## Tech stack

Rust + Axum 0.8 + SQLx/PostgreSQL for the API and durable control state. SolidJS with TanStack Solid Router, TanStack Solid Query and Vite for the browser UI. One production binary serves the API and built SPA.

`deploy/provisioner.py` is the separately authenticated host agent. It claims approved jobs, validates the fixed plan schema, renders an isolated Docker Compose stack, keeps generated secrets host-local and reports terminal result plus runtime health through machine APIs.

## Boundary

CrowdRelay and Virya Signal are tenant products; band operations stay in the band-facing product. Synesthesia is not tenantized. Tenant traffic does not depend on Control Plane health.

## License

See [`LICENSE`](LICENSE).
