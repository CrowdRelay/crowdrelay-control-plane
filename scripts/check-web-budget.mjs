import fs from 'node:fs'
import path from 'node:path'
const dist = path.resolve(import.meta.dirname, '../frontend/dist/assets')
if (!fs.existsSync(dist)) throw new Error('frontend/dist/assets missing; run npm run build first')
let js = 0, css = 0
const maps = []
for (const name of fs.readdirSync(dist)) {
  const size = fs.statSync(path.join(dist, name)).size
  if (name.endsWith('.map')) { maps.push(name); continue }
  if (name.endsWith('.js')) js += size
  if (name.endsWith('.css')) css += size
}
// Maps are not counted by the JS/CSS budgets, so without this they can ship
// unnoticed: they are served verbatim by ServeDir and were 4x the JS payload.
if (maps.length) throw new Error(`source maps must not ship: ${maps.join(', ')}`)
// Raised 2026-08-26 from 300 KiB for the Label Portfolio surfaces (roster KPIs,
// consent-edge decisions and per-tenant brand settings), and again same day
// from 320 KiB for the consolidated portfolio read model + fan sources panel
// (section degrades, StatusBadge states, revoke-reason gating), and again
// from 324 KiB for the notifiers page rewrite (per-section skeletons, panel
// wrappers for background consistency, empty states). Raised 2026-08-27 from
// 325 KiB for the agent scorecard panel (status, week summary, track record,
// by-context breakdown, recent results with outcomes), and again from 335 KiB
// for provider SVG icons (Discord, Gmail, Meta, Bandsintown, Google, Reddit,
// webhook, CSV, HTTP, manual), audit panel expander, growth panel action
// guidance, opportunity board decision guide, and portfolio empty states.
// Raised 2026-08-28 from 353 KiB for the reply triage panel (needs-human
// queue, recent auto-classifications, summary counts, per-entry disposition
// badges and matched-rule display). Raised 2026-08-28 from 358 KiB for the
// agent panel (template grid, task submission, result modal, provider health).
// Raised 2026-08-28 from 364 KiB for the credential vault (provider connection
// UI, paste API key modal, Google OAuth button, per-tenant model list).
// Raised 2026-08-28 from 366 KiB for task suggestions (data-driven prompt
// cards) and the ant icon + landing page AI agent feature.
// Raised 2026-08-28 from 388 KiB for the AI Integrations page (separate route
// for agent panel, brain icon, xAI provider icon, always-visible provider
// cards with connection summary, autopilot brain suggestions section).
// Raised 2026-08-28 from 392 KiB for generic OAuth (device flow modal, poll),
// schedules section (create/toggle/delete), structured outcome rendering,
// fanbase platform connection grid, and LLM badge on opportunity board.
// Raised 2026-08-29 from 440 KiB for the Audience Intelligence page (fan
// table, fan detail drawer, journey timeline, segment list) and Growth
// Metrics panels (coverage bar, trend cards, objectives with progress bars,
// inline SVG chart utility).
// Raised 2026-08-29 from 460 KiB for the Outreach Pipeline panels (outreach
// candidates, booking candidates, beacon signal dashboard, press room with
// requests/assets/engagements/coverage tabs, release campaigns with
// recipient detail, play ledger with standings and claims).
// Raised 2026-08-29 from 80 KiB CSS for the Premium AI panel (hero budget
// gauge, provider connector grid with OAuth/API key, model cards, task list).
// Raised 2026-08-30 from 510 KiB for the Growth Funnel dashboard (funnel
// visualization, KPI strip, worker run breakdown, recent worker runs),
// Brain Transparency panel (decision timeline, plan rationale, worker tasks
// table, decision chain), AI Usage panel (budget bar, cost-ROI table, model
// performance table, daily spend chart, model routing preview), and AI
// connector polish (model recommendations, health badges, free banner).
// Raised 2026-08-29 from 540 KiB for polished AI connectors: per-model visual
// identifiers (ModelIcon with tier badge overlay), one-click connection UX
// (OAuth primary, API key collapsible fallback), toast notifications on
// connect/disconnect, guided onboarding wizard, live validation states.
const JS_BUDGET = 560 * 1024
const CSS_BUDGET = 110 * 1024
if (js > JS_BUDGET) throw new Error(`JS budget exceeded: ${js} > ${JS_BUDGET}`)
if (css > CSS_BUDGET) throw new Error(`CSS budget exceeded: ${css} > ${CSS_BUDGET}`)
console.log(`CONTROL_PLANE_WEB_BUDGET=PASS js=${js} css=${css}`)
