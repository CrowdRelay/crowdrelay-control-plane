import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { IntelligenceTransparencyPanel } from '../components/IntelligenceTransparencyPanel'
import { GrowthIntelligencePanel } from '../components/GrowthIntelligencePanel'
import { GrowthObjectivesPanel } from '../components/GrowthObjectivesPanel'
import { ScorecardPanel } from '../components/ScorecardPanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { BeaconSignalPanel } from '../components/BeaconSignalPanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { StatusBadge } from '../components/StatusBadge'
import { refreshTick } from '../lib/refresh'

/**
 * Intelligence subpage — a dedicated view for the deterministic Rust
 * autopilot's decision timeline, worker dispatch, and growth intelligence.
 *
 * All sections are expanded by default (no collapsed diagnostics).
 * Includes a compact SVG showing the intelligence → workers → outcomes loop.
 */
export function TenantIntelligencePage() {
  const params = useParams({ from: '/tenants/$slug/intelligence' })
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug, refreshTick()],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    refetchInterval: 15_000,
    staleTime: 10_000,
  }))

  const d = () => model.data
  const autopilot = () => d()?.autopilot
  const growth = () => d()?.growth

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">TENANT / {params().slug.toUpperCase()}</span>
        <h1>Intelligence</h1>
        <p>The deterministic autopilot's decision timeline, worker dispatch, and growth intelligence. The intelligence engine owns strategy — LLM workers gather and draft, but never decide.</p>
      </div>
      <Show when={model.data}>
        <div class="page-head-status">
          <Show when={autopilot()?.runtime_enabled}>
            <StatusBadge status="autopilot on" tone="good" />
          </Show>
          <StatusBadge status={autopilot()?.queued_actions ? `${autopilot()!.queued_actions} queued` : 'idle'} tone={autopilot()?.queued_actions ? 'warn' : 'muted'} />
        </div>
      </Show>
    </div>

    <Show when={model.error}>
      <div class="error-card" role="alert">{model.error instanceof Error ? model.error.message : 'Intelligence channel unavailable'}</div>
    </Show>

    <Show when={!model.error && model.isPending}><div class="skeleton-block" /></Show>

    <Show when={model.data}>{<>
      {/* ─── Intelligence loop SVG ──────────────────────────────────── */}
      <div class="intel-loop-wrap">
        <svg viewBox="0 0 800 120" xmlns="http://www.w3.org/2000/svg" class="intel-loop-svg" aria-hidden="true">
          <defs>
            <marker id="intel-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="#9b87f5" />
            </marker>
          </defs>
          {/* Intelligence node */}
          <rect x="20" y="30" width="160" height="60" rx="10" class="intel-loop-node intel-loop-node-core" />
          <text x="100" y="55" text-anchor="middle" class="intel-loop-label">Intelligence</text>
          <text x="100" y="72" text-anchor="middle" class="intel-loop-sub">Rust autopilot</text>

          {/* Arrow → Workers */}
          <line x1="180" y1="60" x2="290" y2="60" stroke="#9b87f5" stroke-width="1.5" marker-end="url(#intel-arrow)" />

          {/* Workers node */}
          <rect x="300" y="30" width="160" height="60" rx="10" class="intel-loop-node intel-loop-node-worker" />
          <text x="380" y="55" text-anchor="middle" class="intel-loop-label">Workers</text>
          <text x="380" y="72" text-anchor="middle" class="intel-loop-sub">LLM agents</text>

          {/* Arrow → Outcomes */}
          <line x1="460" y1="60" x2="570" y2="60" stroke="#ffd56d" stroke-width="1.5" marker-end="url(#intel-arrow)" />

          {/* Outcomes node */}
          <rect x="580" y="30" width="160" height="60" rx="10" class="intel-loop-node intel-loop-node-outcome" />
          <text x="660" y="55" text-anchor="middle" class="intel-loop-label">Outcomes</text>
          <text x="660" y="72" text-anchor="middle" class="intel-loop-sub">fans · engagement</text>

          {/* Learning loop arrow back to Intelligence */}
          <path d="M 660 90 Q 400 115, 100 90" fill="none" stroke="#7dffb2" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#intel-arrow)" />
          <text x="380" y="115" text-anchor="middle" class="intel-loop-feedback">learning loop</text>
        </svg>
      </div>

      {/* ─── Scorecard ──────────────────────────────────────────────── */}
      <ScorecardPanel />

      {/* ─── Growth objectives ──────────────────────────────────────── */}
      <GrowthObjectivesPanel slug={params().slug} />

      {/* ─── Growth intelligence (approval queue + autonomy + workflows) ── */}
      <GrowthIntelligencePanel slug={params().slug} />

      {/* ─── Intelligence transparency (decision timeline) ──────────── */}
      <IntelligenceTransparencyPanel slug={params().slug} />

      {/* ─── Detailed subsystem views — all expanded by default ─────── */}
      <div class="intel-section">
        <div class="intel-header">
          <span class="eyebrow">SUBSYSTEMS</span>
          <h2>Detailed views</h2>
        </div>

        <div class="intel-subsystem-grid">
          <OutreachPipelinePanel slug={params().slug} />
          <BeaconSignalPanel slug={params().slug} />
          <PressRoomPanel slug={params().slug} />
          <ReleaseCampaignsPanel slug={params().slug} />
          <PlayLedgerPanel slug={params().slug} />
        </div>
      </div>
    </>}</Show>
  </section>
}
