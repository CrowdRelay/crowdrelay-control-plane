import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/solid-query'
import { ChevronDown, ExternalLink } from 'lucide-solid'
import { api } from '../lib/api'
import { writeGuard } from '../lib/read-only'
import { confidencePercent, errorMessage, formatIsoAge, formatIsoUntil } from '../lib/format'
import { cn } from '../lib/cn'
import { toast } from './app/toast'
import { Button } from './app/button'
import { Checkbox } from './app/checkbox'
import { Input } from './ui/input'
import { StatusBadge } from './StatusBadge'
import { Spinner } from './Spinner'
import type {
  RelayProcessRun,
  RelayProcessRunDetail,
  RelayTarget,
  RelayTargetState,
} from '../lib/types'

// One relay run card: the six steps of "I observed a post → I decided it was
// worth spreading → you said go → it went out → here's the proof → here's
// what it gave us", then the per-community checklist under an expander.
//
// The card reads the thin list row; the checklist's own query fires only on
// expand, so the page still costs one request until the operator asks for a
// run's forum detail.

const STATE_LABEL: Record<RelayTargetState, string> = {
  deciding: 'drafting',
  awaiting_you: 'needs you',
  expired: 'lapsed',
  queued: 'queued',
  posting: 'posting',
  rate_limited: 'held by reddit',
  posted: 'posted',
  manual: 'needs a hand',
  failed: 'failed',
  skipped: 'skipped',
}

const STATE_TONE: Record<RelayTargetState, 'good' | 'warn' | 'bad' | 'muted'> = {
  deciding: 'muted',
  awaiting_you: 'warn',
  expired: 'muted',
  queued: 'muted',
  posting: 'muted',
  rate_limited: 'warn',
  posted: 'good',
  manual: 'warn',
  failed: 'bad',
  skipped: 'muted',
}

/// The headline answer — helpful, unhelpful, or still too early to call.
/// Derived only from what the run has actually produced: an unmeasured run
/// never claims a result.
const verdict = (run: RelayProcessRun): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } => {
  if (run.conversions > 0)
    return { label: `brought ${run.conversions} fan${run.conversions === 1 ? '' : 's'}`, tone: 'good' }
  if (run.replies > 0) return { label: 'getting replies', tone: 'good' }
  if (run.batch_status === 'revoked') return { label: 'pulled back', tone: 'muted' }
  if (run.batch_status === 'awaiting_approval' || run.awaiting > 0)
    return { label: 'waiting on you', tone: 'warn' }
  if (run.posted + run.manual > 0) return { label: 'out there — measuring', tone: 'muted' }
  if (run.communities_decided > 0 && run.failed + run.skipped >= run.communities_decided)
    return { label: 'went nowhere', tone: 'bad' }
  if (run.expired > 0 && run.awaiting === 0 && run.posted + run.manual === 0)
    return { label: 'lapsed', tone: 'muted' }
  return { label: 'in motion', tone: 'muted' }
}

/// The drip's own words — 3600 reads "one an hour", not "3600s".
const cadence = (seconds: number): string => {
  if (seconds % 3600 === 0) {
    const h = seconds / 3600
    return h === 1 ? 'one an hour' : `one every ${h}h`
  }
  if (seconds % 60 === 0) return `one every ${seconds / 60}min`
  return `one every ${seconds}s`
}

function Step(props: { label: string; children: import('solid-js').JSX.Element; warn?: boolean }) {
  return (
    <div class="flex min-w-0 flex-col gap-0.5">
      <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{props.label}</span>
      <span class={cn('truncate text-sm font-medium tabular-nums', props.warn ? 'text-warning-foreground' : 'text-foreground')}>
        {props.children}
      </span>
    </div>
  )
}

