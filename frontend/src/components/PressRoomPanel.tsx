import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { refreshQueries } from '../lib/refresh'
import { errorMessage, formatTimestamp } from '../lib/format'
import { EmptyState } from './EmptyState'
import { SkeletonBlock } from './Skeleton'
import { TabBar } from './TabBar'

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (status) {
    case 'resolved': case 'fulfilled': return 'good'
    case 'pending': case 'open': return 'warn'
    case 'declined': case 'rejected': return 'bad'
    default: return 'muted'
  }
}

// `BeaconReplyDisposition` in crowdrelay-domain. Ordered by how much the
// answer is worth, with the two that end the relationship last.
const REPLY_DISPOSITIONS = [
  { value: 'received', label: 'Replied' },
  { value: 'interested', label: 'Interested' },
  { value: 'partner', label: 'Partnered' },
  { value: 'declined', label: 'Declined' },
  { value: 'do_not_contact', label: 'Do not contact' },
] as const

export function PressRoomPanel(props: { slug: string }) {
  const [tab, setTab] = createSignal<'requests' | 'assets' | 'engagements' | 'coverage'>('requests')
  const [error, setError] = createSignal<string | null>(null)
  const [resolving, setResolving] = createSignal<string | null>(null)
  const [replying, setReplying] = createSignal<string | null>(null)
  const [showAllRequests, setShowAllRequests] = createSignal(false)
  const [showAllAssets, setShowAllAssets] = createSignal(false)
  const [showAllEngagements, setShowAllEngagements] = createSignal(false)
  const [showAllCoverage, setShowAllCoverage] = createSignal(false)
  const MAX_VISIBLE = 10

  // One consolidated read model replaces four separate proxy round-trips.
  // The backend fans out to the four beacon endpoints concurrently and
  // projects them with per-section degradation metadata.
  const model = useQuery(() => ({
    queryKey: ['press-overview', props.slug],
    queryFn: () => api.pressOverview(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const requests = () => model.data?.requests?.requests ?? []
  const assets = () => model.data?.assets?.assets ?? []
  const engagements = () => model.data?.engagements?.engagements ?? []
  const coverage = () => model.data?.coverage?.coverage ?? []

  const recordReply = async (beaconId: string, eventId: string, disposition: string) => {
    setReplying(`${beaconId}:${eventId}`)
    setError(null)
    try {
      await api.recordBeaconReply(props.slug, beaconId, {
        eventId,
        disposition,
        occurredAt: new Date().toISOString(),
      })
      // A recorded reply changes the engagement and the coverage it rolls up into.
      refreshQueries(['press-overview', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to record the reply'))
    } finally {
      setReplying(null)
    }
  }

  const resolveRequest = async (requestId: string) => {
    setResolving(requestId)
    setError(null)
    try {
      await api.resolveBeaconPressRequest(props.slug, requestId, { status: 'resolved' })
      refreshQueries(['press-overview', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to resolve press request'))
    } finally {
      setResolving(null)
    }
  }

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Press room</h3>
    </div>
    <p class="agent-section-intro">Press requests from beacons, press assets for distribution, event engagements, and earned media coverage.</p>
    <TabBar
      active={tab()}
      onChange={setTab}
      tabs={[
        { id: 'requests', label: 'Requests', count: () => requests().length },
        { id: 'assets', label: 'Assets', count: () => assets().length },
        { id: 'engagements', label: 'Engagements', count: () => engagements().length },
        { id: 'coverage', label: 'Coverage', count: () => coverage().length },
      ]}
    />

    <Show when={error()}>
      <div class="error-card">{error()}</div>
    </Show>

    <Show when={tab() === 'requests'}>
      <Show when={model.error}><div class="error-card">Press room unavailable: {errorMessage(model.error, 'Service unreachable')}</div></Show>
      <Show when={model.data} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={requests().length > 0} fallback={<EmptyState label="No press requests" hint="Press requests are outreach actions to media contacts. They appear here when the intelligence dispatches press pitches." />}>
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
                <For each={showAllRequests() ? requests() : requests().slice(0, MAX_VISIBLE)}>{(r) => (
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
          <Show when={requests().length > MAX_VISIBLE}>
            <button class="ghost" onClick={() => setShowAllRequests(s => !s)}>
              {showAllRequests() ? 'Show less' : `Show all (${requests().length})`}
            </button>
          </Show>
        </Show>
      </Show>
    </Show>

    <Show when={tab() === 'assets'}>
      <Show when={model.error}><div class="error-card">Press room unavailable: {errorMessage(model.error, 'Service unreachable')}</div></Show>
      <Show when={model.data} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={assets().length > 0} fallback={<EmptyState label="No press assets" hint="Press assets are media materials (photos, bios, EPKs) available for outreach. Upload them through the tenant content pipeline." />}>
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
                <For each={showAllAssets() ? assets() : assets().slice(0, MAX_VISIBLE)}>{(a) => (
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
          <Show when={assets().length > MAX_VISIBLE}>
            <button class="ghost" onClick={() => setShowAllAssets(s => !s)}>
              {showAllAssets() ? 'Show less' : `Show all (${assets().length})`}
            </button>
          </Show>
        </Show>
      </Show>
    </Show>

    <Show when={tab() === 'engagements'}>
      <Show when={model.error}><div class="error-card">Press room unavailable: {errorMessage(model.error, 'Service unreachable')}</div></Show>
      <Show when={model.data} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={engagements().length > 0} fallback={<EmptyState label="No event engagements" hint="Event engagements track press interactions for specific shows and releases." />}>
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
                  <th>Reply</th>
                </tr>
              </thead>
              <tbody>
                <For each={showAllEngagements() ? engagements() : engagements().slice(0, MAX_VISIBLE)}>{(e) => (
                  <tr>
                    <td><strong>{e.displayName}</strong><br /><span class="muted">{e.beaconKind}</span></td>
                    <td>{e.eventTitle}</td>
                    <td><span class={`badge tone-${statusTone(e.status)}`}>{e.status}</span></td>
                    <td>{e.helpKind ?? '—'}</td>
                    <td>{e.notificationCount}</td>
                    <td>{e.coverageCount}</td>
                    <td>{formatTimestamp(e.updatedAt)}</td>
                    {/* The write endpoint existed and nothing called it, so a
                        beacon who declined twice looked the same as one who
                        had never been asked. This row has both ids the reply
                        needs, so it is where the answer gets written down. */}
                    <td>
                      <label class="engagement-reply">
                        <span class="visually-hidden">Reply from {e.displayName} about {e.eventTitle}</span>
                        <select
                          disabled={replying() === `${e.beaconId}:${e.eventId}`}
                          value=""
                          onChange={(event) => {
                            const disposition = event.currentTarget.value
                            event.currentTarget.value = ''
                            if (disposition) void recordReply(e.beaconId, e.eventId, disposition)
                          }}
                        >
                          <option value="">Record…</option>
                          <For each={REPLY_DISPOSITIONS}>{option =>
                            <option value={option.value}>{option.label}</option>
                          }</For>
                        </select>
                      </label>
                    </td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
          <Show when={engagements().length > MAX_VISIBLE}>
            <button class="ghost" onClick={() => setShowAllEngagements(s => !s)}>
              {showAllEngagements() ? 'Show less' : `Show all (${engagements().length})`}
            </button>
          </Show>
        </Show>
      </Show>
    </Show>

    <Show when={tab() === 'coverage'}>
      <Show when={model.error}><div class="error-card">Press room unavailable: {errorMessage(model.error, 'Service unreachable')}</div></Show>
      <Show when={model.data} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={coverage().length > 0} fallback={<EmptyState label="No earned media coverage" hint="Earned media coverage tracks press mentions and reviews. They appear here once the intelligence detects coverage." />}>
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
                <For each={showAllCoverage() ? coverage() : coverage().slice(0, MAX_VISIBLE)}>{(c) => (
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
          <Show when={coverage().length > MAX_VISIBLE}>
            <button class="ghost" onClick={() => setShowAllCoverage(s => !s)}>
              {showAllCoverage() ? 'Show less' : `Show all (${coverage().length})`}
            </button>
          </Show>
        </Show>
      </Show>
    </Show>
  </div>
}
