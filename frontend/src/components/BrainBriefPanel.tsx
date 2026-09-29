import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { ChartLine, Check, CircleCheck, Compass, Inbox, X } from 'lucide-solid'
import { api } from '../lib/api'
import { refreshQueriesSoon } from '../lib/refresh'
import type { IntelligenceBrief, PendingActionSummary } from '../lib/types'
import { confidencePercent, formatIsoUntil, humanizeToken, relativeTime } from '../lib/format'
import { toast } from './app/toast'
import { Section, SkeletonBlock } from './layout'
import { SectionIcon } from './SectionIcon'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './ui/empty-state'
import { SectionFailureCard } from './SectionFailureCard'
import { Button } from './app/button'
import { CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, labelOr } from '../lib/opportunity-labels'

// The brain brief — the "are we getting anywhere" story in one read.
//
// Renders the same facts the detail tabs hold, as a narrative: is the brain
// working, in what mode, what did it find, what is its plan, what does it
// need from you, what did it do, and what came of it. The verdict strip at
// the top is the answer; the sections below are the evidence.
//
// One request. The upstream composes brain assessment, posture, cycle
// preview, chief-of-staff, pending approvals and blocked communities into a
// single IntelligenceBrief — the browser never orchestrates a fan-out.

export function BrainBriefPanel(props: { slug: string; initial?: IntelligenceBrief | null }) {
  const brief = useQuery(() => ({
    queryKey: ['intelligence-brief', props.slug],
    queryFn: () => api.intelligence(props.slug),
    // The Intelligence page already holds the brief inside the brain model;
    // starting from it keeps opening the page to one read.
    initialData: props.initial ?? undefined,
    initialDataUpdatedAt: props.initial ? Date.now() : undefined,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    // The brain keeps working while the page sits open — a slow poll keeps
    // the story current without churning.
    refetchInterval: 30_000,
  }))

  return (
    <>
      <Show when={brief.error}>
        <SectionFailureCard
          error={brief.error}
          title="Couldn't load the intelligence brief"
          onRetry={() => void brief.refetch()}
        />
      </Show>

      <Show when={!brief.error && !brief.data}>
        <SkeletonBlock style={{ 'min-height': '120px' }} />
        <SkeletonBlock style={{ 'min-height': '200px' }} />
      </Show>

      <Show when={brief.data}>
        {data => <BriefStory slug={props.slug} brief={data()} />}
      </Show>
    </>
  )
}

// ─── Verdict ────────────────────────────────────────────────────────────
// The one-line answer to "are we getting anywhere": is the brain alive,
// is it improving, and does it need you.

function verdict(brief: IntelligenceBrief): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  if (!brief.worker.alive) return { label: 'not running', tone: 'bad' }
  if (brief.worker.crash_looping) return { label: 'stuck in a loop', tone: 'bad' }
  // needs_attention is true exactly for regressing and stagnant — the state
  // arms below already carry the sharper label, so they win.
  switch (brief.brain.state) {
    case 'improving': return { label: 'getting somewhere', tone: 'good' }
    case 'learning': return { label: 'learning', tone: 'good' }
    case 'regressing': return { label: 'losing ground', tone: 'bad' }
    case 'stagnant': return { label: 'stagnant', tone: 'warn' }
    default: return { label: 'starting up', tone: 'muted' }
  }
}

function verdictSentence(brief: IntelligenceBrief): string {
  if (!brief.worker.alive) {
    return 'The worker is not running — the brain cannot decide or act until it comes back.'
  }
  if (brief.worker.crash_looping) {
    return 'The worker is alive but has not finished a cycle in 30 minutes — it may be restarting without completing work.'
  }
  const quiet = brief.brain.quiet_cycles ?? 0
  const reason = brief.brain.latest_wait_reason
  if (quiet > 0 && reason) {
    return `Quiet for ${quiet} consecutive cycle${quiet === 1 ? '' : 's'} — ${reason}`
  }
  switch (brief.brain.state) {
    case 'improving': return 'The brain is running and its numbers are improving.'
    case 'learning': return 'The brain is running and still building its model of what works.'
    case 'stagnant': return 'The brain is running but the numbers have not moved.'
    case 'regressing': return 'The brain is running and the numbers are going down.'
    default: return 'The brain is running but has not observed enough to say how it is doing.'
  }
}

