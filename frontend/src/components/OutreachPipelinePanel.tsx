import { For, Show, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { refreshTick, triggerRefresh } from '../lib/refresh'
import { errorMessage } from '../lib/format'
import type { OutreachCandidateView, BookingCandidateView } from '../lib/types'
import { EmptyState } from './EmptyState'

const fitLabel = (bps: number) => `${Math.round(bps / 100)}%`

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (status) {
    case 'admitted': return 'good'
    case 'promoted': return 'good'
    case 'refused': return 'bad'
    default: return 'muted'
  }
}

export function OutreachPipelinePanel(props: { slug: string }) {
  const [tab, setTab] = createSignal<'outreach' | 'booking'>('outreach')
  const [error, setError] = createSignal<string | null>(null)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const refreshSource = () => refreshTick()

  const [outreach] = createResource(refreshSource, async () => {
    try {
      return await api.outreachCandidates(props.slug)
    } catch {
      return null
    }
  })

  const [booking] = createResource(refreshSource, async () => {
    try {
      return await api.bookingCandidates(props.slug)
    } catch {
      return null
    }
  })

  const confirmOutreach = async (candidate: OutreachCandidateView) => {
    setConfirming(candidate.id)
    setError(null)
    try {
      await api.confirmOutreachCandidate(props.slug, candidate.id)
      triggerRefresh()
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
      triggerRefresh()
    } catch (err) {
      setError(errorMessage(err, 'Failed to confirm booking candidate'))
    } finally {
      setConfirming(null)
    }
  }

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Outreach Pipeline</h3>
      <div class="tab-group">
        <button classList={{ tab: true, active: tab() === 'outreach' }} onClick={() => setTab('outreach')}>
          Outreach ({outreach()?.length ?? 0})
        </button>
        <button classList={{ tab: true, active: tab() === 'booking' }} onClick={() => setTab('booking')}>
          Booking ({booking()?.length ?? 0})
        </button>
      </div>
    </div>
    <p class="agent-section-intro">Candidate queues from the growth pipeline. The agent discovers communities and venues; you confirm which ones to pursue.</p>

    <Show when={error()}>
      <div class="error-card">{error()}</div>
    </Show>

    <Show when={tab() === 'outreach'} fallback={
      <Show when={booking()} fallback={<p class="muted">Loading booking candidates…</p>}>
        <Show when={booking()!.length > 0} fallback={<EmptyState label="No booking candidates" hint="The intelligence scans for gig opportunities with computed economics. Candidates appear here when the detector finds viable shows." />}>
          <div class="table-wrap">
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
                <For each={booking()}>{(c: BookingCandidateView) => (
                  <tr>
                    <td><strong>{c.display_name}</strong><br /><span class="muted">{c.target_kind}</span></td>
                    <td>{c.city_slug ?? '—'}</td>
                    <td><span class="muted">{c.route_kind}</span><br />{c.route_value}</td>
                    <td>{fitLabel(c.fit_basis_points)}</td>
                    <td><span class={`badge tone-${statusTone(c.status)}`}>{c.status}</span></td>
                    <td>
                      <Show when={c.status !== 'refused' && c.status !== 'promoted'}>
                        <button
                          class="ghost"
                          disabled={confirming() === c.candidate_id}
                          onClick={() => confirmBooking(c)}
                        >{confirming() === c.candidate_id ? '…' : 'Confirm'}</button>
                      </Show>
                    </td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    }>
      <Show when={outreach()} fallback={<p class="muted">Loading outreach candidates…</p>}>
        <Show when={outreach()!.length > 0} fallback={<EmptyState label="No outreach candidates" hint="Outreach candidates are fans or contacts the intelligence identified for engagement. They appear here when detectors raise them." />}>
          <div class="table-wrap">
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
                <For each={outreach()}>{(c: OutreachCandidateView) => (
                  <tr>
                    <td><strong>{c.display_name}</strong><br /><span class="muted">{c.target_kind}</span></td>
                    <td><span class="muted">{c.source}</span></td>
                    <td><span class="muted">{c.route_kind}</span></td>
                    <td>{fitLabel(c.fit_basis_points)}</td>
                    <td>{c.follower_count != null ? c.follower_count.toLocaleString() : '—'}</td>
                    <td><span class={`badge tone-${statusTone(c.status)}`}>{c.status}</span></td>
                    <td>
                      <Show when={c.status !== 'refused' && c.status !== 'promoted'}>
                        <button
                          class="ghost"
                          disabled={confirming() === c.id}
                          onClick={() => confirmOutreach(c)}
                        >{confirming() === c.id ? '…' : 'Confirm'}</button>
                      </Show>
                    </td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </Show>
  </div>
}
