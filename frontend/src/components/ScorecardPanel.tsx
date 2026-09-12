import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { formatTimestamp } from '../lib/format'
import type { AgentScorecard } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { ProgressRing } from './ProgressRing'
import { SkeletonScorecard } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { SectionTitle, ErrorCard, KpiCard, KpiStrip } from './layout'
import { CAPABILITY_LABELS, CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, labelOr } from '../lib/opportunity-labels'

const count = (value: number | undefined | null) =>
  value == null ? '—' : value.toLocaleString()

/** Render an integer with thousands separators, wrapped for tabular alignment. */
const num = (value: number | undefined | null) =>
  value == null ? <span class="text-muted-foreground">—</span> : <strong class="tabular-nums">{value.toLocaleString()}</strong>

const bpsToPercent = (value: number | null | undefined) =>
  value == null ? '—' : `${(value / 100).toFixed(1)}%`

const timeAgo = (value: string | null | undefined) => {
  if (!value) return 'never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const seconds = Math.floor((Date.now() - parsed.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const postureLabel = (value: string | null | undefined) =>
  value == null ? 'unset' : value.replace(/_/g, ' ')

const statusTone = (data: AgentScorecard | undefined): 'good'|'warn'|'bad'|'muted' => {
  if (!data) return 'muted'
  if (!data.status.agent_enabled) return 'muted'
  if (data.status.parked_capabilities.length > 0) return 'bad'
  if (data.week.failed > 0) return 'warn'
  return 'good'
}

const statusLabel = (data: AgentScorecard | undefined) => {
  if (!data) return 'loading'
  if (!data.status.agent_enabled) return 'off'
  if (data.status.dry_run) return 'dry run'
  if (data.status.parked_capabilities.length > 0) return 'execution gap'
  return data.status.posture ?? 'active'
}

const outcomeTone = (outcome: string | null): 'good'|'warn'|'bad'|'muted' => {
  if (!outcome) return 'muted'
  if (outcome === 'improved') return 'good'
  if (outcome === 'worsened') return 'bad'
  return 'muted'
}

const outcomeLabel = (outcome: string | null) =>
  outcome ?? 'unmeasured'

const deltaLabel = (delta: number | null) => {
  if (delta == null) return null
  const sign = delta > 0 ? '+' : ''
  return `${sign}${(delta / 100).toFixed(1)}%`
}

// The panel used to carry its own seven-entry context map with a raw-key
// fallback, so `growth_intelligence` and `outreach_supply` — two of the three
// contexts this tenant actually runs — rendered as their storage keys. The
// shared vocabulary already covers all 22 and humanises what it does not know.
const contextLabel = (context: string) => labelOr(CONTEXT_LABELS, context)
const actionLabel = (kind: string) => labelOr(DECISION_KIND_LABELS, kind)
const subjectLabel = (kind: string) => labelOr(SUBJECT_KIND_LABELS, kind)

export function ScorecardPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['agent-scorecard', props.slug],
    queryFn: () => api.agentScorecard(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const data = () => model.data

  const [showAllByContext, setShowAllByContext] = createSignal(false)
  const MAX_VISIBLE_BY_CONTEXT = 6
  const [showAllRecent, setShowAllRecent] = createSignal(false)
  const MAX_VISIBLE_RECENT = 10

  return <Card flat class="p-5">
    <SectionTitle
      eyebrow="AGENT SCORECARD"
      title="Is it working?"
      description="Autopilot status, weekly activity, and recent completions — results, not logs."
      icon={<SectionIcon name="activity" />}
      action={<StatusBadge status={statusLabel(data())} tone={statusTone(data())} />}
    />

    <Show when={model.error}>
      <div class="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning" role="status">
        {model.error instanceof Error ? model.error.message : 'Agent scorecard is temporarily unavailable.'}
      </div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonScorecard /></Show>

    <Show when={data()}>{d => <>
      {/* Status row. `KpiStrip`/`KpiCard` carry the console's one KPI
          treatment; this panel used to hand-roll the same box at a smaller
          type scale, so the scorecard's figures read a step quieter than
          every other strip on the page. */}
      <KpiStrip class="mt-4 mb-0">
        <KpiCard
          label="Agent"
          value={d().status.agent_enabled ? 'on' : 'off'}
          sub={d().status.dry_run ? 'dry run' : postureLabel(d().status.posture)}
        />
        <KpiCard
          label="Last decision"
          value={timeAgo(d().status.last_decision_at)}
          sub={`${timeAgo(d().status.last_action_at)} last action`}
        />
        <KpiCard
          label="Capabilities live"
          value={d().status.live_capabilities.length}
          sub={d().status.live_capabilities.length === 0 ? 'none active' : 'running'}
        />
        <Show when={d().status.parked_capabilities.length > 0}>
          <ErrorCard class="p-3 flex flex-col gap-1">
            <strong class="text-destructive text-sm">Execution gap</strong>
            <span class="text-xs text-secondary-foreground">{d().status.parked_capabilities.length === 1 ? 'One job is' : `${d().status.parked_capabilities.length} jobs are`} queued with nothing able to run them: {d().status.parked_capabilities.map(cap => labelOr(CAPABILITY_LABELS, cap)).join(', ')}</span>
          </ErrorCard>
        </Show>
      </KpiStrip>

      {/* The chips naming those capabilities. The card above counts them, so
          this row is titled for what it adds — which ones — rather than
          repeating "Live capabilities" directly under a card of that name. */}
      <Show when={d().status.live_capabilities.length > 0}>
        <div class="flex items-center gap-2 flex-wrap mt-3">
          <span class="text-xs text-muted-foreground font-medium">Running now</span>
          <div class="flex items-center gap-1.5 flex-wrap">
            <For each={d().status.live_capabilities}>{cap => <Badge variant="muted" title={cap} class="rounded-full px-2.5 py-1 leading-relaxed border border-border text-secondary-foreground">{labelOr(CAPABILITY_LABELS, cap)}</Badge>}</For>
          </div>
        </div>
      </Show>

      {/* Week summary */}
      <section class="mt-6 pt-4 border-t border-border">
        <div class="flex justify-between gap-4 items-start">
          <div><h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="zap" />Actions</h3></div>
        </div>
        <KpiStrip class="mt-3 mb-0">
          <KpiCard label="Executed" value={num(d().week.executed)} sub={`${count(d().week.succeeded)} succeeded · ${count(d().week.failed)} failed`} />
          <KpiCard
            label="Success rate"
            value={
              <Show when={d().week.success_rate_basis_points != null} fallback={<>—</>}>
                <ProgressRing value={Math.round((d().week.success_rate_basis_points as number) / 100)} size={44} strokeWidth={4} showValue />
              </Show>
            }
            sub="of actions that resolved"
          />
          <Show when={(d().week.unknown ?? 0) > 0}>
            <KpiCard label="Unknown" value={num(d().week.unknown ?? 0)} sub="outcome not established — excluded from the rate" />
          </Show>
          <KpiCard label="Parked" value={num(d().week.parked)} sub="nothing was running to do it" />
          <KpiCard label="Awaiting approval" value={num(d().week.awaiting_approval)} sub="requires operator review" />
        </KpiStrip>
      </section>

      {/* Track record */}
      <section class="mt-6 pt-4 border-t border-border">
        <div class="flex justify-between gap-4 items-start">
          <div><h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="history" />Did it work?</h3></div>
        </div>
        <KpiStrip class="mt-3 mb-0">
          <KpiCard label="Improved" value={count(d().track_record.improved)} sub={<span class="text-success">measured wins</span>} />
          <KpiCard label="Worsened" value={count(d().track_record.worsened)} sub={<span class="text-destructive">measured losses</span>} />
          <KpiCard label="Neutral" value={count(d().track_record.neutral)} sub="no change" />
          {/* With no coverage reading this printed "— coverage", which reads as
              a broken template rather than as an absent measurement. */}
          <KpiCard
            label="Unmeasured"
            value={count(d().track_record.unmeasured)}
            sub={d().track_record.measurement_coverage_basis_points == null
              ? 'no coverage reading yet'
              : `${bpsToPercent(d().track_record.measurement_coverage_basis_points)} coverage`}
          />
          <Show when={(d().track_record.awaiting_measurement ?? 0) > 0}>
            <KpiCard
              label="Awaiting"
              value={count(d().track_record.awaiting_measurement ?? 0)}
              sub={d().track_record.next_measurement_due_at
                ? `first result ${formatTimestamp(d().track_record.next_measurement_due_at as string)}`
                : 'horizon not elapsed'}
            />
          </Show>
        </KpiStrip>
        {/* Only warn about work that can never be judged. Actions still inside
            a 7, 14 or 30 day horizon are not a coverage failure, and warning
            about them told the operator the system was blind days before its
            first result was due. */}
        <Show when={d().track_record.measurement_coverage_basis_points != null
                    && (d().track_record.measurement_coverage_basis_points as number) < 5000
                    && d().track_record.unmeasured > 0}>
          <details class="mt-3">
            <summary class="cursor-pointer text-sm text-warning font-medium">Low measurement coverage — click for details</summary>
            <ErrorCard class="mt-2 p-3 flex flex-col gap-1">
              <strong class="text-destructive">Low measurement coverage</strong>
              <span class="text-sm text-secondary-foreground">{d().track_record.unmeasured} executed action(s) have no measurement scheduled, so their effect can never be judged. This excludes anything still inside its measurement horizon.</span>
            </ErrorCard>
          </details>
        </Show>
        <Show when={(d().track_record.awaiting_measurement ?? 0) > 0
                    && d().track_record.improved + d().track_record.neutral + d().track_record.worsened === 0}>
          <p class="text-sm text-muted-foreground mt-3">
            No verdicts yet because no measurement horizon has elapsed — not because nothing is being
            measured. {count(d().track_record.awaiting_measurement ?? 0)} action(s) are waiting on a 7, 14 or 30 day window.
          </p>
        </Show>
      </section>

      {/* By context */}
      <Show when={d().by_context.length > 0}>
        <section class="mt-6 pt-4 border-t border-border">
          <div class="flex justify-between gap-4 items-start">
            <div><h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="target" />Which parts are producing</h3></div>
          </div>
          <div class="grid gap-2.5 mt-3" style={{ 'grid-template-columns': 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <For each={showAllByContext() ? d().by_context : d().by_context.slice(0, MAX_VISIBLE_BY_CONTEXT)}>{ctx => <div class="p-3 border border-border rounded-lg bg-card flex flex-col gap-1">
              <strong class="text-foreground">{contextLabel(ctx.context)}</strong>
              <small class="text-muted-foreground text-sm">{count(ctx.executed)} executed · {count(ctx.succeeded)} succeeded · {count(ctx.failed)} failed</small>
              <Show when={ctx.parked > 0}><small class="text-muted-foreground text-sm">{count(ctx.parked)} parked</small></Show>
            </div>}</For>
          </div>
          <Show when={d().by_context.length > MAX_VISIBLE_BY_CONTEXT}>
            <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAllByContext(s => !s)}>
              {showAllByContext() ? 'Show fewer' : `Show all ${d().by_context.length}`}
            </Button>
          </Show>
        </section>
      </Show>

      {/* Recent results */}
      <section class="mt-6 pt-4 border-t border-border">
        <div class="flex justify-between gap-4 items-start">
          <div><h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="list-checks" />Last 10 completed actions</h3></div>
        </div>
        <Show when={d().recent_results.length > 0} fallback={<div class="p-4 mt-3 rounded-lg border border-border bg-surface-1"><p class="m-0 text-sm text-muted-foreground">The agent has not completed any actions yet.</p></div>}>
          <div class="grid gap-2.5 mt-3" style={{ 'grid-template-columns': 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <For each={showAllRecent() ? d().recent_results : d().recent_results.slice(0, MAX_VISIBLE_RECENT)}>{result => <div class="p-3 border border-border rounded-lg bg-card flex flex-col gap-1">
              <div class="flex items-center justify-between gap-2">
                <strong class="text-foreground text-sm">{actionLabel(result.action_kind)}</strong>
                <StatusBadge status={outcomeLabel(result.outcome)} tone={outcomeTone(result.outcome)} />
              </div>
              <small class="text-muted-foreground text-sm">{contextLabel(result.context)} · {subjectLabel(result.subject_kind)}</small>
              <Show when={result.metric_key}><small class="text-muted-foreground text-sm">{result.metric_key!.replace(/_/g, ' ')}</small></Show>
              <small class="text-muted-foreground text-sm">{timeAgo(result.completed_at)}</small>
            </div>}</For>
          </div>
          <Show when={d().recent_results.length > MAX_VISIBLE_RECENT}>
            <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAllRecent(s => !s)}>
              {showAllRecent() ? 'Show fewer' : `Show all ${d().recent_results.length}`}
            </Button>
          </Show>
        </Show>
      </section>
    </>}</Show>
  </Card>
}
