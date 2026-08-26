import { For, Show, createMemo } from 'solid-js'
import { useNavigate } from '@tanstack/solid-router'

type Zone = 'src' | 'core' | 'out' | 'learn'

type MapNode = {
  id: string
  x: number
  y: number
  w: number
  h: number
  zone: Zone
  title: string
  desc?: string
  /** Click target; `{slug}` is replaced with the selected tenant. */
  to?: string
}

const NODES: MapNode[] = [
  // ── WEJŚCIA ──
  { id: 'meta', x: 40, y: 110, w: 250, h: 64, zone: 'src', title: 'Meta Lead Ads', desc: 'lead → kandydat', to: '/tenants/{slug}/portfolio' },
  { id: 'tiktok', x: 40, y: 190, w: 250, h: 64, zone: 'src', title: 'TikTok · Google Forms', desc: 'formularze reklamowe', to: '/tenants/{slug}/portfolio' },
  { id: 'reddit', x: 40, y: 270, w: 250, h: 64, zone: 'src', title: 'Reddit · Bandsintown', desc: 'sygnały → Audience Graph', to: '/tenants/{slug}/portfolio' },
  { id: 'lists', x: 40, y: 350, w: 250, h: 64, zone: 'src', title: 'Listy · CSV · n8n', desc: 'import z atestacją', to: '/tenants/{slug}/portfolio' },
  // ── AGENT ──
  { id: 'fanbases', x: 420, y: 95, w: 300, h: 78, zone: 'core', title: 'Fanbazy', desc: 'bloki publiczności + ledger', to: '/tenants/{slug}/portfolio' },
  { id: 'autopilot', x: 770, y: 95, w: 300, h: 78, zone: 'core', title: 'Autopilot · konteksty', desc: 'decyzje i kampanie', to: '/tenants/{slug}/operations' },
  { id: 'funnel', x: 420, y: 230, w: 300, h: 96, zone: 'core', title: 'Authority funnel', desc: 'pewność → uprawnienia → limity → dostarczalność', to: '/tenants/{slug}/operations' },
  { id: 'experiment', x: 770, y: 230, w: 300, h: 96, zone: 'core', title: 'Experimentation · Metrics', desc: 'testuje lejki i fanouty, skaluje zwycięzców', to: '/tenants/{slug}/operations' },
  { id: 'content', x: 420, y: 370, w: 300, h: 88, zone: 'core', title: 'Content review', desc: 'draft → przegląd człowieka → publikacja', to: '/tenants/{slug}/attention' },
  { id: 'ingest', x: 770, y: 370, w: 300, h: 88, zone: 'core', title: 'Ingestion ledger', desc: 'pending + double opt-in + atrybucja', to: '/tenants/{slug}/portfolio' },
  // ── REZULTAT ──
  { id: 'fans', x: 1120, y: 110, w: 280, h: 70, zone: 'out', title: 'Fani double opt-in', desc: 'jedna baza, pełna atrybucja', to: '/tenants/{slug}' },
  { id: 'campaigns', x: 1120, y: 200, w: 280, h: 70, zone: 'out', title: 'Kampanie email · push · treść', desc: 'wysłane z limitem i audytem', to: '/tenants/{slug}/operations' },
  { id: 'tickets', x: 1120, y: 290, w: 280, h: 70, zone: 'out', title: 'Bilety · merch', desc: 'sprzedaż z atrybucją źródła', to: '/tenants/{slug}' },
  { id: 'gigs', x: 1120, y: 380, w: 280, h: 70, zone: 'out', title: 'Crowd na gigach', desc: 'frekwencja vs target', to: '/tenants/{slug}' },
]

type Edge = { from: string; to: string; kind: Zone }

