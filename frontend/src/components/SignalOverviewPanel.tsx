import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { SkeletonSignalOverview } from './Skeleton'
import { Alert } from './ui/alert'

export function SignalOverviewPanel(props: { slug: string }) {
  const signal = useQuery(() => ({
    queryKey: ['tenant-signal-overview', props.slug],
    queryFn: () => api.signalOverview(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  return <>
    <Show when={signal.isPending && !signal.data}>
      <SkeletonSignalOverview />
    </Show>
    <Show when={signal.error}>
      <div class="flex items-center justify-between gap-4 mt-6 mb-3" id="signal-overview">
        <div><h3><SectionIcon name="activity" />App audience health</h3></div>
      </div>
      <Alert tone="warning"><p>Signal overview unavailable: {signal.error instanceof Error ? signal.error.message : 'channel error'}</p></Alert>
    </Show>
    <Show when={signal.data}>{data => <>
    <div class="flex items-center justify-between gap-4 mt-6 mb-3" id="signal-overview">
      <div><h3><SectionIcon name="activity" />App audience health</h3><p>Aggregate-only view of Virya Signal fans, activity and top cities.</p></div>
      <StatusBadge status={data().unavailable_sources.length > 0 ? 'degraded' : 'healthy'} tone={data().unavailable_sources.length > 0 ? 'warn' : 'good'} />
    </div>
    <div class="operations-metrics">
      <div><span>Total fans</span><strong>{data().summary.total_fans.toLocaleString()}</strong><small>{data().summary.active_fans.toLocaleString()} active</small></div>
      <div><span>Pending</span><strong>{data().summary.pending_fans.toLocaleString()}</strong><small>{data().summary.unsubscribed_fans.toLocaleString()} unsubscribed</small></div>
      <div><span>Marketing opt-in</span><strong>{data().summary.marketing_opted_in.toLocaleString()}</strong><small>{data().summary.nearby_enabled.toLocaleString()} nearby</small></div>
      <div><span>Suppressed</span><strong>{data().summary.suppressed_fans.toLocaleString()}</strong><small>preference-disabled</small></div>
      <div><span>New (7d)</span><strong>{data().activity.new_fans_7d.toLocaleString()}</strong><small>{data().activity.new_fans_30d.toLocaleString()} in 30d</small></div>
      <div><span>Referrals</span><strong>{data().activity.referral_attributions_total.toLocaleString()}</strong><small>{data().activity.referral_attributions_30d.toLocaleString()} in 30d</small></div>
      <div><span>Event interests</span><strong>{data().activity.event_interests_total.toLocaleString()}</strong><small>{data().activity.event_interests_30d.toLocaleString()} in 30d</small></div>
      <div><span>Nearby (30d)</span><strong>{data().activity.nearby_notifications_30d.toLocaleString()}</strong><small>{data().activity.pending_city_requests.toLocaleString()} city requests</small></div>
    </div>
    <Show when={data().top_cities.length > 0}>
      <div class="flex items-center justify-between gap-4 mt-6 mb-3"><div><h3><SectionIcon name="map-pin" />By active fans</h3></div></div>
      <div class="operations-metrics">
        <For each={data().top_cities.slice(0, 6)}>{city => <div><span>{city.name}</span><strong>{city.active_fans.toLocaleString()}</strong><small>{city.country_code}</small></div>}</For>
      </div>
    </Show>
    <Show when={data().unavailable_sources.length > 0}><Alert tone="warning"><p>Unavailable sources: {data().unavailable_sources.join(', ')}</p></Alert></Show>
  </>}</Show>
  </>
}
