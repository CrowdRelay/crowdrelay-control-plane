import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { PageShell, PageHeader, Section, SkeletonBlock } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { RelayRunCard } from '../components/RelayRunCard'
import { EmptyState } from '../components/ui/empty-state'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { Button } from '../components/app/button'

// In motion — the process view. Each card is one run of a pipeline over one
// subject, rendered as its steps rather than as entities: what was observed,
// what the brain decided, what still needs a person, what went out, the
// proof it landed, and what it gave back.
//
// The community relay is the first process kind on the page: one synced band
// post fanned out to one Signal push plus one drafted Reddit post per
// admitted community. One request loads the run list; a run's forum
// checklist is a second request made only when the card opens.
export function TenantInMotionPage() {
  const params = useParams({ from: '/tenants/$slug/in-motion' })
  const runs = useQuery(() => ({
    queryKey: ['relay-process-runs', params().slug],
    // `id` on each run (mapped in the api client) lets reconcile keep card
    // identity across the 30s poll — without it every refetch remounts the
    // card and collapses an open checklist mid-decision.
    queryFn: () => api.relayProcessRuns(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    reconcile: 'id',
    // Runs keep moving while the page sits open — approvals land, posts
    // publish, measurements arrive — so the list keeps a slow poll.
    refetchInterval: 30_000,
  }))

  return (
    <PageShell>
      <PageHeader
        title="In motion"
        description="What the brain is doing for you right now. Each run is one thing it saw, the call it made, and what came of it — open a run to see the forums and steer each one."
        actions={
          <Button variant="outline" size="sm" onClick={() => void runs.refetch()} disabled={runs.isFetching} aria-label="Refresh">
            <RefreshCw class={cn(runs.isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <Show when={runs.error}>
        <SectionFailureCard error={runs.error} fallback="The process list did not load" onRetry={() => void runs.refetch()} />
      </Show>

      <Show when={!runs.error && !runs.data}>
        <SkeletonBlock style={{ 'min-height': '140px' }} />
        <SkeletonBlock style={{ 'min-height': '140px' }} />
      </Show>

      <Show when={runs.data}>
        {data => (
          <Section
            flush
            lead
            title="Post relays"
            icon={<SectionIcon name="workflow" />}
            description="A post worth spreading, fanned out to the communities that will have it."
          >
            <Show
              when={data().runs.length > 0}
              fallback={
                <EmptyState
                  label="No relays yet"
                  hint="When a synced post is worth spreading, the run lands here — the post, the decision, the forums, and what they gave back."
                />
              }
            >
              <div class="flex flex-col gap-3">
                <For each={data().runs}>
                  {run => <RelayRunCard slug={params().slug} run={run} />}
                </For>
              </div>
            </Show>
          </Section>
        )}
      </Show>
    </PageShell>
  )
}