// ─── Mode ───────────────────────────────────────────────────────────────
// What the posture permits — the same three modes GrowthPosturePanel shows,
// stated as a sentence.

const MODE_LABELS: Record<string, { label: string; description: string }> = {
  grounded: { label: 'Grounded', description: 'Sees everything, touches nothing. All outward contact waits for you.' },
  working: { label: 'Working', description: 'First-party work runs alone. Outward contact waits for your approval.' },
  full_send: { label: 'Full send', description: 'Owned-audience sends and free pitching run without asking.' },
}

// ─── Pending action label ───────────────────────────────────────────────
// One sentence per parked action — enough to decide without opening a modal.

function actionTitle(action: PendingActionSummary): string {
  const label = labelOr(DECISION_KIND_LABELS, action.action_kind)
  if (action.subreddit && action.title) return `${label} — r/${action.subreddit}: ${action.title}`
  if (action.subreddit) return `${label} — r/${action.subreddit}`
  if (action.title) return `${label} — ${action.title}`
  if (action.template_id) return `${label} — ${action.template_id}`
  return label
}

// ─── Activity label ─────────────────────────────────────────────────────
// "3 fan messages" not "fan.lifecycle.message.request × 3".

function activityLabel(kind: string, count: number): string {
  const label = labelOr(DECISION_KIND_LABELS, kind)
  return `${count} ${label.toLowerCase()}${count === 1 ? '' : 's'}`
}

// ─── The panel ──────────────────────────────────────────────────────────

