import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { SectionIcon } from './SectionIcon'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './EmptyState'
import { SkeletonSection } from './Skeleton'
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
  return <Show when={props.items.length > 0} fallback={<p class="cos-empty">{props.empty}</p>}>
    <ul class="cos-activity-list">
      <For each={props.items}>{item => (
        <li>
          <span class="cos-activity-count">{item.count}</span>
          <span class="cos-activity-name">{labelOr(DECISION_KIND_LABELS, item.action_kind)}</span>
          <Show when={ACTION_CLASS_LABEL[item.action_class]}>
            <small>{ACTION_CLASS_LABEL[item.action_class]}</small>
          </Show>
        </li>
      )}</For>
    </ul>
  </Show>
}

export function ChiefOfStaffPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['chief-of-staff', props.slug, refreshTick()],
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

  return <article class="panel chief-of-staff-panel">
    <div class="section-title">
      <div>
        <span class="eyebrow">LAST 24 HOURS</span>
        <h2><SectionIcon name="activity" />What the autopilot did</h2>
        <p>Its own report: what ran, what it stopped itself from running, and what is waiting on you. Counts cover the last day; measured effect covers the last week.</p>
      </div>
      <Show when={d()}>
        <StatusBadge
          status={d()!.needs_you > 0 ? `${d()!.needs_you} need you` : d()!.failed_24h > 0 ? `${d()!.failed_24h} failed` : 'nothing waiting'}
          tone={d()!.needs_you > 0 ? 'warn' : d()!.failed_24h > 0 ? 'bad' : 'good'}
        />
      </Show>
    </div>

    <Show when={model.error}>
      <div class="inherit-card"><p>The autopilot could not report on itself right now. The panels below still show what the queues say.</p></div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonSection titleWidth="180px" lines={4} minHeight="160px" /></Show>

    <Show when={d()}>{data => <>
      <div class="cos-kpis">
        <div class="cos-kpi"><span>Executed</span><strong>{data().executed_24h}</strong><small>{data().executor_confirmed_24h} confirmed by an executor</small></div>
        <div class="cos-kpi" classList={{ 'tone-bad': data().failed_24h > 0 }}><span>Failed</span><strong>{data().failed_24h}</strong><small>{data().executor_failed_24h} failed at the executor</small></div>
        <div class="cos-kpi" classList={{ 'tone-warn': data().needs_you > 0 }}><span>Waiting on you</span><strong>{data().needs_you}</strong><small>parked until approved</small></div>
        <div class="cos-kpi"><span>Time saved</span><strong>{minutes(data().estimated_minutes_saved_24h)}</strong><small>estimated, from work it ran unattended</small></div>
      </div>

      <Show when={quiet()}>
        <div class="inherit-card">
          <p>The autopilot did nothing in the last day. That is expected when every policy is set to observe or the confidence floor is above what the cycle produced — check the authority policies below.</p>
        </div>
      </Show>

      <div class="cos-grid">
        <section class="cos-block">
          <h3>About to act</h3>
          <ActivityList items={data().about_to_act} empty="Nothing queued for the next cycle." />
        </section>
        <section class="cos-block">
          <h3>Acted alone</h3>
          <ActivityList items={data().acted_alone_24h} empty="It has not acted unattended in the last day." />
        </section>
        <section class="cos-block">
          <h3>Parked for approval</h3>
          <ActivityList items={data().parked_for_approval} empty="Nothing is parked." />
        </section>
      </div>

      <Show when={data().stopped.length > 0}>
        <section class="cos-block cos-stopped">
          <h3>Stopped itself</h3>
          <p class="cos-block-intro">Work the autopilot refused to finish. These do not retry on their own.</p>
          <ul class="cos-stopped-list">
            <For each={data().stopped}>{item => (
              <li>
                <span class="cos-activity-count">{item.count}</span>
                <div>
                  <strong>{STOPPED_REASON_LABEL[item.reason] ?? item.reason.replace(/_/g, ' ')}</strong>
                  <small>{item.detail}</small>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={data().objectives_at_risk.length > 0}>
        <section class="cos-block">
          <h3>Objectives at risk</h3>
          <ul class="cos-risk-list">
            <For each={data().objectives_at_risk}>{item => (
              <li>
                <div>
                  <strong>{item.metric_key.replace(/_/g, ' ')}</strong>
                  <small>{item.platform} · {item.scope_kind} · {item.shortfall.toLocaleString()} short</small>
                </div>
                <div class="row-health">
                  <span class="badge">{(item.progress_basis_points / 100).toFixed(0)}% there</span>
                  <Show when={dueLabel(item.deadline)}>{due => <span class="badge">{due()}</span>}</Show>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={data().attention_items.length > 0}>
        <section class="cos-block">
          <h3>Asking for you by name</h3>
          <ul class="cos-risk-list">
            <For each={data().attention_items}>{item => (
              <li>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail} · {labelOr(SUBJECT_KIND_LABELS, item.subject_kind)}</small>
                </div>
                <div class="row-health">
                  <StatusBadge status={item.urgency} tone={urgencyTone(item.urgency)} />
                  <Show when={dueLabel(item.due_at)}>{due => <span class="badge">{due()}</span>}</Show>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={data().top_opportunities.length > 0}>
        <section class="cos-block">
          <h3>Best it has found</h3>
          <ul class="cos-risk-list">
            <For each={data().top_opportunities}>{item => (
              <li>
                <div>
                  <strong>{labelOr(DECISION_KIND_LABELS, item.decision_kind)}</strong>
                  <small>{labelOr(CONTEXT_LABELS, item.context)} · {item.reason}</small>
                </div>
                <div class="row-health">
                  <span class="badge">confidence {Math.round(item.confidence / 100)}%</span>
                  <Show when={item.needs_approval}><span class="badge tone-warn">needs approval</span></Show>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={measured() > 0} fallback={
        <p class="cos-measured-note">Nothing it did in the last week has been measured yet. Effects are scored once enough time has passed to attribute them.</p>
      }>
        <div class="cos-measured">
          <span class="cos-measured-label">Measured effect, 7 days</span>
          <div class="cos-measured-bar" role="img" aria-label={`${data().measured_improved_7d} improved, ${data().measured_neutral_7d} neutral, ${data().measured_worsened_7d} worsened`}>
            <span class="cos-measured-good" style={{ width: `${(data().measured_improved_7d / measured()) * 100}%` }} />
            <span class="cos-measured-neutral" style={{ width: `${(data().measured_neutral_7d / measured()) * 100}%` }} />
            <span class="cos-measured-bad" style={{ width: `${(data().measured_worsened_7d / measured()) * 100}%` }} />
          </div>
          <span class="cos-measured-legend">
            {data().measured_improved_7d} improved · {data().measured_neutral_7d} neutral · {data().measured_worsened_7d} worsened
          </span>
        </div>
      </Show>

      <Show when={data().moved.length > 0}>
        <section class="cos-block">
          <h3>What moved</h3>
          <ul class="cos-risk-list">
            <For each={data().moved}>{item => (
              <li>
                <div>
                  <strong>{item.subject}</strong>
                  <small>{item.claim}</small>
                </div>
                <div class="row-health">
                  <StatusBadge
                    status={item.assessment}
                    tone={item.assessment === 'improved' ? 'good' : item.assessment === 'worsened' ? 'bad' : 'muted'}
                  />
                  <Show when={item.delta_basis_points != null}>
                    <span class="badge">{item.delta_basis_points! > 0 ? '+' : ''}{(item.delta_basis_points! / 100).toFixed(1)}%</span>
                  </Show>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={data().show_tasks.length > 0}>
        <section class="cos-block">
          <h3>Show tasks it is tracking</h3>
          <ul class="cos-risk-list">
            <For each={data().show_tasks}>{item => (
              <li>
                <div>
                  <strong>{item.event_title}</strong>
                  <small>{item.task_key.replace(/_/g, ' ')}</small>
                </div>
                <div class="row-health">
                  <StatusBadge status={item.status} tone={item.status === 'done' ? 'good' : item.status === 'overdue' ? 'bad' : 'muted'} />
                  <Show when={dueLabel(item.starts_at)}>{due => <span class="badge">{due()}</span>}</Show>
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
  </article>
}
