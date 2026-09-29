import { For, Show } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { TenantBrainReadModel } from '../lib/types'
import { authState } from '../lib/auth'
import { CONTEXT_LABELS, labelOr } from '../lib/opportunity-labels'
import { Bar, Card, Note, Pill, Row, Split, StatRow, Tile, Tiles, type Tone } from './ui/dash'
import { Activity, AlertTriangle, Flag, Target } from 'lucide-solid'

// Intelligence, first screen (mockup `console-mockups/intelligence.html`):
// is the brain getting anywhere, and what is it trying next? Everything here
// comes from the brain read model, which now carries the intelligence brief
// as its own section — one read for the page.
//
// Not built, because nothing produces it yet: the 60-day audience-score
// chart with action markers (no daily series reaches the console) and "what
// held it back" per limit (`held_by` is recorded on decisions but nothing
// aggregates it). The holds shown are the two the read model counts.

/** The cycle's templates as a band member says them. An unknown key is
 *  shown humanised rather than hidden. */
const TEMPLATE_LABEL: Record<string, string> = {
  'reddit-scanner': 'Scan Reddit for listeners',
  'telegram-scanner': 'Scan Telegram channels',
  'metal-archives-scanner': 'Look up peer bands on Metal Archives',
  'bandcamp-scanner': 'Scan Bandcamp for similar acts',
  'community-engager': 'Join community conversations',
  'growth-strategist': 'Write the growth plan',
  'social-post': 'Draft social posts',
  'telegram-poster': 'Post on Telegram',
  'signal-inviter': 'Invite people to Signal',
  'press-pitch': 'Pitch the press',
}
const templateLabel = (key: string) =>
  TEMPLATE_LABEL[key] ?? key.replaceAll('-', ' ').replace(/^\w/, c => c.toUpperCase())

const STRATEGY_LABEL: Record<string, string> = {
  aggressive_discovery: 'find new listeners',
  retention: 'keep the fans you have',
  conversion: 'turn fans into tickets',
}

/** The self-assessment in plain words, with the tone the pill takes. */
export function brainStatus(model: TenantBrainReadModel | undefined): { tone: 'good' | 'warn' | 'bad' | 'muted'; text: string } | null {
  const brain = model?.intelligence?.brain
  if (!brain) return null
  const days = brain.days_observed
  switch (brain.state) {
    case 'improving': return { tone: 'good', text: 'Getting better' }
    case 'learning': return { tone: 'good', text: `Learning · ${days} days of data` }
    case 'initializing': return { tone: 'muted', text: `Still learning · ${days} ${days === 1 ? 'day' : 'days'} of data` }
    case 'stagnant': return { tone: 'warn', text: 'Stalled — nothing it tries is moving the number' }
    case 'regressing': return { tone: 'bad', text: 'Going backwards' }
    default: return { tone: 'muted', text: brain.state }
  }
}