const EDGES: Edge[] = [
  { from: 'meta', to: 'fanbases', kind: 'src' },
  { from: 'tiktok', to: 'fanbases', kind: 'src' },
  { from: 'reddit', to: 'fanbases', kind: 'src' },
  { from: 'lists', to: 'fanbases', kind: 'src' },
  { from: 'fanbases', to: 'funnel', kind: 'core' },
  { from: 'autopilot', to: 'funnel', kind: 'core' },
  { from: 'funnel', to: 'content', kind: 'core' },
  { from: 'experiment', to: 'ingest', kind: 'core' },
  { from: 'content', to: 'fans', kind: 'out' },
  { from: 'ingest', to: 'fans', kind: 'out' },
  { from: 'fans', to: 'campaigns', kind: 'out' },
  { from: 'campaigns', to: 'tickets', kind: 'out' },
  { from: 'tickets', to: 'gigs', kind: 'out' },
  // pętla nauki: rezultat wraca do eksperymentów
  { from: 'gigs', to: 'experiment', kind: 'learn' },
]

function byId(id: string): MapNode {
  const found = NODES.find((node) => node.id === id)
  if (!found) throw new Error(`unknown map node: ${id}`)
  return found
}

function edgePath(edge: Edge): string {
  const a = byId(edge.from)
  const b = byId(edge.to)
  const x1 = a.x + a.w
  const y1 = a.y + a.h / 2
  const x2 = b.x
  const y2 = b.y + b.h / 2
  const mid = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}

const ZONE_STROKE: Record<Zone, string> = {
  src: '#71dcff',
  core: '#ffd56d',
  out: '#ff6680',
  learn: '#7dffb2',
}

export function ProcessMap(props: { slug: () => string }) {
  const navigate = useNavigate()

  const open = (node: MapNode) => {
    if (!node.to) return
    navigate({ to: node.to.replace('{slug}', props.slug()) })
  }

  const visibleEdges = createMemo(() =>
    EDGES.map((edge) => ({ edge, d: edgePath(edge) })),
  )

  return (
    <svg viewBox="0 0 1460 520" xmlns="http://www.w3.org/2000/svg" class="process-map">
      <style>{`
        .pm-node { fill:#111726; stroke:#243049; stroke-width:1.5; rx:12; cursor:pointer }
        .pm-node:hover { stroke-width:2.4 }
        .pm-title { fill:#e8edf6; font-size:14px; font-weight:650 }
        .pm-desc { fill:#8fa0b8; font-size:11px }
        .pm-zone { fill:none; stroke:#1c2536; stroke-dasharray:6 6 }
        .pm-zt { fill:#8fa0b8; font-size:12px; font-weight:700; letter-spacing:.14em }
        .pm-edge { fill:none; stroke:#33415c; stroke-width:1.6 }
        .pm-ants { fill:none; stroke-width:2.4; stroke-dasharray:9 9; animation: pm-ants 1s linear infinite }
        @keyframes pm-ants { to { stroke-dashoffset:-18 } }
      `}</style>

      {/* strefy */}
      <rect class="pm-zone" x="20" y="60" width="320" height="420" />
      <text class="pm-zt" x="34" y="88">WEJŚCIA</text>
      <rect class="pm-zone" x="400" y="60" width="700" height="420" />
      <text class="pm-zt" x="416" y="88">AGENT</text>
      <rect class="pm-zone" x="1100" y="60" width="330" height="420" />
      <text class="pm-zt" x="1116" y="88">REZULTAT</text>

      {/* krawędzie: statyczny tor + mrówkowa nakładka */}
      <For each={visibleEdges()}>
        {(item) => (
          <g>
            <path class="pm-edge" d={item.d} />
            <path
              class="pm-ants"
              d={item.d}
              stroke={ZONE_STROKE[item.edge.kind]}
            />
          </g>
        )}
      </For>

      {/* bloki */}
      <For each={NODES}>
        {(node) => (
          <g
            class="pm-node"
            style={{ stroke: ZONE_STROKE[node.zone] }}
            onClick={() => open(node)}
          >
            <rect x={node.x} y={node.y} width={node.w} height={node.h} rx="12" fill="#111726" />
            <text class="pm-title" x={node.x + 16} y={node.y + (node.desc ? 26 : node.h / 2 + 5)}>
              {node.title}
            </text>
            <Show when={node.desc}>
              <text class="pm-desc" x={node.x + 16} y={node.y + (node.desc ? 46 : 0)}>
                {node.desc}
              </text>
            </Show>
          </g>
        )}
      </For>
    </svg>
  )
}
