import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { SectionIcon } from './SectionIcon'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './EmptyState'
import { SkeletonSection } from './Skeleton'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import type { ChiefOfStaffActivity } from '../lib/types'

// The `/operations/chief-of-staff` read model has been served since the
// autopilot learned to report on itself, and nothing rendered it. It is the
// only place that answers "what did this thing do for me, and what did it
// refuse to do" in one request: counts for the last day, what it is about to
// do, what it parked, what it stopped and why, and which objectives are
// slipping. Without it the operator infers autopilot behaviour from queue
// depths.

const ACTION_CLASS_LABEL: Record<string, string> = {
  first_party_reversible: 'reversible, our own surface',
  first_party_irreversible: 'irreversible, our own surface',
  third_party_reversible: 'reversible, someone else’s surface',
  third_party_irreversible: 'irreversible, someone else’s surface',
  spend: 'spends money',
}

const STOPPED_REASON_LABEL: Record<string, string> = {
  unexpected: 'unexpected failure',
  guardrail: 'guardrail refused it',
  budget: 'out of budget',
  confidence: 'below the confidence floor',
  cap: 'hit the daily cap',
}

const urgencyTone = (urgency: string): 'bad' | 'warn' | 'muted' =>
  urgency === 'overdue' || urgency === 'critical' ? 'bad' : urgency === 'soon' ? 'warn' : 'muted'