export function IntelligenceOverview(props: { slug: string; model: TenantBrainReadModel }) {
  const intel = () => props.model.intelligence ?? null
  const chief = () => intel()?.chief_of_staff ?? null
  const cycle = () => intel()?.cycle ?? null
  const measured = () => {
    const c = chief()
    if (!c) return null
    return { improved: c.measured_improved_7d, neutral: c.measured_neutral_7d, worsened: c.measured_worsened_7d, total: c.measured_improved_7d + c.measured_neutral_7d + c.measured_worsened_7d }
  }
  const byContext = () => (props.model.scorecard?.by_context ?? []).filter(row => row.executed > 0).slice().sort((a, b) => b.executed - a.executed).slice(0, 5)

  const holds = () => {
    const rows: { label: string; value: number; tone: Tone }[] = []
    rows.push({ label: 'Waiting for your yes', value: intel()?.awaiting_approval ?? 0, tone: 'warn' })
    rows.push({ label: 'No tool can do it', value: props.model.autopilot?.awaiting_executor ?? 0, tone: 'bad' })
    for (const stop of chief()?.stopped ?? []) rows.push({ label: stop.detail.replace(/^\w/, c => c.toUpperCase()), value: stop.count, tone: 'muted' })
    return rows
  }
  const holdMax = () => Math.max(1, ...holds().map(h => h.value))

  return (
    <Show when={intel()} fallback={
      <p class="mb-3 text-sm text-muted-foreground">The brain's own account could not be read right now — the details below still work.</p>
    }>
      <Tiles>
        <Tile
          label="Audience score"
          value={cycle()?.northStarCurrent.toLocaleString()}
          sub={cycle() ? <><span class={cycle()!.northStarThisMonth > 0 ? 'text-success-foreground' : undefined}>{cycle()!.northStarThisMonth >= 0 ? '+' : ''}{cycle()!.northStarThisMonth}</span> this month</> : undefined}
        />
        <Tile label="Done on its own" value={chief()?.executed_24h} sub={chief() ? `last 24 h · ${chief()!.failed_24h} failed` : undefined} />
        <Tile label="Time saved" value={chief() ? `${(chief()!.estimated_minutes_saved_24h / 60).toFixed(1)} h` : null} sub="last 24 h · estimate" />
        <Tile
          label="Results, 7 days"
          value={measured() ? <>{measured()!.improved}<span class="text-sm font-normal text-muted-foreground"> / {measured()!.total}</span></> : null}
          sub={measured() ? `improved · ${measured()!.worsened} went down` : undefined}
        />
      </Tiles>

      <Split>
        <Card title="What it tries next" icon={<Target />} aside={cycle() ? `plan: ${STRATEGY_LABEL[cycle()!.strategy] ?? cycle()!.strategy.replaceAll('_', ' ')}` : undefined}>
          <Show when={(cycle()?.templatePriority ?? []).length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">No ranked moves this cycle.</p>}>
            <For each={cycle()!.templatePriority.slice(0, 4)}>{(key, index) => (
              <Row>
                <span class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{index() + 1}</span>
                <span class="min-w-0 flex-1 truncate text-sm text-foreground">{templateLabel(key)}</span>
                <Show when={index() === 0 && (cycle()!.topTemplateProjectedIncrementalFans ?? 0) > 0}>
                  <Pill tone="good">best bet · about +{Math.round(cycle()!.topTemplateProjectedIncrementalFans ?? 0)} fans</Pill>
                </Show>
              </Row>
            )}</For>
          </Show>
        </Card>
        <Card title="What held it back" icon={<AlertTriangle />}>
          <For each={holds()}>{hold => <Bar label={hold.label} value={hold.value} max={holdMax()} tone={hold.tone} labelWidth="md" />}</For>
          <Show when={intel()!.awaiting_approval > 0}>
            <Note><Link to="/tenants/$slug/attention" params={{ slug: props.slug }} class="text-info-foreground">Answer what waits →</Link></Note>
          </Show>
          <Show when={authState.isPlatformLevel() && intel()!.brain.latest_wait_reason}>
            <Note>Last wait: {intel()!.brain.latest_wait_reason}</Note>
          </Show>
        </Card>
      </Split>

      <Split even>
        <Card title="Goals" icon={<Flag />}>
          <Show when={(chief()?.objectives_at_risk ?? []).length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">No goal is behind its pace.</p>}>
            <For each={chief()!.objectives_at_risk}>{goal => (
              <StatRow label={`${goal.platform} ${goal.metric_key.replaceAll('_', ' ')}`} value={<Pill tone="warn">{goal.shortfall.toLocaleString()} short</Pill>} />
            )}</For>
            <Note>Due {new Date(chief()!.objectives_at_risk[0]!.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Behind pace.</Note>
          </Show>
        </Card>
        <Card title="Where it spent the week" icon={<Activity />}>
          <Show when={byContext().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">No actions recorded yet.</p>}>
            <For each={byContext()}>{row => (
              <StatRow
                label={labelOr(CONTEXT_LABELS, row.context)}
                value={<Pill tone={row.failed > 0 ? 'warn' : row.succeeded > 0 ? 'good' : 'muted'}>{row.succeeded} of {row.executed} landed{row.failed > 0 ? ` · ${row.failed} failed` : ''}</Pill>}
              />
            )}</For>
          </Show>
        </Card>
      </Split>
    </Show>
  )
}
