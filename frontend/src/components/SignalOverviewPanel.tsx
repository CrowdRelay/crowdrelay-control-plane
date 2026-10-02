import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { SectionIcon } from './SectionIcon'
import { SkeletonSignalOverview } from './Skeleton'
import { Alert } from './app/alert'
import { ErrorCard, PanelTitle } from './layout'
import { Bar, Pill, Tile, Tiles } from './ui/dash'
import { whileIncomplete } from '../lib/incomplete'
import type { SignalOverview } from '../lib/types'

/** The Signal app's read. Shared by the panel and the page's headline tiles,
 *  so both read one cache entry. */
export function useSignalOverview(slug: () => string) {
  return useQuery(() => ({
    queryKey: ['tenant-signal-overview', slug()],
    queryFn: () => api.signalOverview(slug()),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    // This model names the sources it could not reach instead of guessing, and
    // says so in a 200 — so nothing retried it and the panel kept showing the
    // gap for the life of the tab. Same contract as `degraded`, same recovery.
    refetchInterval: whileIncomplete<SignalOverview>(model => model.unavailable_sources.length > 0),
  }))
}

const n = (value: number) => value.toLocaleString()

/** What the Signal fan app reports — who signed up, how they found it, and
 *  where they are. It is the app's data feed, not runtime machinery, and the
 *  card says so rather than passing for a database figure. */
export function SignalOverviewPanel(props: { slug: string }) {
  const signal = useSignalOverview(() => props.slug)
  const platform = authState.isPlatformLevel()

  return <section class="rounded-xl border border-border bg-card p-4 sm:p-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <PanelTitle as="h3" icon={<SectionIcon name="activity" />}>Signal app feed</PanelTitle>
        <p class="mt-1 text-sm text-muted-foreground text-pretty">
          {platform
            ? 'What the Signal fan app reports, aggregate only: who is signed up, how they found it, and where they are.'
            : 'What the Signal app reports about your fans: who is signed up, how they found it, and where they are.'}
        </p>
      </div>
      <Show when={signal.data}>{data =>
        <Pill tone={data().unavailable_sources.length > 0 ? 'warn' : 'good'}>
          {data().unavailable_sources.length > 0 ? (platform ? 'Degraded' : "Couldn't check all") : 'Reporting'}
        </Pill>
      }</Show>
    </div>

    <Show when={signal.isPending && !signal.data}><div class="mt-4"><SkeletonSignalOverview /></div></Show>
    <Show when={signal.error}>
      <div class="mt-4"><ErrorCard title="Couldn't check the Signal app feed" error={signal.error} onRetry={() => void signal.refetch()} /></div>
    </Show>

    <Show when={signal.data}>{data => {
      const s = () => data().summary
      const a = () => data().activity
      // Largest first, so the list reads as the ranking it is.
      const cities = () => [...data().top_cities].sort((x, y) => y.active_fans - x.active_fans).slice(0, 6)
      const funnel = () => [
        { label: 'Imported', value: a().archive_imported },
        { label: 'Staged', value: a().archive_staged },
        { label: 'Pending', value: a().archive_pending },
        { label: 'Confirmed', value: a().archive_confirmed },
        { label: 'Engaged', value: a().archive_engaged },
      ]
      return <div class="mt-4 space-y-5">
        <Show when={data().unavailable_sources.length > 0}>
          <Alert tone="warning">
            {platform ? 'Unavailable sources' : 'Could not check'}: {data().unavailable_sources.join(', ')}. The numbers below leave them out.
          </Alert>
        </Show>

        <div>
          <h4 class="mb-2 text-sm font-medium text-foreground">Fans</h4>
          <Tiles class="mb-0">
            <Tile label="Signed up" value={n(s().total_fans)} sub={`${n(s().active_fans)} active`} />
            <Tile label="Pending" value={n(s().pending_fans)} sub={`${n(s().unsubscribed_fans)} unsubscribed`} />
            <Tile label="Marketing opt-in" value={n(s().marketing_opted_in)} sub={`${n(s().nearby_enabled)} allow nearby alerts`} />
            <Tile label={platform ? 'Suppressed' : 'Muted'} value={n(s().suppressed_fans)} sub={platform ? 'preferences turned off' : 'turned notifications off'} />
          </Tiles>
        </div>

        <div>
          <h4 class="mb-2 text-sm font-medium text-foreground">Growth</h4>
          <Tiles class="mb-0">
            <Tile label="New, 7 days" value={n(a().new_fans_7d)} sub={`${n(a().new_fans_30d)} in 30 days`} />
            <Tile label="Referrals" value={n(a().referral_attributions_total)} sub={`${n(a().referral_attributions_30d)} in 30 days`} />
            <Tile label="Event interests" value={n(a().event_interests_total)} sub={`${n(a().event_interests_30d)} in 30 days`} />
            <Tile label="Nearby alerts, 30 days" value={n(a().nearby_notifications_30d)} sub={`${n(a().pending_city_requests)} city requests`} />
          </Tiles>
        </div>

        <div class="space-y-5">
          {/* The archive import as the funnel it is — each step its own
              number, instead of four numbers in one tile's footnote. */}
          <div class="min-w-0">
            <h4 class="text-sm font-medium text-foreground">From the archive to Signal</h4>
            <p class="mt-0.5 text-xs text-muted-foreground">Fans imported from the old list, step by step to using the app.</p>
            {/* Five even steps; the step number keeps the order when the row
                wraps on a phone. */}
            <ol class="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5" aria-label="Archive import steps">
              <For each={funnel()}>{(step, i) => (
                <li class="min-w-0 rounded-lg bg-muted/55 px-2.5 py-2">
                  <span class="block text-xs text-muted-foreground">{i() + 1} · {step.label}</span>
                  <span class="block text-lg font-medium tabular-nums text-foreground">{n(step.value)}</span>
                </li>
              )}</For>
            </ol>
          </div>

          <Show when={cities().length > 0}>
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-foreground">Where the active fans are</h4>
              <p class="mt-0.5 text-xs text-muted-foreground">Top cities by active fans.</p>
              <div class="mt-2">
                <For each={cities()}>{city =>
                  <Bar label={`${city.name}, ${city.country_code}`} labelWidth="md" value={city.active_fans} max={cities()[0]!.active_fans} />
                }</For>
              </div>
            </div>
          </Show>
        </div>
      </div>
    }}</Show>
  </section>
}
