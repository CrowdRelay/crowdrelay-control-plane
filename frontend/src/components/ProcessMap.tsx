import { For, Show } from 'solid-js'
import { useNavigate } from '@tanstack/solid-router'

type Zone = 'src' | 'intel' | 'auth' | 'exec' | 'out' | 'learn'

type MapNode = {
  id: string
  x: number
  y: number
  w: number
  h: number
  zone: Zone
  title: string
  desc?: string
  to?: string
}

// ── Actualized architecture ────────────────────────────────────────────
//
// The map used to end at "Intelligence dispatches workers, workers produce
// outcomes". That skipped the half of the system an operator actually deals
// with: nothing reaches a provider without passing an authority gate first,
// and nothing counts as done until a receipt says so.
//
// What really happens, and what this map now shows:
//
//   Sources -> Autopilot decision -> disposition -> execution -> receipt
//   -> outcomes -> causal model -> the next decision
//
// The disposition is the fork. `decisions/persist.rs` writes an action only
// for two of the five: `AutoExecute` becomes `queued`, `RequireApproval`
// becomes `awaiting_approval` with a 72-hour expiry, and ObserveOnly,
// RecommendOnly and Deny record the decision and stop. An approval that is
// never given expires and the action never runs — that is the Attention page's
// whole reason to exist, and it was invisible here.
//
// Execution is at-least-once through the outbox, so a receipt is a separate
// fact from a dispatch. `community.engage` goes through its own executor and a
// logged-in browser rather than the outbox webhook path.

const NODES: MapNode[] = [
  // ── SOURCES ──
  { id: 'reddit', x: 30, y: 100, w: 230, h: 52, zone: 'src', title: 'Reddit', desc: 'logged-in browser session', to: '/tenants/{slug}/portfolio' },
  { id: 'spotify', x: 30, y: 162, w: 230, h: 52, zone: 'src', title: 'Spotify', desc: 'artist + track metrics', to: '/tenants/{slug}/intelligence' },
  { id: 'bandsintown', x: 30, y: 224, w: 230, h: 52, zone: 'src', title: 'Bandsintown', desc: 'show + tour signals', to: '/tenants/{slug}/portfolio' },
  { id: 'meta', x: 30, y: 286, w: 230, h: 52, zone: 'src', title: 'Meta · TikTok', desc: 'ad leads + social', to: '/tenants/{slug}/portfolio' },
  { id: 'press', x: 30, y: 348, w: 230, h: 52, zone: 'src', title: 'Press · Beacons', desc: 'SubmitHub + CSV · Signal', to: '/tenants/{slug}/beacons' },

  // ── INTELLIGENCE (deterministic Rust) ──
  { id: 'intel', x: 315, y: 120, w: 270, h: 84, zone: 'intel', title: 'Autopilot decision', desc: 'deterministic policy\ncausal model + confidence', to: '/tenants/{slug}/operations' },
  { id: 'scorecard', x: 315, y: 228, w: 270, h: 56, zone: 'intel', title: 'Scorecard + Objectives', desc: 'progress tracking', to: '/tenants/{slug}/operations' },
  { id: 'funnel', x: 315, y: 306, w: 270, h: 56, zone: 'intel', title: 'Growth metrics', desc: 'discovery → engagement → conversion', to: '/tenants/{slug}/intelligence' },

  // ── AUTHORITY (what the disposition allows) ──
  { id: 'auto', x: 660, y: 120, w: 220, h: 60, zone: 'auth', title: 'Auto-execute', desc: 'queued immediately' },
  { id: 'approval', x: 660, y: 210, w: 220, h: 60, zone: 'auth', title: 'Awaiting approval', desc: 'a person decides · 72h', to: '/tenants/{slug}/attention' },
  { id: 'noaction', x: 660, y: 300, w: 220, h: 60, zone: 'auth', title: 'Observe · Deny', desc: 'recorded, never executed' },

  // ── EXECUTION ──
  { id: 'providers', x: 955, y: 100, w: 290, h: 48, zone: 'exec', title: 'AI providers', desc: 'configured LLM backends', to: '/tenants/{slug}/integrations' },
  { id: 'workers', x: 955, y: 168, w: 290, h: 52, zone: 'exec', title: 'LLM workers', desc: 'scan · draft · pitch', to: '/tenants/{slug}/operations' },
  { id: 'outbox', x: 955, y: 238, w: 290, h: 52, zone: 'exec', title: 'Outbox → n8n · Discord', desc: 'at-least-once delivery', to: '/tenants/{slug}/notifiers' },
  { id: 'community', x: 955, y: 308, w: 290, h: 52, zone: 'exec', title: 'Community executor', desc: 'joins queue · posts via browser', to: '/tenants/{slug}/audience' },
  { id: 'receipt', x: 955, y: 378, w: 290, h: 52, zone: 'exec', title: 'Receipt + action ledger', desc: 'reconciles unknown outcomes', to: '/tenants/{slug}/attention' },

  // ── OUTCOMES ──
  { id: 'fans', x: 1320, y: 110, w: 250, h: 58, zone: 'out', title: 'Fanbase', desc: 'aggregated + attributed', to: '/tenants/{slug}' },
  { id: 'engagement', x: 1320, y: 192, w: 250, h: 58, zone: 'out', title: 'Engagement', desc: 'replies · posts · installs', to: '/tenants/{slug}/operations' },
  { id: 'conversion', x: 1320, y: 274, w: 250, h: 58, zone: 'out', title: 'Conversion', desc: 'tickets · merch · attendance', to: '/tenants/{slug}' },
  { id: 'metrics', x: 1320, y: 356, w: 250, h: 58, zone: 'out', title: 'Growth Metrics', desc: 'Spotify · social · live', to: '/tenants/{slug}/intelligence' },
]

