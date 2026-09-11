import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { refreshQueries } from '../lib/refresh'
import { errorMessage, formatTimestamp, relativeTime } from '../lib/format'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { TabBar, ErrorCard } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { NativeSelect } from './ui/native-select'
import { Input } from './ui/input'

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
  const [adding, setAdding] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [draft, setDraft] = createSignal({
    assetKey: '',
    assetKind: 'photo',
    labelEn: '',
    labelPl: '',
    url: '',
  })
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

  const saveAsset = async () => {
    const input = draft()
    setSaving(true)
    setError(null)
    try {
      await api.upsertBeaconPressAsset(props.slug, {
        assetKey: input.assetKey.trim(),
        assetKind: input.assetKind,
        labelEn: input.labelEn.trim(),
        // The backend requires both labels. Falling back to the English one
        // keeps a single-language operator from having to type it twice.
        labelPl: (input.labelPl.trim() || input.labelEn.trim()),
        url: input.url.trim(),
      })
      setDraft({ assetKey: '', assetKind: 'photo', labelEn: '', labelPl: '', url: '' })
      setAdding(false)
      refreshQueries(['press-overview', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to save the press asset'))
    } finally {
      setSaving(false)
    }
  }

  // Enough to save: a key, a label, and an https URL Meta can fetch.
  const draftIsComplete = () => {
    const input = draft()
    return (
      /^[a-z][a-z0-9_-]{1,63}$/.test(input.assetKey.trim())
      && input.labelEn.trim().length > 0
      && /^https:\/\//.test(input.url.trim())
    )
  }

  return <Card flat class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3 class="text-sm font-semibold text-foreground">Press room</h3>
      <Show when={model.dataUpdatedAt}><span class="text-xs text-muted-foreground">Updated {relativeTime(model.dataUpdatedAt)}</span></Show>
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
      <ErrorCard>{error()}</ErrorCard>
    </Show>

    <Show when={tab() === 'requests'}>
      <Show when={model.error}><ErrorCard>Press room unavailable: {errorMessage(model.error, 'We couldn\'t reach the press room. Try refreshing.')}</ErrorCard></Show>
      <Show when={model.data} fallback={<SkeletonRows count={3} />}>
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
      <Show when={model.error}><ErrorCard>Press room unavailable: {errorMessage(model.error, 'We couldn\'t reach the press room. Try refreshing.')}</ErrorCard></Show>
      <div class="mb-3 flex items-center justify-between gap-4">
        <p class="text-sm text-muted-foreground">
          Photos and logos here are what Instagram posts use, least recently published first.
          With none active, every Instagram post is held.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setAdding(a => !a)}>
          {adding() ? 'Cancel' : 'Add asset'}
        </Button>
      </div>

      <Show when={adding()}>
        <form class="mb-4 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (draftIsComplete() && !saving()) saveAsset() }}>
          <Input
            placeholder="Key (band_photo_01)"
            value={draft().assetKey}
            onInput={(e) => setDraft(d => ({ ...d, assetKey: e.currentTarget.value }))}
          />
          <NativeSelect
            value={draft().assetKind}
            onChange={(e) => setDraft(d => ({ ...d, assetKind: e.currentTarget.value }))}
          >
            <option value="photo">photo</option>
            <option value="logo">logo</option>
            <option value="epk">epk</option>
            <option value="bio">bio</option>
            <option value="video">video</option>
          </NativeSelect>
          <Input
            placeholder="Label"
            value={draft().labelEn}
            onInput={(e) => setDraft(d => ({ ...d, labelEn: e.currentTarget.value }))}
          />
          <Input
            placeholder="Label (PL, optional)"
            value={draft().labelPl}
            onInput={(e) => setDraft(d => ({ ...d, labelPl: e.currentTarget.value }))}
          />
          <Input
            class="sm:col-span-2"
            placeholder="https://… (must be public — Meta fetches it)"
            value={draft().url}
            onInput={(e) => setDraft(d => ({ ...d, url: e.currentTarget.value }))}
          />
          <div class="sm:col-span-2">
            <Button type="submit" size="sm" disabled={!draftIsComplete() || saving()}>
              {saving() ? 'Saving…' : 'Save asset'}
            </Button>
          </div>
        </form>
      </Show>

      <Show when={model.data} fallback={<SkeletonRows count={3} />}>
        <Show when={assets().length > 0} fallback={<EmptyState label="No press assets" hint="Photos, logos, bios and EPKs for outreach. Instagram picks its image from the active photo and logo rows, so add at least one to publish there." />}>
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
      <Show when={model.error}><ErrorCard>Press room unavailable: {errorMessage(model.error, 'We couldn\'t reach the press room. Try refreshing.')}</ErrorCard></Show>
      <Show when={model.data} fallback={<SkeletonRows count={3} />}>
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
      <Show when={model.error}><ErrorCard>Press room unavailable: {errorMessage(model.error, 'We couldn\'t reach the press room. Try refreshing.')}</ErrorCard></Show>
      <Show when={model.data} fallback={<SkeletonRows count={3} />}>
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
