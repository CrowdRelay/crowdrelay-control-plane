import { For, Show } from 'solid-js'
import { useNavigate } from '@tanstack/solid-router'

type Zone = 'src' | 'brain' | 'worker' | 'out' | 'learn'

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
// The Brain (Rust autopilot) is deterministic. It owns strategy, decides
// what intelligence to gather, and dispatches LLM workers. Workers gather
// intelligence and draft content. They feed outcomes back to the Brain's
// causal model, which updates beliefs and drives the next cycle.
//
// Sources → Brain → Workers → Outcomes → Learning loop → Brain

const NODES: MapNode[] = [
  // ── SOURCES ──
  { id: 'reddit', x: 30, y: 100, w: 230, h: 56, zone: 'src', title: 'Reddit', desc: 'community signals', to: '/tenants/{slug}/portfolio' },
  { id: 'spotify', x: 30, y: 170, w: 230, h: 56, zone: 'src', title: 'Spotify', desc: 'artist + track metrics', to: '/tenants/{slug}/funnel' },
  { id: 'bandsintown', x: 30, y: 240, w: 230, h: 56, zone: 'src', title: 'Bandsintown', desc: 'show + tour signals', to: '/tenants/{slug}/portfolio' },
  { id: 'meta', x: 30, y: 310, w: 230, h: 56, zone: 'src', title: 'Meta · TikTok', desc: 'ad leads + social', to: '/tenants/{slug}/portfolio' },
  { id: 'press', x: 30, y: 380, w: 230, h: 56, zone: 'src', title: 'Press · Lists', desc: 'media + CSV import', to: '/tenants/{slug}/portfolio' },

  // ── BRAIN (deterministic Rust) ──
  { id: 'brain', x: 340, y: 120, w: 280, h: 90, zone: 'brain', title: 'Brain · Autopilot', desc: 'deterministic strategy\ncausal model + decisions', to: '/tenants/{slug}/operations' },
  { id: 'scorecard', x: 340, y: 240, w: 280, h: 64, zone: 'brain', title: 'Scorecard + Objectives', desc: 'progress tracking', to: '/tenants/{slug}/operations' },
  { id: 'funnel', x: 340, y: 330, w: 280, h: 64, zone: 'brain', title: 'Growth Funnel', desc: 'discovery → engagement → conversion', to: '/tenants/{slug}/funnel' },

  // ── WORKERS (LLM agents) ──
  { id: 'scanner', x: 720, y: 100, w: 260, h: 56, zone: 'worker', title: 'Reddit Scanner', desc: 'community discovery', to: '/tenants/{slug}/operations' },
  { id: 'engager', x: 720, y: 175, w: 260, h: 56, zone: 'worker', title: 'Community Engager', desc: 'drafts replies + posts', to: '/tenants/{slug}/operations' },
  { id: 'inviter', x: 720, y: 250, w: 260, h: 56, zone: 'worker', title: 'Signal Inviter', desc: 'drafts fan invitations', to: '/tenants/{slug}/operations' },
  { id: 'press_worker', x: 720, y: 325, w: 260, h: 56, zone: 'worker', title: 'Press Pitch', desc: 'drafts media outreach', to: '/tenants/{slug}/operations' },
  { id: 'strategist', x: 720, y: 400, w: 260, h: 56, zone: 'worker', title: 'Growth Strategist', desc: 'campaign intelligence', to: '/tenants/{slug}/operations' },

  // ── OUTCOMES ──
  { id: 'fans', x: 1090, y: 100, w: 270, h: 64, zone: 'out', title: 'Fanbase', desc: 'aggregated + attributed', to: '/tenants/{slug}' },
  { id: 'engagement', x: 1090, y: 190, w: 270, h: 64, zone: 'out', title: 'Engagement', desc: 'replies · posts · signal installs', to: '/tenants/{slug}/operations' },
  { id: 'conversion', x: 1090, y: 280, w: 270, h: 64, zone: 'out', title: 'Conversion', desc: 'tickets · merch · attendance', to: '/tenants/{slug}' },
  { id: 'metrics', x: 1090, y: 370, w: 270, h: 64, zone: 'out', title: 'Growth Metrics', desc: 'Spotify · social · live', to: '/tenants/{slug}/funnel' },
]

type Edge = { from: string; to: string; kind: Zone }

const EDGES: Edge[] = [
  // Sources → Brain
  { from: 'reddit', to: 'brain', kind: 'src' },
  { from: 'spotify', to: 'brain', kind: 'src' },
  { from: 'bandsintown', to: 'brain', kind: 'src' },
  { from: 'meta', to: 'brain', kind: 'src' },
  { from: 'press', to: 'brain', kind: 'src' },
  // Brain → Workers (dispatch)
  { from: 'brain', to: 'scanner', kind: 'brain' },
  { from: 'brain', to: 'engager', kind: 'brain' },
  { from: 'brain', to: 'inviter', kind: 'brain' },
  { from: 'brain', to: 'press_worker', kind: 'brain' },
  { from: 'brain', to: 'strategist', kind: 'brain' },
  // Workers → Outcomes
  { from: 'scanner', to: 'fans', kind: 'worker' },
  { from: 'engager', to: 'engagement', kind: 'worker' },
  { from: 'inviter', to: 'fans', kind: 'worker' },
  { from: 'press_worker', to: 'engagement', kind: 'worker' },
  { from: 'strategist', to: 'metrics', kind: 'worker' },
  // Outcome chain
  { from: 'fans', to: 'engagement', kind: 'out' },
  { from: 'engagement', to: 'conversion', kind: 'out' },
  // Learning loop: outcomes → Brain (causal model updates)
  { from: 'conversion', to: 'brain', kind: 'learn' },
  { from: 'metrics', to: 'brain', kind: 'learn' },
]

const NODE_MAP = new Map(NODES.map(n => [n.id, n]))

function edgePath(edge: Edge): string {
  const a = NODE_MAP.get(edge.from)!
  const b = NODE_MAP.get(edge.to)!
  const x1 = a.x + a.w
  const y1 = a.y + a.h / 2
  const x2 = b.x
  const y2 = b.y + b.h / 2
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}

const ZONE_STROKE: Record<Zone, string> = {
  src: '#71dcff',
  brain: '#9b87f5',
  worker: '#ffd56d',
  out: '#ff6680',
  learn: '#7dffb2',
}

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
      <svg viewBox="0 0 1390 490" xmlns="http://www.w3.org/2000/svg" class="process-map">
        {/* zone backgrounds */}
        <rect class="pm-zone" x="15" y="70" width="260" height="390" rx="14" />
        <text class="pm-zt" x="28" y="95">SOURCES</text>
        <rect class="pm-zone pm-zone-brain" x="320" y="70" width="330" height="390" rx="14" />
        <text class="pm-zt" x="334" y="95">BRAIN</text>
        <rect class="pm-zone" x="700" y="70" width="300" height="390" rx="14" />
        <text class="pm-zt" x="714" y="95">WORKERS</text>
        <rect class="pm-zone" x="1070" y="70" width="310" height="390" rx="14" />
        <text class="pm-zt" x="1084" y="95">OUTCOMES</text>

        {/* edges — static, no animation */}
        <For each={EDGES_RENDERED}>
          {(item) => (
            <path
              class={`pm-edge pm-edge-${item.edge.kind}`}
              d={item.d}
            />
          )}
        </For>

        {/* nodes */}
        <For each={NODES}>
          {(node) => (
            <g class="pm-node-group" onClick={() => open(node)}>
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
