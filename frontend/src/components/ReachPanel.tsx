import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { Section, KpiStrip, KpiCard } from './layout'
import { SectionIcon } from './SectionIcon'

// Who everything that went out actually reached in the last 30 days, and what
// came back — the "are we getting anywhere" answer measured from delivery
// outcomes rather than from sends. Incremental and durable conversions are
// kept apart from the raw total: a fan who would have come anyway is not a win.

type Reach = {
  unique_reach: number
  delivered: number
  opened: number
  clicked: number
  replied: number
  positive_replies: number
  total_conversions: number
  durable_conversions: number
  incremental_conversions: number
  bounced: number
  failed: number
}

export function ReachPanel(props: { slug: string }) {
  const reach = useQuery(() => ({
    queryKey: ['surface', props.slug, 'reach-30d'],
    queryFn: () => surface.read<Reach>(props.slug, capability('reach').read!.path),
    staleTime: 5 * 60_000,
    retry: 1,
  }))
  return (
    <Section title="Who it reached" icon={<SectionIcon name="users" />} description="The last 30 days of everything that went out: people reached, what they did, and the conversions that lasted.">
      <Show when={!reach.error} fallback={<p class="text-sm text-muted-foreground">Couldn't check the reach.</p>}>
        <Show when={reach.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
          {r => (
            <Show when={r().delivered > 0} fallback={<p class="text-sm text-muted-foreground">Nothing was delivered in the last 30 days.</p>}>
              <KpiStrip>
                <KpiCard label="People reached" value={r().unique_reach} sub={`${r().delivered} delivered`} />
                <KpiCard label="Opened or clicked" value={r().opened + r().clicked} />
                <KpiCard label="Replied" value={r().replied} sub={`${r().positive_replies} positive`} />
                <KpiCard label="Became fans and stayed" value={r().durable_conversions} sub={`${r().incremental_conversions} that would not have come anyway`} />
              </KpiStrip>
              <Show when={r().bounced + r().failed > 0}>
                <p class="mt-2 text-xs text-muted-foreground">{r().bounced} bounced and {r().failed} failed to deliver.</p>
              </Show>
            </Show>
          )}
        </Show>
      </Show>
    </Section>
  )
}