type Edge = { from: string; to: string; kind: Zone }

const EDGES: Edge[] = [
  // Sources → decision
  { from: 'reddit', to: 'intel', kind: 'src' },
  { from: 'spotify', to: 'intel', kind: 'src' },
  { from: 'bandsintown', to: 'intel', kind: 'src' },
  { from: 'meta', to: 'intel', kind: 'src' },
  { from: 'press', to: 'intel', kind: 'src' },
  // Decision → disposition. Three outcomes, only two of which produce an action.
  { from: 'intel', to: 'auto', kind: 'intel' },
  { from: 'intel', to: 'approval', kind: 'intel' },
  { from: 'intel', to: 'noaction', kind: 'intel' },
  // Authority → execution. `noaction` deliberately has no outgoing edge.
  { from: 'auto', to: 'workers', kind: 'auth' },
  { from: 'auto', to: 'outbox', kind: 'auth' },
  { from: 'approval', to: 'outbox', kind: 'auth' },
  { from: 'approval', to: 'community', kind: 'auth' },
  // Providers feed the workers — without a configured backend, nothing drafts.
  { from: 'providers', to: 'workers', kind: 'exec' },
  // Dispatch becomes a receipt. Both executors report back; nothing counts as
  // executed until one of these lands.
  { from: 'outbox', to: 'receipt', kind: 'exec' },
  { from: 'community', to: 'receipt', kind: 'exec' },
  // Execution → outcomes
  { from: 'workers', to: 'fans', kind: 'exec' },
  { from: 'outbox', to: 'engagement', kind: 'exec' },
  { from: 'community', to: 'engagement', kind: 'exec' },
  { from: 'receipt', to: 'metrics', kind: 'exec' },
  // Outcome chain
  { from: 'fans', to: 'engagement', kind: 'out' },
  { from: 'engagement', to: 'conversion', kind: 'out' },
  // Learning loop: only receipted outcomes update the causal model.
  { from: 'conversion', to: 'intel', kind: 'learn' },
  { from: 'metrics', to: 'intel', kind: 'learn' },
]

const NODE_MAP = new Map(NODES.map(n => [n.id, n]))