export function RelayRunCard(props: { slug: string; run: RelayProcessRun }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = createSignal(false)

  const detail = useQuery(() => ({
    queryKey: ['relay-process-run', props.slug, props.run.source_id],
    // `id` on each target (mapped in the api client) lets reconcile keep row
    // identity across the 15s poll — without it every refetch remounts the
    // checklist and wipes selection, draft expansions, half-typed URLs.
    queryFn: () => api.relayProcessRun(props.slug, props.run.source_id),
    enabled: open(),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    reconcile: 'id',
    // The states move while the operator watches — a queue drains, a post
    // lands, a measurement arrives — so the open checklist keeps polling.
    refetchInterval: 15_000,
  }))

  const refresh = async () => {
    await Promise.all([
      detail.refetch(),
      queryClient.invalidateQueries({ queryKey: ['relay-process-runs', props.slug] }),
      queryClient.invalidateQueries({ queryKey: ['tenant-delivery', props.slug] }),
    ])
  }

  const v = () => verdict(props.run)
  const run = () => props.run

  return (
    <article class="rounded-lg border border-border bg-card">
      {/* Header: the observed post — thumbnail, title, where it came from. */}
      <div class="flex items-start gap-3 p-4 pb-0">
        <Show when={run().thumbnail_url}>
          {url => <img src={url()} alt="" class="size-10 shrink-0 rounded-md object-cover" loading="lazy" />}
        </Show>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h3 class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {run().title ?? 'Untitled post'}
            </h3>
            <StatusBadge status={v().label} tone={v().tone} />
            <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)} aria-expanded={open()}>
              <ChevronDown class={cn('transition-transform', open() && 'rotate-180')} aria-hidden="true" />
              {open() ? 'Hide forums' : 'See the forums'}
            </Button>
          </div>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Observed {run().occurred_at ? formatIsoAge(run().occurred_at!) : formatIsoAge(run().decided_at)}
            <Show when={run().platform}> · {run().platform}</Show>
            <Show when={run().source_url}>
              {url => (
                <>
                  {' · '}
                  <a
                    href={url()}
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                  >
                    original <ExternalLink class="size-3" aria-hidden="true" />
                  </a>
                </>
              )}
            </Show>
          </p>
        </div>
      </div>

      {/* The six steps. Each cell is one step position, not an entity — the
          words under it are counts and times, not links to other pages. */}
      <div class="grid grid-cols-3 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-6">
        <Step label="Observed">
          {run().occurred_at ? formatIsoAge(run().occurred_at!) : '—'}
        </Step>
        <Step label="Decided">
          {confidencePercent(run().confidence_bp)} → {run().communities_decided}
        </Step>
        <Step label="Needs you" warn={run().batch_status === 'awaiting_approval' || run().awaiting > 0}>
          {run().batch_status === 'awaiting_approval'
            ? run().awaiting > 0
              ? `the spread — ${run().awaiting} parked`
              : 'the spread'
            : run().awaiting > 0
              ? `${run().awaiting} waiting`
              : run().expired > 0
                ? `${run().expired} lapsed`
                : 'nothing'}
        </Step>
        <Step label="Going out">
          {run().batch_status === 'approved' && run().interval_seconds != null
            ? `dripping — ${cadence(run().interval_seconds!)}`
            : run().deciding + run().queued + run().posting + run().rate_limited}
        </Step>
        <Step label="Posted">
          {run().posted + run().manual > 0
            ? `${run().posted + run().manual}${run().manual > 0 ? ` (${run().manual} by hand)` : ''}`
            : run().skipped > 0
              ? `${run().skipped} skipped`
              : '—'}
        </Step>
        <Step label="Gave us">
          {run().conversions > 0
            ? `+${run().conversions} fans`
            : run().replies > 0
              ? `${run().replies} ${run().replies === 1 ? 'reply' : 'replies'}`
              : run().total_score != null
                ? `score ${run().total_score}`
                : '—'}
        </Step>
      </div>

      {/* The Signal push leg — the owned-audience half of the same decision. */}
      <Show when={run().push_decided || run().push_status}>
        <p class="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
          Signal push{run().push_status ? `: ${run()!.push_status}` : ' decided'}
        </p>
      </Show>

      <Show when={open()}>
        <RelayRunChecklist
          slug={props.slug}
          detail={detail}
          onChanged={() => void refresh()}
        />
      </Show>
    </article>
  )
}