function BriefStory(props: { slug: string; brief: IntelligenceBrief }) {
  const brief = () => props.brief
  const chief = () => props.brief.chief_of_staff
  const v = () => verdict(props.brief)
  const mode = () => MODE_LABELS[props.brief.posture.posture ?? ''] ?? { label: 'Not set', description: 'No posture has been applied yet.' }

  // Approve/reject mutations — the canonical opportunity-action endpoints,
  // same ones the Attention inbox calls. The list refreshes after each.
  const [pending, setPending] = createSignal<Set<string>>(new Set())
  const [acted, setActed] = createSignal<Set<string>>(new Set())

  // Approve/reject mutations — the canonical opportunity-action endpoints,
  // same ones the Attention inbox calls. Every view that lists the same
  // parked action refreshes: this brief, the attention snapshot, and the
  // operations model that carries the queued-actions badge.
  //
  // Coalesced: a run of quick approvals refetches once, after the last click
  // (see `refreshQueriesSoon`). The acted rows are hidden locally meanwhile.
  const invalidateParked = () => {
    refreshQueriesSoon(
      ['intelligence-brief', props.slug],
      ['tenant-operator-attention-snapshot', props.slug],
      ['tenant-today', props.slug],
      ['tenant-brain', props.slug],
      ['tenant-delivery', props.slug],
    )
  }

  const approve = async (action: PendingActionSummary) => {
    setPending(prev => new Set(prev).add(action.id))
    try {
      await api.approveOpportunityAction(props.slug, action.id)
      setActed(prev => new Set(prev).add(action.id))
      toast.success('Approved — the action is executing')
      invalidateParked()
    } catch (error) {
      toast.error("Couldn't approve it", error)
    } finally {
      setPending(prev => { const next = new Set(prev); next.delete(action.id); return next })
    }
  }

  const reject = async (action: PendingActionSummary) => {
    setPending(prev => new Set(prev).add(action.id))
    try {
      await api.cancelOpportunityAction(props.slug, action.id)
      setActed(prev => new Set(prev).add(action.id))
      toast.success('Rejected — the action will not run')
      invalidateParked()
    } catch (error) {
      toast.error("Couldn't reject it", error)
    } finally {
      setPending(prev => { const next = new Set(prev); next.delete(action.id); return next })
    }
  }

  const needsYou = () => brief().needs_you.filter(a => !acted().has(a.id))
  // The setup the growth loop is waiting on before it can propose anything.
  // `?? []` is the older-upstream case, not an assertion that there are none:
  // the section below only claims the brain is unblocked when the tenant
  // actually reported the list.
  const setupGaps = () => brief().join_ask_readiness ?? []
  const reportsSetup = () => brief().join_ask_readiness !== undefined

  return (
    <>
      {/* ── Verdict — the answer to "are we getting anywhere" ── */}
      <Section
        flush
        lead
        title={v().label}
        icon={<SectionIcon name="brain" />}
        description={verdictSentence(brief())}
      >
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge status={brief().brain.state} tone={v().tone} />
          <StatusBadge
            status={mode().label}
            tone={brief().posture.posture ? 'muted' : 'warn'}
          />
          <Show when={brief().worker.alive}>
            <StatusBadge status="worker alive" tone="good" />
          </Show>
          <Show when={!brief().worker.alive}>
            <StatusBadge status="worker down" tone="bad" />
          </Show>
          <Show when={chief().executed_24h > 0}>
            <StatusBadge status={`${chief().executed_24h} done in 24h`} tone="good" />
          </Show>
          <Show when={brief().awaiting_approval > 0}>
            <StatusBadge status={`${brief().awaiting_approval} waiting on you`} tone="warn" />
          </Show>
        </div>
      </Section>

      {/* ── Mode — what the brain is allowed to do ── */}
      <Section
        title="Mode"
        icon={<SectionIcon name="shield" />}
        description={mode().description}
      >
        <Show when={brief().posture.set_at}>
          <p class="text-xs text-muted-foreground">
            Posture set {relativeTime(new Date(brief().posture.set_at!).getTime())}
          </p>
        </Show>
      </Section>

      {/* ── Found — what the brain has discovered ── */}
      <Section
        title="What it found"
        icon={<SectionIcon name="globe" />}
        count={chief().top_opportunities.length + brief().blocked_communities.length + chief().stopped.length}
        description="Opportunities it identified and communities it wants to reach."
      >
        <Show
          when={chief().top_opportunities.length > 0 || brief().blocked_communities.length > 0 || chief().stopped.length > 0}
          fallback={<EmptyState icon={<Compass />} label="Nothing discovered yet" hint="When the brain identifies an opportunity or a community worth reaching, it lands here." />}
        >
          <div class="flex flex-col gap-2">
            <For each={chief().top_opportunities}>
              {opp => (
                <div class="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-foreground">
                      {labelOr(DECISION_KIND_LABELS, opp.decision_kind)}
                    </p>
                    <p class="mt-0.5 text-xs text-muted-foreground">{opp.reason}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <StatusBadge
                      status={`${confidencePercent(opp.confidence)} sure`}
                      tone={opp.confidence >= 7000 ? 'good' : 'muted'}
                    />
                    <Show when={opp.needs_approval}>
                      <StatusBadge status="needs you" tone="warn" />
                    </Show>
                  </div>
                </div>
              )}
            </For>

            <For each={brief().blocked_communities}>
              {community => (
                <div class="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-foreground">r/{community.community}</p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      Wants to post here — needs someone to join the community first
                      {community.member_count ? ` (${community.member_count.toLocaleString()} members)` : ''}
                      {community.discovered_at ? ` · found ${relativeTime(new Date(community.discovered_at).getTime())}` : ''}
                    </p>
                  </div>
                  <StatusBadge status="blocked" tone="warn" />
                </div>
              )}
            </For>

            <For each={chief().stopped}>
              {item => (
                <div class="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-foreground">
                      {item.count} {item.kind.replaceAll('_', ' ')}
                    </p>
                    <p class="mt-0.5 text-xs text-muted-foreground">{item.detail || item.reason}</p>
                  </div>
                  <StatusBadge status="stopped" tone="muted" />
                </div>
              )}
            </For>
          </div>
        </Show>
      </Section>

      {/* ── Plan — what it intends to do ── */}
      <Section
        title="Current plan"
        icon={<SectionIcon name="target" />}
        description={`Strategy: ${brief().cycle.strategy.replaceAll('_', ' ')}`}
      >
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <StatusBadge status={brief().cycle.strategy.replaceAll('_', ' ')} tone="muted" />
            <Show when={brief().cycle.northStar}>
              <StatusBadge
                status={`${brief().cycle.northStar}: ${brief().cycle.northStarCurrent} (+${brief().cycle.northStarThisMonth} this month)`}
                tone="muted"
              />
            </Show>
            <Show when={brief().cycle.templatePriority.length > 0}>
              <StatusBadge
                status={`${brief().cycle.templatePriority.length} workflows queued`}
                tone="muted"
              />
            </Show>
          </div>
          <Show when={brief().cycle.templatePriority.length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <For each={brief().cycle.templatePriority}>
                {template => (
                  <span class="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {template.replaceAll('_', ' ')}
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Section>

      {/* ── Needs you — what only a person can unlock ── */}
      <Section
        title="Needs you"
        icon={<SectionIcon name="bell" />}
        count={needsYou().length + setupGaps().length}
        description="Actions parked for approval, and the setup the growth loop is waiting on. Each one is waiting on a person."
      >
        <Show
          when={needsYou().length > 0 || setupGaps().length > 0}
          fallback={
            <EmptyState icon={<CircleCheck />}
              label="Nothing waiting"
              hint={
                reportsSetup()
                  ? 'The brain is not blocked on you — it either acted or decided not to.'
                  : 'No approvals waiting. This tenant does not report setup gaps, so the growth loop may still be unconfigured.'
              }
            />
          }
        >
          <div class="flex flex-col gap-2">
            {/* Setup first: these gate everything below them. A workspace
                missing its own words produces no decision, so an empty
                approvals queue underneath is a consequence, not health. */}
            <For each={setupGaps()}>
              {gap => (
                <div class="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-foreground">
                      Join-ask setup{gap.platform ? ` · ${gap.platform}` : ''}
                    </p>
                    <p class="mt-0.5 text-xs text-muted-foreground">{gap.remedy}</p>
                  </div>
                  <StatusBadge status="setup" tone="warn" />
                </div>
              )}
            </For>
            <For each={needsYou()}>
              {action => (
                <div class="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-foreground">{actionTitle(action)}</p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {labelOr(CONTEXT_LABELS, action.context)} · {labelOr(SUBJECT_KIND_LABELS, action.subject_kind)}
                      {action.approval_expires_at && ` · lapses ${formatIsoUntil(action.approval_expires_at)}`}
                    </p>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      writes
                      disabled={pending().has(action.id)}
                      onClick={() => void approve(action)}
                    >
                      <Check size={14} aria-hidden="true" />
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      writes
                      disabled={pending().has(action.id)}
                      onClick={() => void reject(action)}
                    >
                      <X size={14} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </For>
            {/* The list is one page (50); the badge above carries the true
                total — say so when they differ. */}
            <Show when={brief().awaiting_approval > needsYou().length}>
              <p class="text-xs text-muted-foreground">
                …and {brief().awaiting_approval - needsYou().length} more waiting — the Attention page lists them all.
              </p>
            </Show>
          </div>
        </Show>
      </Section>

      {/* ── Did — what it did alone ── */}
      <Section
        title="What it did"
        icon={<SectionIcon name="activity" />}
        count={chief().executed_24h}
        description="Actions completed in the last 24 hours."
      >
        <Show
          when={chief().acted_alone_24h.length > 0 || chief().executed_24h > 0}
          fallback={<EmptyState icon={<Inbox />} label="Nothing yet" hint="No actions completed in the last 24 hours." />}
        >
          <div class="flex flex-col gap-2">
            <For each={chief().acted_alone_24h}>
              {activity => (
                <div class="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <p class="text-sm text-foreground">{activityLabel(activity.action_kind, activity.count)}</p>
                  <StatusBadge status={activity.action_class} tone="muted" />
                </div>
              )}
            </For>
            <Show when={chief().failed_24h > 0}>
              <div class="flex items-center justify-between rounded-lg border border-destructive/30 px-4 py-3">
                <p class="text-sm text-foreground">{chief().failed_24h} failed</p>
                <StatusBadge status="failed" tone="bad" />
              </div>
            </Show>
          </div>
        </Show>
      </Section>

      {/* ── Drafted, not published — finished work waiting on a channel ── */}
      <Show when={brief().unpublished_drafts.length > 0}>
        <Section
          title="Drafted, not published"
          icon={<SectionIcon name="inbox" />}
          count={brief().unpublished_drafts.reduce((n, c) => n + c.drafts, 0)}
          description="Work the brain finished that no channel has shipped."
        >
          <div class="flex flex-col gap-2">
            <For each={brief().unpublished_drafts}>
              {channel => (
                <div class="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-foreground">{channel.channel}</p>
                    <Show when={channel.oldest_drafted_at}>
                      <p class="mt-0.5 text-xs text-muted-foreground">
                        oldest draft {relativeTime(new Date(channel.oldest_drafted_at!).getTime())}
                      </p>
                    </Show>
                  </div>
                  <StatusBadge status={`${channel.drafts} waiting`} tone="warn" />
                </div>
              )}
            </For>
          </div>
        </Section>
      </Show>

      {/* ── About to act — what it will do next ── */}
      <Show when={chief().about_to_act.length > 0}>
        <Section
          title="About to act"
          icon={<SectionIcon name="zap" />}
          count={chief().about_to_act.length}
          description="What it will do next unless someone stops it."
        >
          <div class="flex flex-col gap-2">
            <For each={chief().about_to_act}>
              {activity => (
                <div class="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <p class="text-sm text-foreground">{activityLabel(activity.action_kind, activity.count)}</p>
                  <StatusBadge status={activity.action_class} tone="muted" />
                </div>
              )}
            </For>
          </div>
        </Section>
      </Show>

      {/* ── Gave us — what the work produced ── */}
      <Section
        title="What it gave us"
        icon={<SectionIcon name="trending-up" />}
        description="Measured outcomes from the last 7 days."
      >
        <Show
          when={chief().moved.length > 0 || chief().measured_improved_7d > 0 || chief().measured_worsened_7d > 0}
          fallback={<EmptyState icon={<ChartLine />} label="Not enough data yet" hint="The brain needs a few more days of measured outcomes before it can say what moved." />}
        >
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <Show when={chief().measured_improved_7d > 0}>
                <StatusBadge status={`${chief().measured_improved_7d} improved`} tone="good" />
              </Show>
              <Show when={chief().measured_neutral_7d > 0}>
                <StatusBadge status={`${chief().measured_neutral_7d} flat`} tone="muted" />
              </Show>
              <Show when={chief().measured_worsened_7d > 0}>
                <StatusBadge status={`${chief().measured_worsened_7d} worsened`} tone="bad" />
              </Show>
            </div>
            <For each={chief().moved}>
              {item => (
                <div class="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-foreground">{item.subject}</p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {item.assessment}
                      {item.claim === 'correlational' ? ' — correlation, not proven cause' : ''}
                    </p>
                  </div>
                  <Show when={item.delta_basis_points != null}>
                    <StatusBadge
                      status={`${item.delta_basis_points! > 0 ? '+' : ''}${(item.delta_basis_points! / 100).toFixed(1)}%`}
                      tone={item.delta_basis_points! > 0 ? 'good' : item.delta_basis_points! < 0 ? 'bad' : 'muted'}
                    />
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Section>

      {/* ── At risk — declared targets that are behind ── */}
      <Show when={chief().objectives_at_risk.length > 0}>
        <Section
          title="Objectives at risk"
          icon={<SectionIcon name="alert-triangle" />}
          count={chief().objectives_at_risk.length}
        >
          <div class="flex flex-col gap-2">
            <For each={chief().objectives_at_risk}>
              {obj => (
                <div class="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-foreground">{obj.metric_key} on {obj.platform}</p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {humanizeToken(obj.state)} — {(obj.progress_basis_points / 100).toFixed(1)}% of target, {obj.shortfall} short
                    </p>
                  </div>
                  <StatusBadge status={obj.state} tone={obj.state === 'missed' ? 'bad' : 'warn'} />
                </div>
              )}
            </For>
          </div>
        </Section>
      </Show>
    </>
  )
}