function edgePath(edge: Edge): string {
  const a = NODE_MAP.get(edge.from)!
  const b = NODE_MAP.get(edge.to)!
  // Two nodes in the same column are a step within one stage — a dispatch
  // becoming a receipt. Routed bottom-to-top down the column, because the
  // side-to-side curve below would loop backwards and read as a return path.
  if (b.x < a.x + a.w && a.x < b.x + b.w) {
    const x1 = a.x + a.w / 2
    const y1 = a.y + a.h
    const x2 = b.x + b.w / 2
    const y2 = b.y
    const mid = (y1 + y2) / 2
    return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`
  }
  const x1 = a.x + a.w
  const y1 = a.y + a.h / 2
  const x2 = b.x
  const y2 = b.y + b.h / 2
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}

const ZONE_STROKE: Record<Zone, string> = {
  src: '#71dcff',
  intel: 'var(--color-primary)',
  auth: '#ffa657',
  exec: 'var(--color-warning-light)',
  out: '#ff6680',
  learn: 'var(--color-success-light)',
}

const ZONE_LABEL: Record<Zone, string> = {
  src: 'Sources',
  intel: 'Intelligence',
  auth: 'Authority',
  exec: 'Execution',
  out: 'Outcomes',
  learn: 'Learning',
}

const ZONE_ORDER: Zone[] = ['src', 'intel', 'auth', 'exec', 'out']

// Pre-compute edge paths once — no reactive overhead.
const EDGES_RENDERED = EDGES.map(edge => ({ edge, d: edgePath(edge) }))

export function ProcessMap(props: { slug: () => string }) {
  const navigate = useNavigate()

  const open = (node: MapNode) => {
    if (!node.to) return
    navigate({ to: node.to.replace('{slug}', props.slug()) })
  }

  return (
    <div class="process-map-wrap">
      {/* Mobile: simplified vertical list of zones with clickable nodes */}
      <div class="flex flex-col gap-3 md:hidden">
        <For each={ZONE_ORDER}>{(zone) => (
          <div class="rounded-lg border border-border bg-card p-3">
            <div class="flex items-center gap-2 mb-2">
              <span class="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: ZONE_STROKE[zone] }} />
              <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{ZONE_LABEL[zone]}</span>
            </div>
            <div class="flex flex-col gap-1">
              <For each={NODES.filter(n => n.zone === zone)}>{(node) => (
                <Show when={node.to} fallback={
                  <div class="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground">
                    <span class="text-muted-foreground">•</span>
                    <span>{node.title}</span>
                    <Show when={node.desc}><span class="text-xs text-muted-foreground">— {node.desc}</span></Show>
                  </div>
                }>
                  <button
                    type="button"
                    class="flex items-center gap-2 px-2 py-1.5 text-left text-sm text-foreground rounded-md hover:bg-surface-1 transition-colors"
                    onClick={() => open(node)}
                  >
                    <span class="text-muted-foreground">•</span>
                    <span>{node.title}</span>
                    <Show when={node.desc}><span class="text-xs text-muted-foreground">— {node.desc}</span></Show>
                  </button>
                </Show>
              )}</For>
            </div>
          </div>
        )}</For>
      </div>
      {/* Desktop: full SVG diagram */}
      <svg viewBox="0 0 1610 520" xmlns="http://www.w3.org/2000/svg" class="process-map hidden md:block" role="group" aria-label="Intelligence process map">
        <defs>
          {/* Arrow markers — one per zone colour, so each edge reads as
              flowing from its source zone, not as a generic grey arrow. */}
          <For each={(['src','intel','auth','exec','out','learn'] as const)}>
            {(zone) => (
              <marker
                id={`pm-arrow-${zone}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 8 5 L 0 9 z" fill={ZONE_STROKE[zone]} opacity="0.8" />
              </marker>
            )}
          </For>
        </defs>

        {/* zone backgrounds */}
        <rect class="pm-zone" x="15" y="70" width="260" height="420" rx="14" />
        <text class="pm-zt" x="28" y="95">SOURCES</text>
        <rect class="pm-zone pm-zone-intel" x="300" y="70" width="300" height="420" rx="14" />
        <text class="pm-zt" x="314" y="95">INTELLIGENCE</text>
        <rect class="pm-zone pm-zone-auth" x="645" y="70" width="250" height="420" rx="14" />
        <text class="pm-zt" x="659" y="95">AUTHORITY</text>
        <rect class="pm-zone" x="940" y="70" width="320" height="420" rx="14" />
        <text class="pm-zt" x="954" y="95">EXECUTION</text>
        <rect class="pm-zone" x="1305" y="70" width="280" height="420" rx="14" />
        <text class="pm-zt" x="1319" y="95">OUTCOMES</text>

        {/* edges — static, no animation */}
        <For each={EDGES_RENDERED}>
          {(item) => (
            <path
              class={`pm-edge pm-edge-${item.edge.kind}`}
              d={item.d}
              fill="none"
              marker-end={`url(#pm-arrow-${item.edge.kind})`}
            />
          )}
        </For>

        {/* nodes */}
        <For each={NODES}>
          {(node) => (
            <g class="pm-node-group" role="button" tabindex="0" aria-label={node.title} onClick={() => open(node)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(node) } }}>
              <rect
                class="pm-node"
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx="10"
                style={{ stroke: ZONE_STROKE[node.zone] }}
              />
              <foreignObject x={node.x + 14} y={node.y + 6} width={node.w - 28} height={node.h - 12}>
                <div class="pm-body">
                  <div class="pm-title">{node.title}</div>
                  <Show when={node.desc}>
                    <div class="pm-desc">{node.desc}</div>
                  </Show>
                </div>
              </foreignObject>
            </g>
          )}
        </For>
      </svg>
    </div>
  )
}