// ── The per-forum checklist ─────────────────────────────────────────────

function RelayRunChecklist(props: {
  slug: string
  detail: UseQueryResult<RelayProcessRunDetail>
  onChanged: () => void
}) {
  const targets = () => props.detail.data?.targets ?? []

  // Actions the operator moved this session, keyed by action id. The pin is
  // optimistic — it holds only until the server reports the target left
  // 'awaiting_you', so a moved row never flaps back mid-refresh and a stale
  // pin never outlives the real state.
  const [moved, setMoved] = createSignal<Map<string, 'queued' | 'skipped'>>(new Map())
  const effectiveState = (t: RelayTarget): RelayTargetState =>
    (t.action_id && moved().get(t.action_id)) || t.state
  createEffect(() => {
    const data = props.detail.data
    if (!data) return
    setMoved(prev => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      let changed = false
      for (const t of data.targets) {
        if (t.action_id && next.has(t.action_id) && t.state !== 'awaiting_you') {
          next.delete(t.action_id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  })

  const awaiting = () => targets().filter(t => effectiveState(t) === 'awaiting_you')
  // Awaiting rows start selected — the brain already decided they are worth
  // the post; the operator's deselect is the "not this one" in the ask.
  const [unchecked, setUnchecked] = createSignal<Set<string>>(new Set())
  // A deselect dies with the ask: a target that leaves awaiting — approved,
  // skipped, lapsed — drops its entry so a re-opened ask comes back selected.
  createEffect(() => {
    const current = unchecked()
    if (current.size === 0) return
    const live = new Set(awaiting().map(t => t.target_id))
    const next = new Set([...current].filter(id => live.has(id)))
    if (next.size !== current.size) setUnchecked(next)
  })
  const selected = () => awaiting().filter(t => !unchecked().has(t.target_id))
  const toggle = (t: RelayTarget, on: boolean) =>
    setUnchecked(prev => {
      const next = new Set(prev)
      if (on) next.delete(t.target_id)
      else next.add(t.target_id)
      return next
    })

  const batchStatus = () => props.detail.data?.batch_status ?? null
  const intervalSeconds = () => props.detail.data?.interval_seconds ?? null
  // The batch owns the ask — parked rows still answer it one by one, but
  // the operator's yes/no lands on the batch and releases or cancels the
  // whole spread at once.
  const askOpen = () => batchStatus() === 'awaiting_approval'
  const dripRunning = () => batchStatus() === 'approved'

  const [busy, setBusy] = createSignal(false)
  const [confirming, setConfirming] = createSignal<string | null>(null)

  // An armed confirm must not outlive the state it was armed on — when the
  // batch leaves the ask (or the armed target itself leaves the ask), the
  // button goes back to its resting label instead of staying one click from
  // a write the row no longer accepts.
  createEffect(() => {
    const armed = confirming()
    if (armed === null) return
    if (armed === 'approve') {
      if (!askOpen() || (awaiting().length > 0 && selected().length === 0))
        setConfirming(null)
      return
    }
    if (armed === 'revoke') {
      if (batchStatus() !== 'awaiting_approval' && batchStatus() !== 'approved')
        setConfirming(null)
      return
    }
    const t = targets().find(t => t.target_id === armed)
    if (!t || effectiveState(t) !== 'awaiting_you') setConfirming(null)
  })

  // One yes per source: leave out the unchecked parked rows (cancel them
  // first so the release cannot include them), then approve the batch once —
  // parked deliveries release to the drip and late drafts queue under the
  // standing answer.
  const approveSpread = async () => {
    if (busy() || !askOpen()) return
    const chosen = selected().length
    const excluded = awaiting().filter(t => unchecked().has(t.target_id) && t.action_id)
    if (confirming() !== 'approve') {
      setConfirming('approve')
      return
    }
    setConfirming(null)
    setBusy(true)
    try {
      const cancels = await Promise.allSettled(
        excluded.map(t => api.cancelOpportunityAction(props.slug, t.action_id!)),
      )
      const refused = cancels.filter(r => r.status === 'rejected').length
      if (refused > 0) {
        // A deselect that did not land would ride the approval out — hold
        // the whole answer rather than post one community too many.
        toast.error(`${refused} of the left-out did not cancel — the approval was not sent`)
        props.onChanged()
        return
      }
      excluded.forEach(t => setMoved(prev => new Map(prev).set(t.action_id!, 'skipped')))
      await api.approveCommunityRelay(props.slug, props.detail.data!.source_id)
      selected().forEach(t => {
        if (t.action_id) setMoved(prev => new Map(prev).set(t.action_id!, 'queued'))
      })
      const pace = intervalSeconds() ? ` — ${cadence(intervalSeconds()!)}` : ''
      toast.success(`Posting to ${chosen} communit${chosen === 1 ? 'y' : 'ies'}${pace}`)
      props.onChanged()
    } catch (error) {
      toast.error(errorMessage(error, 'The approval did not go through'))
    } finally {
      setBusy(false)
    }
  }

  // The other answer — parked deliveries lose their ask, queued ones cancel,
  // posts still in the drip stop. What already landed on Reddit stays.
  const revokeSpread = async () => {
    if (busy()) return
    if (confirming() !== 'revoke') {
      setConfirming('revoke')
      return
    }
    setConfirming(null)
    setBusy(true)
    try {
      await api.revokeCommunityRelay(props.slug, props.detail.data!.source_id)
      awaiting().forEach(t => {
        if (t.action_id) setMoved(prev => new Map(prev).set(t.action_id!, 'skipped'))
      })
      toast.success('Pulled back — nothing else goes out')
      props.onChanged()
    } catch (error) {
      toast.error(errorMessage(error, 'The revoke did not go through'))
    } finally {
      setBusy(false)
    }
  }

  const skip = async (t: RelayTarget) => {
    if (busy() || !t.action_id) return
    if (confirming() !== t.target_id) {
      setConfirming(t.target_id)
      return
    }
    setConfirming(null)
    setBusy(true)
    try {
      await api.cancelOpportunityAction(props.slug, t.action_id)
      setMoved(prev => new Map(prev).set(t.action_id!, 'skipped'))
      toast.success(`Skipped r/${t.subreddit ?? 'community'}`)
      props.onChanged()
    } catch (error) {
      toast.error(errorMessage(error, 'That did not go through'))
    } finally {
      setBusy(false)
    }
  }

  const counts = createMemo(() => {
    const byState = new Map<RelayTargetState, number>()
    for (const t of targets()) {
      const s = effectiveState(t)
      byState.set(s, (byState.get(s) ?? 0) + 1)
    }
    return byState
  })

  return (
    <div class="border-t border-border px-4 pb-4 pt-3">
      <Show when={props.detail.isPending}>
        <p class="py-4 text-sm text-muted-foreground">Loading the forums…</p>
      </Show>
      <Show when={props.detail.error}>
        <p class="py-4 text-sm text-destructive">
          {errorMessage(props.detail.error, 'The forum list did not load')}
        </p>
      </Show>
      <Show when={props.detail.data}>
        {/* The owned-audience half of the same decision. The thin strip
            above already names it — this adds what only the detail knows:
            how many fans it reached, or where its own approval waits. */}
        <Show when={props.detail.data?.push}>
          {push => (
            <Show when={push().audience_size != null || push().status === 'awaiting_approval'}>
              <p class="mb-2 text-xs text-muted-foreground">
                Signal push{push().audience_size != null ? ` reached ${push().audience_size} fans` : ''}
                {push().status === 'awaiting_approval' ? ' — its approval lives in Needs you' : ''}
              </p>
            </Show>
          )}
        </Show>
        {/* The batch ask — one answer for the whole spread. Unchecked rows
            are cancelled as part of the yes; "not this post" pulls the whole
            thing back before it lands. */}
        <Show when={askOpen()}>
          <div class="mb-2 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              writes
              disabled={busy() || (awaiting().length > 0 && selected().length === 0)}
              onClick={() => void approveSpread()}
            >
              <Show when={busy() && confirming() !== 'revoke'}><Spinner /></Show>
              {busy()
                ? 'Answering…'
                : confirming() === 'approve'
                  ? awaiting().length > 0
                    ? `Yes — post to ${selected().length}`
                    : 'Yes — post them as they land'
                  : awaiting().length > 0
                    ? `Post to ${selected().length} checked`
                    : 'Post them as they land'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              writes
              disabled={busy()}
              onClick={() => void revokeSpread()}
            >
              {confirming() === 'revoke' ? 'Yes — pull it all back' : 'Not this post'}
            </Button>
            <span class="text-xs text-muted-foreground">
              {awaiting().length > 0
                ? `${awaiting().length} waiting on you · unchecked communities get left out`
                : 'drafts are still landing — approving queues them as they arrive'}
              {intervalSeconds() ? ` · ${cadence(intervalSeconds()!)}` : ''}
            </span>
          </div>
        </Show>
        {/* The answered ask — the drip is running; the operator can still
            pull back everything that has not landed. */}
        <Show when={dripRunning()}>
          <div class="mb-2 flex flex-wrap items-center gap-3">
            <span class="text-xs text-muted-foreground">
              going out{intervalSeconds() ? ` — ${cadence(intervalSeconds()!)}` : ''}
            </span>
            <Button
              size="sm"
              variant="outline"
              writes
              disabled={busy()}
              onClick={() => void revokeSpread()}
            >
              {confirming() === 'revoke' ? 'Yes — stop the rest' : 'Stop the rest'}
            </Button>
          </div>
        </Show>
        <ul class="flex flex-col">
          <For each={targets()}>
            {t => <TargetRow
              slug={props.slug}
              target={t}
              state={effectiveState(t)}
              selectable={askOpen() && effectiveState(t) === 'awaiting_you'}
              checked={effectiveState(t) === 'awaiting_you' && !unchecked().has(t.target_id)}
              confirming={confirming() === t.target_id}
              disabled={busy()}
              onToggle={on => toggle(t, on)}
              onSkip={() => void skip(t)}
              onChanged={props.onChanged}
            />}
          </For>
        </ul>
        <Show when={targets().length === 0}>
          <p class="py-3 text-sm text-muted-foreground">
            The decision named no communities — nothing was drafted.
          </p>
        </Show>
        {/* The state tally — the checklist's own footer, so a long list still
            ends with the answer rather than the last row. */}
        <p class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <For each={[...counts().entries()]}>
            {([state, n]) => <span>{n} {STATE_LABEL[state]}</span>}
          </For>
        </p>
        <Show when={props.detail.data?.targets_truncated}>
          <p class="mt-1 text-xs text-muted-foreground">
            Showing {targets().length} of {props.detail.data?.targets_total} communities — the tally above counts only the ones shown.
          </p>
        </Show>
      </Show>
    </div>
  )
}

function TargetRow(props: {
  slug: string
  target: RelayTarget
  state: RelayTargetState
  selectable: boolean
  checked: boolean
  confirming: boolean
  disabled: boolean
  onToggle: (on: boolean) => void
  onSkip: () => void
  onChanged: () => void
}) {
  const t = () => props.target
  const name = () => t().subreddit ?? t().display_name ?? 'community'
  const [showDraft, setShowDraft] = createSignal(false)
  const [registering, setRegistering] = createSignal(false)
  const [registerBusy, setRegisterBusy] = createSignal(false)
  const [manualUrl, setManualUrl] = createSignal('')

  const registerManual = async () => {
    if (registerBusy() || !t().community_post_id) return
    setRegisterBusy(true)
    try {
      await api.registerManualCommunityPost(props.slug, t().community_post_id!, manualUrl())
      toast.success(`Registered — r/${name()} is being measured`)
      props.onChanged()
    } catch (error) {
      toast.error(errorMessage(error, 'That did not register'))
    } finally {
      setRegisterBusy(false)
      setRegistering(false)
    }
  }

  return (
    <li class="border-b border-border/60 py-2 last:border-0">
      <div class="flex items-start gap-2.5">
        <div class="pt-0.5">
          <Show when={props.selectable}>
            <Checkbox
              checked={props.checked}
              onChange={props.onToggle}
              disabled={props.disabled}
              {...writeGuard()}
              aria-label={`Include r/${name()}`}
            />
          </Show>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-sm font-medium text-foreground">r/{name()}</span>
            <Show when={t().confidence_bp != null}>
              <span class="text-xs tabular-nums text-muted-foreground">{confidencePercent(t().confidence_bp!)}</span>
            </Show>
            <StatusBadge status={STATE_LABEL[props.state]} tone={STATE_TONE[props.state]} />
            <Show when={t().converted}>
              <StatusBadge status="brought a fan" tone="good" />
            </Show>
          </div>
          {/* The draft — what would actually be posted, before approving. */}
          <Show when={t().draft_title}>
            <Button
              variant="link"
              class="mt-0.5 block h-auto w-full p-0 text-left text-xs font-normal text-muted-foreground hover:text-foreground hover:no-underline"
              onClick={() => setShowDraft(v => !v)}
            >
              {showDraft() ? '▾' : '▸'} {t().draft_title}
            </Button>
            <Show when={showDraft()}>
              <p class="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground">
                {t().draft_body}
              </p>
            </Show>
          </Show>
          {/* The receipt — the live post and its numbers. */}
          <Show when={t().reddit_post_url}>
            {url => (
              <a
                href={url()}
                target="_blank"
                rel="noreferrer"
                class="mt-0.5 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
              >
                view on reddit <ExternalLink class="size-3" aria-hidden="true" />
              </a>
            )}
          </Show>
          <Show when={t().score != null || t().num_comments != null}>
            <span class="ml-2 text-xs tabular-nums text-muted-foreground">
              {t().score != null ? `score ${t().score}` : ''}
              {t().num_comments != null ? ` · ${t().num_comments} comments` : ''}
              {t().measured_at ? ` · measured ${formatIsoAge(t().measured_at!)}` : ''}
            </span>
          </Show>
          <Show when={props.state === 'failed' && t().error_kind}>
            <p class="mt-0.5 text-xs text-destructive">{t()!.error_kind}</p>
          </Show>
          {/* A deferred delivery is not stuck work — Reddit refused it and
              the retry clock is the answer to "why is this still here". */}
          <Show when={props.state === 'rate_limited'}>
            <p class="mt-0.5 text-xs text-warning-foreground">
              Reddit rate-limited this community{t().rate_limited_until ? ` — retries ${formatIsoUntil(t().rate_limited_until!)}` : ''}
            </p>
          </Show>
          {/* The manual leg — the post exists, it just was not made through
              the machine. Registering the URL turns measurement on. */}
          <Show when={props.state === 'manual' && t().community_post_id}>
            <Show
              when={registering()}
              fallback={
                <Button
                  variant="link"
                  class="mt-0.5 h-auto p-0 text-xs font-normal"
                  writes
                  onClick={() => setRegistering(true)}
                >
                  posted it by hand? register the link
                </Button>
              }
            >
              <span class="mt-1 flex items-center gap-2">
                <Input
                  type="url"
                  class="h-7 w-64 max-w-full text-xs"
                  placeholder="https://www.reddit.com/r/…/comments/…"
                  value={manualUrl()}
                  onInput={e => setManualUrl(e.currentTarget.value)}
                />
                <Button size="sm" variant="outline" writes disabled={registerBusy() || !manualUrl().includes('reddit.com')} onClick={() => void registerManual()}>
                  <Show when={registerBusy()}><Spinner /></Show>
                  Register
                </Button>
              </span>
            </Show>
          </Show>
        </div>
        <div class="shrink-0">
          <Show when={props.state === 'awaiting_you' && t().action_id}>
            <Button
              size="sm"
              variant="ghost"
              writes
              disabled={props.disabled}
              onClick={props.onSkip}
            >
              {props.confirming ? 'Yes, skip' : 'Skip'}
            </Button>
          </Show>
        </div>
      </div>
    </li>
  )
}
