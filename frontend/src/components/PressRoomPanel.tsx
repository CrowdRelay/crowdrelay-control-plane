import { For, Show, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { refreshTick, triggerRefresh } from '../lib/refresh'
import { errorMessage, formatTimestamp } from '../lib/format'
import type { BeaconPressRequestsResponse, BeaconPressAssetsResponse, BeaconEngagementsResponse, BeaconCoverageResponse } from '../lib/types'
import { EmptyState } from './EmptyState'
import { SkeletonBlock } from './Skeleton'

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (status) {
    case 'resolved': case 'fulfilled': return 'good'
    case 'pending': case 'open': return 'warn'
    case 'declined': case 'rejected': return 'bad'
    default: return 'muted'
  }
}

export function PressRoomPanel(props: { slug: string }) {
  const [tab, setTab] = createSignal<'requests' | 'assets' | 'engagements' | 'coverage'>('requests')
  const [error, setError] = createSignal<string | null>(null)
  const [resolving, setResolving] = createSignal<string | null>(null)
  const refreshSource = () => refreshTick()

  const [requests] = createResource(refreshSource, async () => {
    try {
      return await api.beaconPressRequests(props.slug)
    } catch {
      return null
    }
  })

  const [assets] = createResource(refreshSource, async () => {
    try {
      return await api.beaconPressAssets(props.slug)
    } catch {
      return null
    }
  })

  const [engagements] = createResource(refreshSource, async () => {
    try {
      return await api.beaconSignalEngagements(props.slug)
    } catch {
      return null
    }
  })

  const [coverage] = createResource(refreshSource, async () => {
    try {
      return await api.beaconCoverage(props.slug)
    } catch {
      return null
    }
  })

  const resolveRequest = async (requestId: string) => {
    setResolving(requestId)
    setError(null)
    try {
      await api.resolveBeaconPressRequest(props.slug, requestId, { status: 'resolved' })
      triggerRefresh()
    } catch (err) {
      setError(errorMessage(err, 'Failed to resolve press request'))
    } finally {
      setResolving(null)
    }
  }

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Press Room</h3>
      <div class="tab-group">
        <button classList={{ tab: true, active: tab() === 'requests' }} onClick={() => setTab('requests')}>
          Requests ({requests()?.requests.length ?? 0})
        </button>
        <button classList={{ tab: true, active: tab() === 'assets' }} onClick={() => setTab('assets')}>
          Assets ({assets()?.assets.length ?? 0})
        </button>
        <button classList={{ tab: true, active: tab() === 'engagements' }} onClick={() => setTab('engagements')}>
          Engagements ({engagements()?.engagements.length ?? 0})
        </button>
        <button classList={{ tab: true, active: tab() === 'coverage' }} onClick={() => setTab('coverage')}>
          Coverage ({coverage()?.coverage.length ?? 0})
        </button>
      </div>
    </div>
    <p class="agent-section-intro">Press requests from beacons, press assets for distribution, event engagements, and earned media coverage.</p>

    <Show when={error()}>
      <div class="error-card">{error()}</div>
    </Show>

    <Show when={tab() === 'requests'}>
      <Show when={requests()} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={requests()!.requests.length > 0} fallback={<EmptyState label="No press requests" hint="Press requests are outreach actions to media contacts. They appear here when the intelligence dispatches press pitches." />}>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Kind</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <For each={requests()!.requests}>{(r) => (
                  <tr>
                    <td><strong>{r.displayName}</strong><br /><span class="muted">{r.beaconKind}</span></td>
                    <td>{r.requestKind}</td>
                    <td>{r.eventTitle ?? '—'}</td>
                    <td><span class={`badge tone-${statusTone(r.status)}`}>{r.status}</span></td>
                    <td>{formatTimestamp(r.createdAt)}</td>
                    <td>
                      <Show when={r.status === 'pending' || r.status === 'open'}>
                        <button
                          class="ghost"
                          disabled={resolving() === r.id}
                          onClick={() => resolveRequest(r.id)}
                        >{resolving() === r.id ? '…' : 'Resolve'}</button>
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

    <Show when={tab() === 'assets'}>
      <Show when={assets()} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={assets()!.assets.length > 0} fallback={<EmptyState label="No press assets" hint="Press assets are media materials (photos, bios, EPKs) available for outreach. Upload them through the tenant content pipeline." />}>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Kind</th>
                  <th>Event</th>
                  <th>Active</th>
                  <th>Updated</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                <For each={assets()!.assets}>{(a) => (
                  <tr>
                    <td><strong>{a.labelEn}</strong><br /><span class="muted">{a.labelPl}</span></td>
                    <td>{a.assetKind}</td>
                    <td>{a.eventTitle ?? '—'}</td>
                    <td>{a.active ? '✓' : '—'}</td>
                    <td>{formatTimestamp(a.updatedAt)}</td>
                    <td><a href={a.url} target="_blank" rel="noopener noreferrer" class="link">Open</a></td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </Show>

    <Show when={tab() === 'engagements'}>
      <Show when={engagements()} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={engagements()!.engagements.length > 0} fallback={<EmptyState label="No event engagements" hint="Event engagements track press interactions for specific shows and releases." />}>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Beacon</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Help</th>
                  <th>Notifications</th>
                  <th>Coverage</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                <For each={engagements()!.engagements}>{(e) => (
                  <tr>
                    <td><strong>{e.displayName}</strong><br /><span class="muted">{e.beaconKind}</span></td>
                    <td>{e.eventTitle}</td>
                    <td><span class={`badge tone-${statusTone(e.status)}`}>{e.status}</span></td>
                    <td>{e.helpKind ?? '—'}</td>
                    <td>{e.notificationCount}</td>
                    <td>{e.coverageCount}</td>
                    <td>{formatTimestamp(e.updatedAt)}</td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </Show>

    <Show when={tab() === 'coverage'}>
      <Show when={coverage()} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={coverage()!.coverage.length > 0} fallback={<EmptyState label="No earned media coverage" hint="Earned media coverage tracks press mentions and reviews. They appear here once the intelligence detects coverage." />}>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Beacon</th>
                  <th>Event</th>
                  <th>Kind</th>
                  <th>Title</th>
                  <th>Created</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                <For each={coverage()!.coverage}>{(c) => (
                  <tr>
                    <td><strong>{c.displayName}</strong></td>
                    <td>{c.eventTitle}</td>
                    <td>{c.coverageKind}</td>
                    <td>{c.title ?? '—'}</td>
                    <td>{formatTimestamp(c.createdAt)}</td>
                    <td><a href={c.url} target="_blank" rel="noopener noreferrer" class="link">Open</a></td>
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
