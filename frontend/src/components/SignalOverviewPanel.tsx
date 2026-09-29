import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { SkeletonSignalOverview } from './Skeleton'
import { Alert } from './app/alert'
import { KpiCard, KpiStrip, SectionTitle, ErrorCard } from './layout'
import { whileIncomplete } from '../lib/incomplete'
import type { SignalOverview } from '../lib/types'

export function SignalOverviewPanel(props: { slug: string }) {
  const signal = useQuery(() => ({
    queryKey: ['tenant-signal-overview', props.slug],
    queryFn: () => api.signalOverview(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    // This model names the sources it could not reach instead of guessing, and
    // says so in a 200 — so nothing retried it and the panel kept showing the
    // gap for the life of the tab. Same contract as `degraded`, same recovery.
    refetchInterval: whileIncomplete<SignalOverview>(model => model.unavailable_sources.length > 0),
  }))

  return <>
    <Show when={signal.isPending && !signal.data}>
      <SkeletonSignalOverview />
    </Show>
    <Show when={signal.error}>
      <SectionTitle title="App audience health" icon={<SectionIcon name="activity" />} />
      <ErrorCard title="Couldn't check app audience health" error={signal.error} onRetry={() => void signal.refetch()} />
    </Show>
    <Show when={signal.data}>{data => <>
    <SectionTitle
      title="App audience health"
      description={authState.isPlatformLevel() ? 'Aggregate-only view of Virya Signal fans, activity and top cities.' : 'A view of your Signal fans, activity and top cities.'}
      icon={<SectionIcon name="activity" />}
      action={<StatusBadge status={data().unavailable_sources.length > 0 ? (authState.isPlatformLevel() ? 'degraded' : "couldn't check") : 'healthy'} tone={data().unavailable_sources.length > 0 ? 'warn' : 'good'} />}
    />
    <KpiStrip class="mb-0">
      <KpiCard label="Total fans" value={data().summary.total_fans.toLocaleString()} sub={`${data().summary.active_fans.toLocaleString()} active`} />
      <KpiCard label="Pending" value={data().summary.pending_fans.toLocaleString()} sub={`${data().summary.unsubscribed_fans.toLocaleString()} unsubscribed`} />
      <KpiCard label="Marketing opt-in" value={data().summary.marketing_opted_in.toLocaleString()} sub={`${data().summary.nearby_enabled.toLocaleString()} nearby`} />
      <KpiCard label={authState.isPlatformLevel() ? 'Suppressed' : 'Muted'} value={data().summary.suppressed_fans.toLocaleString()} sub={authState.isPlatformLevel() ? 'preference-disabled' : 'turned off'} />
      <KpiCard label="Organic new (7d)" value={data().activity.new_fans_7d.toLocaleString()} sub={`${data().activity.new_fans_30d.toLocaleString()} in 30d`} />
      <KpiCard label="Archive → Signal" value={data().activity.archive_engaged.toLocaleString()} sub={`${data().activity.archive_staged.toLocaleString()} staged · ${data().activity.archive_pending.toLocaleString()} pending · ${data().activity.archive_confirmed.toLocaleString()} confirmed of ${data().activity.archive_imported.toLocaleString()}`} />
      <KpiCard label="Referrals" value={data().activity.referral_attributions_total.toLocaleString()} sub={`${data().activity.referral_attributions_30d.toLocaleString()} in 30d`} />
      <KpiCard label="Event interests" value={data().activity.event_interests_total.toLocaleString()} sub={`${data().activity.event_interests_30d.toLocaleString()} in 30d`} />
      <KpiCard label="Nearby (30d)" value={data().activity.nearby_notifications_30d.toLocaleString()} sub={`${data().activity.pending_city_requests.toLocaleString()} city requests`} />
    </KpiStrip>
    <Show when={data().top_cities.length > 0}>
      <SectionTitle title="By active fans" icon={<SectionIcon name="map-pin" />} />
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <For each={data().top_cities.slice(0, 6)}>{city => <KpiCard label={city.name} value={city.active_fans.toLocaleString()} sub={city.country_code} />}</For>
      </div>
    </Show>
    <Show when={data().unavailable_sources.length > 0}><Alert tone="warning"><p>{authState.isPlatformLevel() ? 'Unavailable sources' : 'Could not check'}: {data().unavailable_sources.join(', ')}</p></Alert></Show>
  </>}</Show>
  </>
}
