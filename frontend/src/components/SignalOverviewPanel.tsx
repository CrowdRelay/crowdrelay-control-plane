import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { SkeletonSignalOverview } from './Skeleton'
import { Alert } from './ui/alert'
import { SectionTitle } from './layout'
import { Card } from './ui/card'

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
      <SectionTitle title="App audience health" icon={<SectionIcon name="activity" />} />
      <Alert tone="warning"><p>Signal overview unavailable: {signal.error instanceof Error ? signal.error.message : 'channel error'}</p></Alert>
    </Show>
    <Show when={signal.data}>{data => <>
    <SectionTitle
      title="App audience health"
      description="Aggregate-only view of Virya Signal fans, activity and top cities."
      icon={<SectionIcon name="activity" />}
      action={<StatusBadge status={data().unavailable_sources.length > 0 ? 'degraded' : 'healthy'} tone={data().unavailable_sources.length > 0 ? 'warn' : 'good'} />}
    />
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      <Card class="rounded-lg p-3.5"><span class="block text-xs text-muted-foreground">Total fans</span><strong class="block text-xl font-bold tabular-nums mt-1">{data().summary.total_fans.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-1">{data().summary.active_fans.toLocaleString()} active</small></Card>
      <Card class="rounded-lg p-3.5"><span class="block text-xs text-muted-foreground">Pending</span><strong class="block text-xl font-bold tabular-nums mt-1">{data().summary.pending_fans.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-1">{data().summary.unsubscribed_fans.toLocaleString()} unsubscribed</small></Card>
      <Card class="rounded-lg p-3.5"><span class="block text-xs text-muted-foreground">Marketing opt-in</span><strong class="block text-xl font-bold tabular-nums mt-1">{data().summary.marketing_opted_in.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-1">{data().summary.nearby_enabled.toLocaleString()} nearby</small></Card>
      <Card class="rounded-lg p-3.5"><span class="block text-xs text-muted-foreground">Suppressed</span><strong class="block text-xl font-bold tabular-nums mt-1">{data().summary.suppressed_fans.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-1">preference-disabled</small></Card>
      <Card class="rounded-lg p-3.5"><span class="block text-xs text-muted-foreground">New (7d)</span><strong class="block text-xl font-bold tabular-nums mt-1">{data().activity.new_fans_7d.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-1">{data().activity.new_fans_30d.toLocaleString()} in 30d</small></Card>
      <Card class="rounded-lg p-3.5"><span class="block text-xs text-muted-foreground">Referrals</span><strong class="block text-xl font-bold tabular-nums mt-1">{data().activity.referral_attributions_total.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-1">{data().activity.referral_attributions_30d.toLocaleString()} in 30d</small></Card>
      <Card class="rounded-lg p-3.5"><span class="block text-xs text-muted-foreground">Event interests</span><strong class="block text-xl font-bold tabular-nums mt-1">{data().activity.event_interests_total.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-1">{data().activity.event_interests_30d.toLocaleString()} in 30d</small></Card>
      <Card class="rounded-lg p-3.5"><span class="block text-xs text-muted-foreground">Nearby (30d)</span><strong class="block text-xl font-bold tabular-nums mt-1">{data().activity.nearby_notifications_30d.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-1">{data().activity.pending_city_requests.toLocaleString()} city requests</small></Card>
    </div>
    <Show when={data().top_cities.length > 0}>
      <SectionTitle title="By active fans" icon={<SectionIcon name="map-pin" />} />
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <For each={data().top_cities.slice(0, 6)}>{city => <Card class="rounded-lg p-3.5"><span class="block text-xs text-muted-foreground">{city.name}</span><strong class="block text-xl font-bold tabular-nums mt-1">{city.active_fans.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-1">{city.country_code}</small></Card>}</For>
      </div>
    </Show>
    <Show when={data().unavailable_sources.length > 0}><Alert tone="warning"><p>Unavailable sources: {data().unavailable_sources.join(', ')}</p></Alert></Show>
  </>}</Show>
  </>
}
