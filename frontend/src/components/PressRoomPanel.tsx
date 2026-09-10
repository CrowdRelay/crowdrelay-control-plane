import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { refreshQueries } from '../lib/refresh'
import { errorMessage, formatTimestamp } from '../lib/format'
import { EmptyState } from './ui/empty-state'
import { SkeletonBlock } from './Skeleton'
import { TabBar } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { NativeSelect } from './ui/native-select'

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (status) {
    case 'resolved': case 'fulfilled': return 'good'
    case 'pending': case 'open': return 'warn'
    case 'declined': case 'rejected': return 'bad'
    default: return 'muted'
  }
}

const toneToVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

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

  return <Card class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3 class="text-sm font-semibold text-foreground">Press room</h3>
    </div>
    <p class="mt-1 text-sm text-muted-foreground">Press requests from beacons, press assets for distribution, event engagements, and earned media coverage.</p>
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
      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error()}</div>
    </Show>

    <Show when={tab() === 'requests'}>
      <Show when={model.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Press room unavailable: {errorMessage(model.error, 'Service unreachable')}</div></Show>
      <Show when={model.data} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={requests().length > 0} fallback={<EmptyState label="No press requests" hint="Press requests are outreach actions to media contacts. They appear here when the intelligence dispatches press pitches." />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={showAllRequests() ? requests() : requests().slice(0, MAX_VISIBLE)}>{(r) => (
                <TableRow>
                  <TableCell><strong>{r.displayName}</strong><br /><span class="text-muted-foreground">{r.beaconKind}</span></TableCell>
                  <TableCell>{r.requestKind}</TableCell>
                  <TableCell>{r.eventTitle ?? '—'}</TableCell>
                  <TableCell><Badge variant={toneToVariant(statusTone(r.status))}>{r.status}</Badge></TableCell>
                  <TableCell>{formatTimestamp(r.createdAt)}</TableCell>
                  <TableCell>
                    <Show when={r.status === 'pending' || r.status === 'open'}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={resolving() === r.id}
                        onClick={() => resolveRequest(r.id)}
                      >{resolving() === r.id ? '…' : 'Resolve'}</Button>
                    </Show>
                  </TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
          <Show when={requests().length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" onClick={() => setShowAllRequests(s => !s)}>
              {showAllRequests() ? 'Show less' : `Show all (${requests().length})`}
            </Button>
          </Show>
        </Show>
      </Show>
    </Show>

    <Show when={tab() === 'assets'}>
      <Show when={model.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Press room unavailable: {errorMessage(model.error, 'Service unreachable')}</div></Show>
      <Show when={model.data} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={assets().length > 0} fallback={<EmptyState label="No press assets" hint="Press assets are media materials (photos, bios, EPKs) available for outreach. Upload them through the tenant content pipeline." />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={showAllAssets() ? assets() : assets().slice(0, MAX_VISIBLE)}>{(a) => (
                <TableRow>
                  <TableCell><strong>{a.labelEn}</strong><br /><span class="text-muted-foreground">{a.labelPl}</span></TableCell>
                  <TableCell>{a.assetKind}</TableCell>
                  <TableCell>{a.eventTitle ?? '—'}</TableCell>
                  <TableCell>{a.active ? '✓' : '—'}</TableCell>
                  <TableCell>{formatTimestamp(a.updatedAt)}</TableCell>
                  <TableCell><a href={a.url} target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-4 hover:underline">Open</a></TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
          <Show when={assets().length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" onClick={() => setShowAllAssets(s => !s)}>
              {showAllAssets() ? 'Show less' : `Show all (${assets().length})`}
            </Button>
          </Show>
        </Show>
      </Show>
    </Show>

    <Show when={tab() === 'engagements'}>
      <Show when={model.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Press room unavailable: {errorMessage(model.error, 'Service unreachable')}</div></Show>
      <Show when={model.data} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={engagements().length > 0} fallback={<EmptyState label="No event engagements" hint="Event engagements track press interactions for specific shows and releases." />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beacon</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Help</TableHead>
                <TableHead>Notifications</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Reply</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={showAllEngagements() ? engagements() : engagements().slice(0, MAX_VISIBLE)}>{(e) => (
                <TableRow>
                  <TableCell><strong>{e.displayName}</strong><br /><span class="text-muted-foreground">{e.beaconKind}</span></TableCell>
                  <TableCell>{e.eventTitle}</TableCell>
                  <TableCell><Badge variant={toneToVariant(statusTone(e.status))}>{e.status}</Badge></TableCell>
                  <TableCell>{e.helpKind ?? '—'}</TableCell>
                  <TableCell numeric>{e.notificationCount}</TableCell>
                  <TableCell numeric>{e.coverageCount}</TableCell>
                  <TableCell>{formatTimestamp(e.updatedAt)}</TableCell>
                  {/* The write endpoint existed and nothing called it, so a
                      beacon who declined twice looked the same as one who
                      had never been asked. This row has both ids the reply
                      needs, so it is where the answer gets written down. */}
                  <TableCell>
                    <label class="engagement-reply">
                      <span class="sr-only">Reply from {e.displayName} about {e.eventTitle}</span>
                      <NativeSelect disabled={replying() === `${e.beaconId}:${e.eventId}`}
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
                      </NativeSelect>
                    </label>
                  </TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
          <Show when={engagements().length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" onClick={() => setShowAllEngagements(s => !s)}>
              {showAllEngagements() ? 'Show less' : `Show all (${engagements().length})`}
            </Button>
          </Show>
        </Show>
      </Show>
    </Show>

    <Show when={tab() === 'coverage'}>
      <Show when={model.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Press room unavailable: {errorMessage(model.error, 'Service unreachable')}</div></Show>
      <Show when={model.data} fallback={<SkeletonBlock height="100px" radius="10px" />}>
        <Show when={coverage().length > 0} fallback={<EmptyState label="No earned media coverage" hint="Earned media coverage tracks press mentions and reviews. They appear here once the intelligence detects coverage." />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beacon</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={showAllCoverage() ? coverage() : coverage().slice(0, MAX_VISIBLE)}>{(c) => (
                <TableRow>
                  <TableCell><strong>{c.displayName}</strong></TableCell>
                  <TableCell>{c.eventTitle}</TableCell>
                  <TableCell>{c.coverageKind}</TableCell>
                  <TableCell>{c.title ?? '—'}</TableCell>
                  <TableCell>{formatTimestamp(c.createdAt)}</TableCell>
                  <TableCell><a href={c.url} target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-4 hover:underline">Open</a></TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
          <Show when={coverage().length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" onClick={() => setShowAllCoverage(s => !s)}>
              {showAllCoverage() ? 'Show less' : `Show all (${coverage().length})`}
            </Button>
          </Show>
        </Show>
      </Show>
    </Show>
  </Card>
}
