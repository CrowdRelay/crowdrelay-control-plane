import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { refreshQueries } from '../lib/refresh'
import { errorMessage } from '../lib/format'
import type { OutreachCandidateView, BookingCandidateView } from '../lib/types'
import { EmptyState } from './EmptyState'
import { SkeletonBlock } from './Skeleton'
import { TabBar } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

const fitLabel = (bps: number) => `${Math.round(bps / 100)}%`

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (status) {
    case 'admitted': return 'good'
    case 'promoted': return 'good'
    case 'refused': return 'bad'
    default: return 'muted'
  }
}

const toneToVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

export function OutreachPipelinePanel(props: { slug: string }) {
  const [tab, setTab] = createSignal<'outreach' | 'booking'>('outreach')
  const [error, setError] = createSignal<string | null>(null)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const [showAllOutreach, setShowAllOutreach] = createSignal(false)
  const [showAllBooking, setShowAllBooking] = createSignal(false)
  const MAX_VISIBLE = 10

  const outreach = useQuery(() => ({
    queryKey: ['outreach-candidates', props.slug],
    queryFn: () => api.outreachCandidates(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const booking = useQuery(() => ({
    queryKey: ['booking-candidates', props.slug],
    queryFn: () => api.bookingCandidates(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const confirmOutreach = async (candidate: OutreachCandidateView) => {
    setConfirming(candidate.id)
    setError(null)
    try {
      await api.confirmOutreachCandidate(props.slug, candidate.id)
      refreshQueries(['outreach-candidates', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to confirm outreach candidate'))
    } finally {
      setConfirming(null)
    }
  }

  const confirmBooking = async (candidate: BookingCandidateView) => {
    setConfirming(candidate.candidate_id)
    setError(null)
    try {
      await api.confirmBookingCandidate(props.slug, candidate.candidate_id)
      refreshQueries(['booking-candidates', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to confirm booking candidate'))
    } finally {
      setConfirming(null)
    }
  }

  return <Card class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3>Outreach pipeline</h3>
    </div>
    <p class="text-muted-foreground text-sm">Candidate queues from the growth pipeline. The agent discovers communities and venues; you confirm which ones to pursue.</p>
    <TabBar
      active={tab()}
      onChange={setTab}
      tabs={[
        { id: 'outreach', label: 'Outreach', count: () => outreach.data?.length ?? 0 },
        { id: 'booking', label: 'Booking', count: () => booking.data?.length ?? 0 },
      ]}
    />

    <Show when={error()}>
      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{error()}</div>
    </Show>

    <Show when={tab() === 'outreach'} fallback={
      <>
      <Show when={booking.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">Booking pipeline unavailable: {errorMessage(booking.error, 'Service unreachable')}</div></Show>
      <Show when={booking.data} fallback={<SkeletonBlock height="120px" radius="10px" />}>
        <Show when={booking.data!.length > 0} fallback={<EmptyState label="No booking candidates" hint="The intelligence scans for gig opportunities with computed economics. Candidates appear here when the detector finds viable shows." />}>
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>City</th>
                  <th>Route</th>
                  <th>Fit</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <For each={showAllBooking() ? booking.data : booking.data!.slice(0, MAX_VISIBLE)}>{(c: BookingCandidateView) => (
                  <tr>
                    <td><strong>{c.display_name}</strong><br /><span class="text-muted-foreground">{c.target_kind}</span></td>
                    <td>{c.city_slug ?? '—'}</td>
                    <td><span class="text-muted-foreground">{c.route_kind}</span><br />{c.route_value}</td>
                    <td>{fitLabel(c.fit_basis_points)}</td>
                    <td><Badge variant={toneToVariant(statusTone(c.status))}>{c.status}</Badge></td>
                    <td>
                      <Show when={c.status !== 'refused' && c.status !== 'promoted'}>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={confirming() === c.candidate_id}
                          onClick={() => confirmBooking(c)}
                        >{confirming() === c.candidate_id ? '…' : 'Confirm'}</Button>
                      </Show>
                    </td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
          <Show when={booking.data!.length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" onClick={() => setShowAllBooking(s => !s)}>
              {showAllBooking() ? 'Show less' : `Show all (${booking.data!.length})`}
            </Button>
          </Show>
        </Show>
      </Show>
      </>
    }>
      <>
      <Show when={outreach.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">Outreach pipeline unavailable: {errorMessage(outreach.error, 'Service unreachable')}</div></Show>
      <Show when={outreach.data} fallback={<SkeletonBlock height="120px" radius="10px" />}>
        <Show when={outreach.data!.length > 0} fallback={<EmptyState label="No outreach candidates" hint="Outreach candidates are fans or contacts the intelligence identified for engagement. They appear here when detectors raise them." />}>
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Community</th>
                  <th>Source</th>
                  <th>Route</th>
                  <th>Fit</th>
                  <th>Followers</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <For each={showAllOutreach() ? outreach.data : outreach.data!.slice(0, MAX_VISIBLE)}>{(c: OutreachCandidateView) => (
                  <tr>
                    <td><strong>{c.display_name}</strong><br /><span class="text-muted-foreground">{c.target_kind}</span></td>
                    <td><span class="text-muted-foreground">{c.source}</span></td>
                    <td><span class="text-muted-foreground">{c.route_kind}</span></td>
                    <td>{fitLabel(c.fit_basis_points)}</td>
                    <td>{c.follower_count != null ? c.follower_count.toLocaleString() : '—'}</td>
                    <td><Badge variant={toneToVariant(statusTone(c.status))}>{c.status}</Badge></td>
                    <td>
                      <Show when={c.status !== 'refused' && c.status !== 'promoted'}>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={confirming() === c.id}
                          onClick={() => confirmOutreach(c)}
                        >{confirming() === c.id ? '…' : 'Confirm'}</Button>
                      </Show>
                    </td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
          <Show when={outreach.data!.length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" onClick={() => setShowAllOutreach(s => !s)}>
              {showAllOutreach() ? 'Show less' : `Show all (${outreach.data!.length})`}
            </Button>
          </Show>
        </Show>
      </Show>
      </>
    </Show>
  </Card>
}
