import { For, Show } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { TenantBrainReadModel } from '../lib/types'
import { authState } from '../lib/auth'
import { CONTEXT_LABELS, labelOr } from '../lib/opportunity-labels'
import { KpiCard, KpiStrip, Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { OutcomeRow, WorkList, WorkRow } from './work'

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

  return (
    <Show when={intel()} fallback={
      <p class="mb-5 text-sm text-muted-foreground">The brain's own account could not be read right now — the tabs below still work.</p>
    }>
      <KpiStrip>
        <KpiCard
          label="Audience score"
          value={cycle() ? cycle()!.northStarCurrent.toLocaleString() : '—'}
          sub={cycle() ? `${cycle()!.northStarThisMonth >= 0 ? '+' : ''}${cycle()!.northStarThisMonth} this month` : undefined}
        />
        <KpiCard
          label="Done on its own"
          value={chief() ? chief()!.executed_24h.toLocaleString() : '—'}
          sub={chief() ? `last 24 h · ${chief()!.failed_24h} failed` : undefined}
          tone={(chief()?.failed_24h ?? 0) > 0 ? 'warn' : undefined}
        />
        <KpiCard
          label="Time saved"
          value={chief() ? `${(chief()!.estimated_minutes_saved_24h / 60).toFixed(1)} h` : '—'}
          sub="last 24 h · an estimate, not measured"
        />
        <KpiCard
          label="Results, 7 days"
          value={measured() ? `${measured()!.improved} / ${measured()!.total}` : '—'}
          sub={measured() ? `improved · ${measured()!.worsened} went down · ${measured()!.neutral} no change` : undefined}
          tone={measured() && measured()!.worsened > measured()!.improved ? 'warn' : undefined}
        />
      </KpiStrip>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section
          title="What it tries next"
          icon={<SectionIcon name="target" />}
          description={cycle() ? `The plan right now: ${STRATEGY_LABEL[cycle()!.strategy] ?? cycle()!.strategy.replaceAll('_', ' ')}. Ranked, best bet first.` : undefined}
        >
          <Show when={(cycle()?.templatePriority ?? []).length > 0} fallback={<p class="text-sm text-muted-foreground">No ranked moves this cycle.</p>}>
            <WorkList>
              <For each={cycle()!.templatePriority.slice(0, 4)}>{(key, index) => (
                <WorkRow
                  badge={<Badge variant={index() === 0 ? 'success' : 'muted'}>{index() + 1}</Badge>}
                  title={templateLabel(key)}
                  why={index() === 0 && (cycle()!.topTemplateProjectedIncrementalFans ?? 0) > 0
                    ? `best bet · about +${Math.round(cycle()!.topTemplateProjectedIncrementalFans ?? 0)} fans`
                    : undefined}
                />
              )}</For>
            </WorkList>
          </Show>
        </Section>

        <Section title="What holds it back" icon={<SectionIcon name="alert-triangle" />}>
          <div class="flex flex-col gap-2">
            <OutcomeRow
              label="Waiting for your yes"
              result={String(intel()!.awaiting_approval)}
              resultTone={intel()!.awaiting_approval > 0 ? 'warn' : 'muted'}
            />
            <OutcomeRow
              label="No tool can do it"
              result={props.model.autopilot ? String(props.model.autopilot.awaiting_executor) : '—'}
              resultTone={(props.model.autopilot?.awaiting_executor ?? 0) > 0 ? 'warn' : 'muted'}
            />
            <For each={chief()?.stopped ?? []}>{stop => (
              <OutcomeRow label={stop.detail.replace(/^\w/, c => c.toUpperCase())} result={String(stop.count)} />
            )}</For>
          </div>
          <Show when={intel()!.awaiting_approval > 0}>
            <Link to="/tenants/$slug/attention" params={{ slug: props.slug }} class="mt-3 inline-block text-xs text-primary hover:underline">
              Answer what waits →
            </Link>
          </Show>
          <Show when={authState.isPlatformLevel() && intel()!.brain.latest_wait_reason}>
            <p class="mt-3 text-xs text-muted-foreground">Last wait: {intel()!.brain.latest_wait_reason}</p>
          </Show>
        </Section>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <Section title="Where it spent the week" icon={<SectionIcon name="activity" />} description="Actions per area, and how many landed.">
          <Show when={byContext().length > 0} fallback={<p class="text-sm text-muted-foreground">No actions recorded yet.</p>}>
            <div class="flex flex-col gap-2">
              <For each={byContext()}>{row => (
                <OutcomeRow
                  label={labelOr(CONTEXT_LABELS, row.context)}
                  result={row.failed > 0 ? `${row.succeeded} of ${row.executed} landed · ${row.failed} failed` : `${row.succeeded} of ${row.executed} landed`}
                  resultTone={row.failed > 0 ? 'warn' : row.succeeded > 0 ? 'good' : 'muted'}
                />
              )}</For>
            </div>
          </Show>
        </Section>
        <Section title="Goals" icon={<SectionIcon name="flask-conical" />}>
          <Show when={(chief()?.objectives_at_risk ?? []).length > 0} fallback={<p class="text-sm text-muted-foreground">No goal is behind its pace.</p>}>
            <div class="flex flex-col gap-2">
              <For each={chief()!.objectives_at_risk}>{goal => (
                <OutcomeRow
                  label={`${goal.platform} ${goal.metric_key.replaceAll('_', ' ')}`}
                  result={`${goal.shortfall.toLocaleString()} short · ${(goal.progress_basis_points / 100).toFixed(1)}% · due ${new Date(goal.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                  resultTone="warn"
                />
              )}</For>
            </div>
          </Show>
        </Section>
      </div>
    </Show>
  )
}
