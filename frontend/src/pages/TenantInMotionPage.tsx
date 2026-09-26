import { For, Show, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link, useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { timestampMillis } from '../lib/format'
import { DECISION_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { KpiCard, KpiStrip, PageShell, PageHeader, Section, SkeletonBlock } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { RelayRunCard } from '../components/RelayRunCard'
import { EmptyState } from '../components/ui/empty-state'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { StatusBadge } from '../components/StatusBadge'
import { OutcomeRow } from '../components/work'
import { Button } from '../components/app/button'

// In motion — "what is the machine doing right now on its own?" (mockup
// `console-mockups/in-motion.html`). One read, `in-motion/model`: the relay
// runs, the autopilot overview and the intelligence brief. The numbers and
// the stuck card come from the overview and the brief; "finished in the
// last day" tallies the overview's recent actions by kind.
//
// The relay runs are the first process kind on the page: one synced band post
// fanned out to one Signal push plus one drafted post per admitted community.
// A run's forum checklist is a second request made only when its card opens.

/** Plain words for the action kinds the machine runs most on its own. */
const ACTION_LABEL: Record<string, string> = {
  'agent.run.request': 'AI agent runs',
  'team.assignment.email': 'Team emails',
  'signal.push.request': 'Pushes to fans',
  'content.post.request': 'Posts',
  'visual.render.request': 'Visuals',
}

export function TenantInMotionPage() {
  const params = useParams({ from: '/tenants/$slug/in-motion' })
  const model = useQuery(() => ({
    queryKey: ['in-motion-model', params().slug],
    queryFn: () => api.inMotionModel(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // Runs keep moving while the page sits open — approvals land, posts
    // publish, measurements arrive — so the model keeps a slow poll. A
    // section the tenant could not answer comes back on the same poll.
    refetchInterval: 30_000,
  }))
  const autopilot = () => model.data?.autopilot ?? null
  const chief = () => model.data?.intelligence?.chief_of_staff ?? null
  const runs = () => model.data?.relays?.runs ?? []
  const stuck = () => autopilot()?.awaiting_executor ?? 0

  const finished = createMemo(() => {
    const since = Date.now() - 86_400_000
    const counts = new Map<string, number>()
    for (const action of autopilot()?.recent_actions ?? []) {
      // finished_at can arrive as a time tuple — Date.parse on an array is
      // NaN, which reads "fresh" and inflates the 24h tallies. Drop it instead.
      const finishedAt = timestampMillis(action.finished_at)
      if (action.status !== 'succeeded' || !Number.isFinite(finishedAt) || finishedAt < since) continue
      counts.set(action.action_kind, (counts.get(action.action_kind) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  })

  const status = (): { tone: 'good' | 'warn' | 'bad' | 'muted'; text: string } | null => {
    const a = autopilot()
    if (!a) return null
    if (!a.runtime_enabled) return { tone: 'muted', text: 'The brain is off — nothing runs on its own' }
    if (stuck() > 0) return { tone: 'warn', text: `${stuck()} stuck · no tool can do ${stuck() === 1 ? 'it' : 'them'}` }
    if (a.failed_24h > 0) return { tone: 'bad', text: `${a.failed_24h} failed in the last day` }
    if (a.processing_actions + a.queued_actions > 0) return { tone: 'good', text: `Working · ${a.processing_actions + a.queued_actions} in hand` }
    return { tone: 'good', text: 'Quiet · nothing waiting to run' }
  }

  return (
    <PageShell>
      <PageHeader
        title="In motion"
        description="What the machine is doing right now on its own."
        actions={
          <>
            <Show when={status()}>{pill => <StatusBadge status={pill().text} tone={pill().tone} />}</Show>
            <Button variant="outline" size="sm" onClick={() => void model.refetch()} disabled={model.isFetching} aria-label="Refresh">
              <RefreshCw class={cn(model.isFetching && 'animate-spin')} aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />

      <Show when={model.error}>
        <SectionFailureCard error={model.error} fallback="What the machine is doing did not load" onRetry={() => void model.refetch()} />
      </Show>

      <Show when={!model.error && !model.data}>
        <SkeletonBlock style={{ 'min-height': '80px' }} />
        <SkeletonBlock style={{ 'min-height': '140px' }} />
      </Show>

      <Show when={model.data}>
        <KpiStrip>
          <KpiCard label="Running now" value={autopilot() ? autopilot()!.processing_actions : '—'} sub="being carried out" />
          <KpiCard
            label="Waiting to run"
            value={autopilot() ? autopilot()!.queued_actions + stuck() : '—'}
            sub={stuck() > 0 ? `${stuck()} stuck` : 'the next cycle picks them up'}
            tone={stuck() > 0 ? 'warn' : undefined}
          />
          <KpiCard
            label="Done, last 24 h"
            value={autopilot() ? autopilot()!.succeeded_24h : '—'}
            sub={autopilot() ? `${autopilot()!.failed_24h} failed` : undefined}
            tone={(autopilot()?.failed_24h ?? 0) > 0 ? 'bad' : undefined}
          />
          <KpiCard
            label="Confirmed landed"
            value={autopilot() ? autopilot()!.executor_confirmed_24h : '—'}
            sub="a receipt from the other side"
          />
        </KpiStrip>

        <div class="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Section
            lead
            title="Your posts, carried further"
            icon={<SectionIcon name="workflow" />}
            description="A post worth spreading, fanned out to fans and to the communities that will have it."
            count={runs().length}
          >
            <Show when={model.data?.relays} fallback={<p class="text-sm text-muted-foreground">The relay runs could not be read — they come back on the next refresh.</p>}>
              <Show
                when={runs().length > 0}
                fallback={
                  <EmptyState
                    label="No relays yet"
                    hint="When a synced post is worth spreading, the run lands here — the post, the decision, the forums, and what they gave back."
                  />
                }
              >
                <div class="flex flex-col gap-3">
                  <For each={runs()}>{run => <RelayRunCard slug={params().slug} run={run} />}</For>
                </div>
              </Show>
            </Show>
          </Section>

          <div class="flex flex-col gap-6">
            <Section title="Stuck" icon={<SectionIcon name="alert-triangle" />}>
              <Show when={stuck() > 0 || (chief()?.stopped ?? []).length > 0} fallback={<p class="text-sm text-muted-foreground">Nothing is stuck.</p>}>
                <div class="flex flex-col gap-2">
                  <Show when={stuck() > 0}>
                    <OutcomeRow label="Waiting for a tool nobody runs" result={String(stuck())} resultTone="warn" />
                  </Show>
                  <For each={chief()?.stopped ?? []}>{stop => (
                    <OutcomeRow label={stop.detail.replace(/^\w/, c => c.toUpperCase())} result={String(stop.count)} />
                  )}</For>
                </div>
                <Show when={stuck() > 0}>
                  <p class="mt-3 text-xs text-muted-foreground">
                    They cancel themselves after 24 h. Connect the tool, or turn the step off.
                  </p>
                  <Link to="/tenants/$slug/intelligence" params={{ slug: params().slug }} search={{ tab: 'standing' }} class="mt-2 inline-block text-xs text-primary hover:underline">
                    See which tools are missing →
                  </Link>
                </Show>
              </Show>
            </Section>

            <Section title="Finished, last 24 h" icon={<SectionIcon name="list-checks" />} count={finished().reduce((sum, [, n]) => sum + n, 0)}>
              <Show when={finished().length > 0} fallback={<p class="text-sm text-muted-foreground">Nothing finished in the last day.</p>}>
                <div class="flex flex-col gap-2">
                  <For each={finished()}>{([kind, count]) => (
                    <OutcomeRow label={ACTION_LABEL[kind] ?? labelOr(DECISION_KIND_LABELS, kind)} result={String(count)} resultTone="good" />
                  )}</For>
                </div>
              </Show>
            </Section>
          </div>
        </div>
      </Show>
    </PageShell>
  )
}
