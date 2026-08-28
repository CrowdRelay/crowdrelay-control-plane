import { For, Show, createResource } from 'solid-js'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { formatTimestamp } from '../lib/format'
import type { BeaconDashboardResponse, BeaconCandidatesResponse, BeaconNetworkResponse } from '../lib/types'

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (status) {
    case 'active': return 'good'
    case 'invited': return 'good'
    case 'paused': return 'warn'
    case 'revoked': return 'bad'
    default: return 'muted'
  }
}

export function BeaconSignalPanel(props: { slug: string }) {
  const refreshSource = () => refreshTick()

  const [dashboard] = createResource(refreshSource, async () => {
    try {
      return await api.beaconSignalDashboard(props.slug)
    } catch {
      return null
    }
  })

  const [candidates] = createResource(refreshSource, async () => {
    try {
      return await api.beaconSignalCandidates(props.slug)
    } catch {
      return null
    }
  })

  const [network] = createResource(refreshSource, async () => {
    try {
      return await api.beaconNetwork(props.slug)
    } catch {
      return null
    }
  })

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Beacon Signal Network</h3>
      <Show when={dashboard()}>
        <span class="muted">{dashboard()!.total} beacons · {dashboard()!.active} active</span>
      </Show>
    </div>
    <p class="agent-section-intro">Press and industry relationships. Beacons are the people the agent is talking to — journalists, promoters, superfans. The network shows discovery runs and invite jobs.</p>

    <Show when={dashboard()} fallback={<p class="muted">Loading beacon dashboard…</p>}>
      <div class="kpi-strip">
        <div class="kpi"><span class="kpi-value">{dashboard()!.total}</span><span class="kpi-label">Total</span></div>
        <div class="kpi"><span class="kpi-value">{dashboard()!.active}</span><span class="kpi-label">Active</span></div>
        <div class="kpi"><span class="kpi-value">{dashboard()!.invited}</span><span class="kpi-label">Invited</span></div>
        <div class="kpi"><span class="kpi-value">{dashboard()!.paused}</span><span class="kpi-label">Paused</span></div>
        <div class="kpi"><span class="kpi-value">{dashboard()!.revoked}</span><span class="kpi-label">Revoked</span></div>
      </div>

      <Show when={dashboard()!.profiles.length > 0} fallback={<p class="muted">No beacon profiles yet.</p>}>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>City</th>
                <th>Status</th>
                <th>Invites</th>
                <th>Press</th>
                <th>Coverage</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              <For each={dashboard()!.profiles}>{(p) => (
                <tr>
                  <td><strong>{p.displayName}</strong>{p.contactEmail ? <><br /><span class="muted">{p.contactEmail}</span></> : null}</td>
                  <td>{p.beaconKind}</td>
                  <td>{p.city ?? '—'}</td>
                  <td><span class={`badge tone-${statusTone(p.status)}`}>{p.status}</span></td>
                  <td>{p.inviteCount}</td>
                  <td>{p.openPressRequests}</td>
                  <td>{p.coverageCount}</td>
                  <td>{formatTimestamp(p.lastSeenAt)}</td>
                </tr>
              )}</For>
            </tbody>
          </table>
        </div>
      </Show>
    </Show>

    <Show when={candidates()} fallback={<p class="muted">Loading candidates…</p>}>
      <Show when={candidates()!.candidates.length > 0}>
        <h4 class="subsection">Candidates</h4>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>City</th>
                <th>Relevance</th>
                <th>Relationship</th>
                <th>Signal</th>
                <th>Invites</th>
              </tr>
            </thead>
            <tbody>
              <For each={candidates()!.candidates}>{(c) => (
                <tr>
                  <td><strong>{c.displayName}</strong><br /><span class="muted">{c.contactEmail}</span></td>
                  <td>{c.beaconKind}</td>
                  <td>{c.city ?? '—'}</td>
                  <td>{Math.round(c.relevanceBasisPoints / 100)}%</td>
                  <td>{Math.round(c.relationshipScore / 100)}%</td>
                  <td>{c.signalStatus ?? '—'}</td>
                  <td>{c.inviteCount}</td>
                </tr>
              )}</For>
            </tbody>
          </table>
        </div>
      </Show>
    </Show>

    <Show when={network()} fallback={<p class="muted">Loading network…</p>}>
      <h4 class="subsection">Network Discovery</h4>
      <Show when={network()!.discoveryRuns.length > 0} fallback={<p class="muted">No discovery runs.</p>}>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>Status</th>
                <th>Discovered</th>
                <th>Target</th>
                <th>Requested</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              <For each={network()!.discoveryRuns}>{(r) => (
                <tr>
                  <td>{r.countryCode}</td>
                  <td><span class={`badge tone-${r.status === 'completed' ? 'good' : r.status === 'failed' ? 'bad' : 'muted'}`}>{r.status}</span></td>
                  <td>{r.discoveredCount}</td>
                  <td>{r.targetCount}</td>
                  <td>{formatTimestamp(r.requestedAt)}</td>
                  <td>{formatTimestamp(r.completedAt)}</td>
                </tr>
              )}</For>
            </tbody>
          </table>
        </div>
      </Show>

      <Show when={network()!.inviteJobs.length > 0}>
        <h4 class="subsection">Invite Jobs</h4>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Beacons</th>
                <th>Radius</th>
                <th>Exchanged</th>
                <th>Active</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <For each={network()!.inviteJobs}>{(j) => (
                <tr>
                  <td><span class={`badge tone-${j.status === 'reported' ? 'good' : 'muted'}`}>{j.status}</span></td>
                  <td>{j.beaconCount}</td>
                  <td>{j.radiusKm}km</td>
                  <td>{j.exchangedCount}</td>
                  <td>{j.activeCount}</td>
                  <td>{formatTimestamp(j.createdAt)}</td>
                </tr>
              )}</For>
            </tbody>
          </table>
        </div>
      </Show>
    </Show>
  </div>
}
