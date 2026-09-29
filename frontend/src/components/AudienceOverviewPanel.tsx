import { For, Show } from 'solid-js'
import { ChevronRight, CloudOff } from 'lucide-solid'
import { authState } from '../lib/auth'
import type { AudienceOverview } from '../lib/types'
import { compactNumber } from '../lib/charts'
import { EmptyState } from './ui/empty-state'
import { KpiValue } from './KpiValue'
import { Section } from './layout'
import { Button } from './app/button'

const fmt = (value: number | undefined) => value == null ? '—' : compactNumber(value)

/** One funnel stage: the number, what it means, and the smaller counts that
 *  roll up into it. `null` sub-values stay "—" — a missing number is an
 *  absent answer, never a zero. */
function FunnelStage(props: { stage: string; value: number | undefined; meaning: string; subs?: { label: string; value: number | undefined }[] }) {
  return (
    <div class="min-w-0 flex-1 rounded-lg border border-border px-3 py-2.5">
      <p class="m-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{props.stage}</p>
      <p class="m-0 mt-1 text-2xl font-semibold tabular-nums text-foreground"><KpiValue value={fmt(props.value)} /></p>
      <p class="m-0 mt-0.5 text-xs leading-snug text-muted-foreground">{props.meaning}</p>
      <Show when={props.subs?.length}>
        <div class="mt-2 space-y-0.5 border-t border-border/60 pt-1.5">
          <For each={props.subs}>{sub => (
            <p class="m-0 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
              <span>{sub.label}</span>
              <span class="tabular-nums text-foreground/80">{fmt(sub.value)}</span>
            </p>
          )}</For>
        </div>
      </Show>
    </div>
  )
}

export function AudienceOverviewPanel(props: { slug: string; overview?: AudienceOverview; onGoSources?: () => void; onGoCommunities?: () => void; onGoContacts?: () => void }) {
  // A funnel of zeros is a true answer to a question nobody asked. A tenant
  // with no fans yet needs the three places fans actually come from, not a
  // wall of zeros on the page that carries the north star.
  const empty = () => (props.overview?.active_fans ?? 0) === 0

  return <Section flush title="The funnel">
    <div>
      <Show when={props.overview} fallback={<EmptyState icon={<CloudOff />} label="Couldn't load the audience overview" hint="This is usually temporary. Try again in a few minutes." />}>
        {/* The three starting points replace the zeros rather than sitting above
            them. Rendering both said "here is what to do" and then answered the
            unasked question seven times underneath. They are also buttons now:
            as stacked full-width ghosts they read as centred body text, which is
            the one thing a call to action must not look like. */}
        <Show when={empty()} fallback={
          /* The fanbase as a funnel — the question this tab answers is not
             "how many" but "how far did they get". Sources leads in without a
             number: the count lives on the Sources tab and inventing one
             here would double-count it. Every later stage carries its own
             number from the overview model. */
          <div class="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div class="min-w-0 flex-1 rounded-lg border border-dashed border-border px-3 py-2.5">
              <p class="m-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sources</p>
              <p class="m-0 mt-1 text-sm leading-snug text-muted-foreground">
                Where they arrive from — platforms, imports, communities.
              </p>
              <Button type="button" variant="link" size="sm" class="mt-1 h-auto p-0 text-xs" onClick={() => props.onGoSources?.()}>
                See where they come from →
              </Button>
            </div>
            <ChevronRight class="hidden shrink-0 self-center text-muted-foreground/50 sm:block" size={16} aria-hidden="true" />
            <FunnelStage stage="Captured" value={props.overview!.active_fans} meaning="every fan on record" />
            <ChevronRight class="hidden shrink-0 self-center text-muted-foreground/50 sm:block" size={16} aria-hidden="true" />
            <FunnelStage stage="Activated" value={props.overview!.marketing_consented_fans} meaning="consented — who we can actually tell" />
            <ChevronRight class="hidden shrink-0 self-center text-muted-foreground/50 sm:block" size={16} aria-hidden="true" />
            <FunnelStage
              stage="Retained"
              value={props.overview!.attendees}
              meaning="came to a show"
              subs={[{ label: 'Synesthesia participants', value: props.overview!.synesthesia_participants }]}
            />
            <ChevronRight class="hidden shrink-0 self-center text-muted-foreground/50 sm:block" size={16} aria-hidden="true" />
            <FunnelStage
              stage="Converted"
              value={props.overview!.ticket_buyers}
              meaning="bought a ticket"
              subs={[
                { label: 'Paid orders', value: props.overview!.paid_ticket_orders },
                { label: 'Qualified referrals', value: props.overview!.qualified_referrals },
              ]}
            />
          </div>
        }>
          <div class="py-2">
            <strong class="text-foreground">No fans aggregated yet</strong>
            <p class="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">Fans arrive from connected platforms, from the communities the brain scans, and from the people carrying a release into a new city. Start one of those and the counters here fill on the next {authState.isPlatformLevel() ? 'ingestion' : 'import'}.</p>
            <div class="flex flex-wrap gap-2 mt-4">
              {/* Fan sources and communities live on this page's other tabs —
                  in-memory tab state means no href can reach them, so these
                  are buttons wired to the page's switchTab, not Links. */}
              <Button type="button" size="sm" onClick={() => props.onGoSources?.()}>Connect a fan source</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => props.onGoCommunities?.()}>{authState.isPlatformLevel() ? 'Work the communities queue' : 'Work the communities'}</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => props.onGoContacts?.()}>Add contacts</Button>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  </Section>
}