const minutes = (value: number) => {
  if (value <= 0) return '0m'
  if (value < 60) return `${value}m`
  const hours = Math.floor(value / 60)
  const rest = value % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

const dueLabel = (iso: string) => {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  const hours = Math.round((parsed.getTime() - Date.now()) / 3_600_000)
  if (hours < 0) return `${Math.abs(hours)}h overdue`
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

function ActivityList(props: { items: ChiefOfStaffActivity[]; empty: string }) {
  return <Show when={props.items.length > 0} fallback={<p class="m-0 text-sm text-muted-foreground">{props.empty}</p>}>
    <ul class="m-0 p-0 flex flex-col gap-1.5 list-none">
      <For each={props.items}>{item => (
        <li class="flex items-center gap-2.5">
          <span class="inline-flex items-center justify-center min-w-[28px] h-[24px] px-1.5 rounded-sm bg-surface-4 text-primary-foreground font-bold text-xs">{item.count}</span>
          <span class="text-sm text-foreground">{labelOr(DECISION_KIND_LABELS, item.action_kind)}</span>
          <Show when={ACTION_CLASS_LABEL[item.action_class]}>
            <small class="text-xs text-muted-foreground">{ACTION_CLASS_LABEL[item.action_class]}</small>
          </Show>
        </li>
      )}</For>
    </ul>
  </Show>
}

export function ChiefOfStaffPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['chief-of-staff', props.slug],
    queryFn: () => api.chiefOfStaff(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  }))

  const d = () => model.data
  const measured = () => {
    const data = d()
    if (!data) return 0
    return data.measured_improved_7d + data.measured_neutral_7d + data.measured_worsened_7d
  }
  const quiet = () => {
    const data = d()
    if (!data) return false
    return data.executed_24h === 0 && data.failed_24h === 0 && data.about_to_act.length === 0
      && data.parked_for_approval.length === 0 && data.stopped.length === 0
  }

  return <Card class="p-5 chief-of-staff-panel">
    <div class="flex items-start justify-between gap-4 mt-6 mb-3">
      <div>
        <h2 class="mt-1 text-lg font-bold text-foreground flex items-center gap-2"><SectionIcon name="activity" />What the autopilot did</h2>
        <p class="mt-1 text-sm text-muted-foreground leading-relaxed max-w-prose">Its own report: what ran, what it stopped, and what is waiting on you.</p>
      </div>
      <Show when={d()}>
        <StatusBadge
          status={d()!.needs_you > 0 ? `${d()!.needs_you} need you` : d()!.failed_24h > 0 ? `${d()!.failed_24h} failed` : 'nothing waiting'}
          tone={d()!.needs_you > 0 ? 'warn' : d()!.failed_24h > 0 ? 'bad' : 'good'}
        />
      </Show>
    </div>

    <Show when={model.error}>
      <div class="p-4 mt-2.5"><p class="m-0 text-sm text-muted-foreground">The autopilot could not report on itself right now.</p></div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonSection titleWidth="180px" lines={4} minHeight="160px" /></Show>

    <Show when={d()}>{data => <>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div class="p-3 border border-border rounded-lg bg-card"><span class="block text-xs text-muted-foreground">Executed</span><strong class="block mt-1 text-xl font-bold tabular-nums text-foreground">{data().executed_24h}</strong><small class="block text-xs text-muted-foreground mt-0.5">{data().executor_confirmed_24h} confirmed by an executor</small></div>
        <div class="p-3 border border-border rounded-lg bg-card" classList={{ 'border-destructive/30': data().failed_24h > 0 }}><span class="block text-xs text-muted-foreground">Failed</span><strong class="block mt-1 text-xl font-bold tabular-nums text-foreground" classList={{ 'text-destructive': data().failed_24h > 0 }}>{data().failed_24h}</strong><small class="block text-xs text-muted-foreground mt-0.5">{data().executor_failed_24h} failed at the executor</small></div>
        <div class="p-3 border border-border rounded-lg bg-card" classList={{ 'border-warning/30': data().needs_you > 0 }}><span class="block text-xs text-muted-foreground">Waiting on you</span><strong class="block mt-1 text-xl font-bold tabular-nums text-foreground" classList={{ 'text-warning': data().needs_you > 0 }}>{data().needs_you}</strong><small class="block text-xs text-muted-foreground mt-0.5">parked until approved</small></div>
        <div class="p-3 border border-border rounded-lg bg-card"><span class="block text-xs text-muted-foreground">Time saved</span><strong class="block mt-1 text-xl font-bold tabular-nums text-foreground">{minutes(data().estimated_minutes_saved_24h)}</strong><small class="block text-xs text-muted-foreground mt-0.5">estimated, from work it ran unattended</small></div>
      </div>

      <Show when={quiet()}>
        <div class="p-4 mt-3">
          <p class="m-0 text-sm text-muted-foreground">The autopilot did nothing in the last day — expected when every policy is set to observe or the confidence floor is above what the cycle produced.</p>
        </div>
      </Show>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold text-foreground">About to act</h3>
          <ActivityList items={data().about_to_act} empty="Nothing queued for the next cycle." />
        </section>
        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold text-foreground">Acted alone</h3>
          <ActivityList items={data().acted_alone_24h} empty="It has not acted unattended in the last day." />
        </section>
        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold text-foreground">Parked for approval</h3>
          <ActivityList items={data().parked_for_approval} empty="Nothing is parked." />
        </section>
      </div>

      <Show when={data().stopped.length > 0}>
        <section class="mt-6 pt-6 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">Stopped itself</h3>
          <p class="mt-1 text-sm text-muted-foreground">Work the autopilot refused to finish. These do not retry on their own.</p>
          <ul class="m-0 p-0 mt-3 flex flex-col gap-2 list-none">
            <For each={data().stopped}>{item => (
              <li class="flex items-start gap-2.5">
                <span class="inline-flex items-center justify-center min-w-[28px] h-[24px] px-1.5 rounded-sm bg-surface-4 text-primary-foreground font-bold text-xs flex-shrink-0">{item.count}</span>
                <div class="min-w-0">
                  <strong class="block text-sm text-foreground">{STOPPED_REASON_LABEL[item.reason] ?? item.reason.replace(/_/g, ' ')}</strong>
                  <small class="block text-xs text-muted-foreground">{item.detail}</small>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={data().objectives_at_risk.length > 0}>
        <section class="mt-6 pt-6 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">Objectives at risk</h3>
          <ul class="m-0 p-0 mt-3 flex flex-col gap-2 list-none">
            <For each={data().objectives_at_risk}>{item => (
              <li class="flex items-center justify-between gap-3 py-2 border-b border-border">
                <div class="min-w-0">
                  <strong class="block text-sm text-foreground">{item.metric_key.replace(/_/g, ' ')}</strong>
                  <small class="block text-xs text-muted-foreground">{item.platform} · {item.scope_kind} · {item.shortfall.toLocaleString()} short</small>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="muted">{(item.progress_basis_points / 100).toFixed(0)}% there</Badge>
                  <Show when={dueLabel(item.deadline)}>{due => <Badge variant="warning">{due()}</Badge>}</Show>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={data().attention_items.length > 0}>
        <section class="mt-6 pt-6 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">Asking for you by name</h3>
          <ul class="m-0 p-0 mt-3 flex flex-col gap-2 list-none">
            <For each={data().attention_items}>{item => (
              <li class="flex items-center justify-between gap-3 py-2 border-b border-border">
                <div class="min-w-0">
                  <strong class="block text-sm text-foreground">{item.title}</strong>
                  <small class="block text-xs text-muted-foreground">{item.detail} · {labelOr(SUBJECT_KIND_LABELS, item.subject_kind)}</small>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={item.urgency} tone={urgencyTone(item.urgency)} />
                  <Show when={dueLabel(item.due_at)}>{due => <Badge variant="warning">{due()}</Badge>}</Show>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={data().top_opportunities.length > 0}>
        <section class="mt-6 pt-6 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">Best it has found</h3>
          <ul class="m-0 p-0 mt-3 flex flex-col gap-2 list-none">
            <For each={data().top_opportunities}>{item => (
              <li class="flex items-center justify-between gap-3 py-2 border-b border-border">
                <div class="min-w-0">
                  <strong class="block text-sm text-foreground">{labelOr(DECISION_KIND_LABELS, item.decision_kind)}</strong>
                  <small class="block text-xs text-muted-foreground">{labelOr(CONTEXT_LABELS, item.context)} · {item.reason}</small>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="muted">confidence {Math.round(item.confidence / 100)}%</Badge>
                  <Show when={item.needs_approval}><Badge variant="warning">needs approval</Badge></Show>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={measured() > 0} fallback={
        <p class="mt-6 pt-6 border-t border-border text-sm text-muted-foreground">Nothing it did in the last week has been measured yet.</p>
      }>
        <div class="mt-6 pt-6 border-t border-border">
          <div class="mt-2 flex h-3 rounded-full overflow-hidden bg-surface-3" role="img" aria-label={`${data().measured_improved_7d} improved, ${data().measured_neutral_7d} neutral, ${data().measured_worsened_7d} worsened`}>
            <span class="bg-success" style={{ width: `${(data().measured_improved_7d / measured()) * 100}%` }} />
            <span class="bg-muted" style={{ width: `${(data().measured_neutral_7d / measured()) * 100}%` }} />
            <span class="bg-destructive" style={{ width: `${(data().measured_worsened_7d / measured()) * 100}%` }} />
          </div>
          <span class="block mt-1.5 text-xs text-muted-foreground">
            {data().measured_improved_7d} improved · {data().measured_neutral_7d} neutral · {data().measured_worsened_7d} worsened
          </span>
        </div>
      </Show>

      <Show when={data().moved.length > 0}>
        <section class="mt-6 pt-6 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">What moved</h3>
          <ul class="m-0 p-0 mt-3 flex flex-col gap-2 list-none">
            <For each={data().moved}>{item => (
              <li class="flex items-center justify-between gap-3 py-2 border-b border-border">
                <div class="min-w-0">
                  <strong class="block text-sm text-foreground">{item.subject}</strong>
                  <small class="block text-xs text-muted-foreground">{item.claim}</small>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge
                    status={item.assessment}
                    tone={item.assessment === 'improved' ? 'good' : item.assessment === 'worsened' ? 'bad' : 'muted'}
                  />
                  <Show when={item.delta_basis_points != null}>
                    <Badge variant="muted">{item.delta_basis_points! > 0 ? '+' : ''}{(item.delta_basis_points! / 100).toFixed(1)}%</Badge>
                  </Show>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={data().show_tasks.length > 0}>
        <section class="mt-6 pt-6 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">Show tasks it is tracking</h3>
          <ul class="m-0 p-0 mt-3 flex flex-col gap-2 list-none">
            <For each={data().show_tasks}>{item => (
              <li class="flex items-center justify-between gap-3 py-2 border-b border-border">
                <div class="min-w-0">
                  <strong class="block text-sm text-foreground">{item.event_title}</strong>
                  <small class="block text-xs text-muted-foreground">{item.task_key.replace(/_/g, ' ')}</small>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={item.status} tone={item.status === 'done' ? 'good' : item.status === 'overdue' ? 'bad' : 'muted'} />
                  <Show when={dueLabel(item.starts_at)}>{due => <Badge variant="muted">{due()}</Badge>}</Show>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>
    </>}</Show>

    <Show when={d() && !model.isPending && d()!.executed_24h === 0 && d()!.failed_24h === 0 && d()!.stopped.length === 0 && d()!.about_to_act.length === 0 && d()!.attention_items.length === 0}>
      <EmptyState label="No autopilot activity recorded" hint="Once a cycle runs and a policy allows it to act, this is where the run shows up." />
    </Show>
  </Card>
}
