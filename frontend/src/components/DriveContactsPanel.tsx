import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { writeGuard } from '../lib/read-only'
import { refreshQueries } from '../lib/refresh'
import { errorMessage } from '../lib/format'
import type { DriveContact } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { ErrorCard } from './layout'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Checkbox } from './app/checkbox'
import { Spinner } from './Spinner'
import { SectionIcon } from './SectionIcon'
import { NativeSelect } from './ui/native-select'
import { Input } from './ui/input'

const KIND_LABELS: Record<string, string> = {
  fan: 'Fan',
  press: 'Press',
  radio: 'Radio',
  playlist: 'Playlist',
  media_patronage: 'Media patronage',
  endorsement: 'Endorsement',
  creator: 'Creator',
  promoter: 'Promoter',
  venue: 'Venue',
  festival: 'Festival',
}

const BEACON_KINDS = ['press', 'radio', 'playlist', 'media_patronage', 'endorsement', 'creator', 'promoter', 'venue', 'festival'] as const
const BEACON_KIND_SET: ReadonlySet<string> = new Set(BEACON_KINDS)
const BOOKING_KINDS: ReadonlySet<string> = new Set(['promoter', 'venue', 'festival'])

// The sheet's suggestion is a fan-side word too — "fan" is legal on the
// row but not a beacon kind, so a fan-typed contact defaults to press
// rather than rendering a select with no valid option.
const defaultBeaconKind = (contact: DriveContact): string =>
  contact.suggested_kind && BEACON_KIND_SET.has(contact.suggested_kind)
    ? contact.suggested_kind
    : 'press'

const SOURCE_LABELS: Record<string, string> = {
  gdrive: 'Drive',
  gmail: 'Gmail',
}

const outcomeBadge = (outcome: string) => {
  switch (outcome) {
    case 'promoted': return <Badge variant="success">Promoted</Badge>
    case 'dismissed': return <Badge variant="muted">Dismissed</Badge>
    default: return <Badge variant="warning">Waiting for review</Badge>
  }
}

const formatSeen = (iso: string) => {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return 'recently'
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function DriveContactsPanel(props: { slug: string }) {
  const contacts = useQuery(() => ({
    queryKey: ['gdrive-contacts', props.slug],
    queryFn: () => api.gdriveContacts(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A scan lands rows asynchronously — keep polling softly while any
    // contact is still staged so a Scan now click visibly fills the queue.
    refetchInterval: 15_000,
  }))

  const [error, setError] = createSignal<string | null>(null)
  const [notice, setNotice] = createSignal<string | null>(null)
  // `${id}:${destination}` — first click arms, second executes.
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const [busy, setBusy] = createSignal<string | null>(null)
  const [scanning, setScanning] = createSignal(false)
  const [beaconKind, setBeaconKind] = createSignal<Record<string, string>>({})
  const [beaconCity, setBeaconCity] = createSignal<Record<string, string>>({})
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set())
  const [batchConfirm, setBatchConfirm] = createSignal<'fans' | 'dismiss' | null>(null)
  const [batchProgress, setBatchProgress] = createSignal<{ done: number; total: number } | null>(null)

  const staged = createMemo(() =>
    (contacts.data?.contacts ?? []).filter(
      c => c.fan_outcome === 'staged' || c.beacon_outcome === 'staged',
    ),
  )
  const decided = createMemo(() =>
    (contacts.data?.contacts ?? []).filter(
      c => c.fan_outcome !== 'staged' && c.beacon_outcome !== 'staged',
    ),
  )
  // Selection only covers rows still staged — a contact whose scan landed
  // after the last fetch cannot sit selected invisibly.
  const selectable = createMemo(() => new Set(staged().map(c => c.id)))
  const selectedStaged = createMemo(() =>
    staged().filter(c => selected().has(c.id)),
  )
  const selectedFanStaged = createMemo(() =>
    selectedStaged().filter(c => c.fan_outcome === 'staged'),
  )
  const toggleSelect = (id: string, on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
    setBatchConfirm(null)
  }
  const toggleSelectAll = (on: boolean) => {
    setSelected(on ? new Set<string>(selectable()) : new Set<string>())
    setBatchConfirm(null)
  }

  const scanNow = async () => {
    setScanning(true)
    setError(null)
    setNotice(null)
    try {
      await api.gdriveScan(props.slug)
      setNotice('Scan requested — the sources scan runs in the background and new contacts appear here as it finds them.')
      void contacts.refetch()
    } catch (err) {
      setError(errorMessage(err, 'Could not request a scan'))
    } finally {
      setScanning(false)
    }
  }

  const act = async (contact: DriveContact, destination: 'fan' | 'beacon', verb: 'promote' | 'dismiss') => {
    const key = `${contact.id}:${destination}:${verb}`
    if (confirming() !== key) {
      setConfirming(key)
      return
    }
    setConfirming(null)
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      if (verb === 'promote') {
        const kind = destination === 'beacon'
          ? (beaconKind()[contact.id] ?? defaultBeaconKind(contact))
          : undefined
        const city = kind && BOOKING_KINDS.has(kind)
          ? (beaconCity()[contact.id]?.trim() || undefined)
          : undefined
        await api.promoteDriveContact(props.slug, contact.id, destination, kind, city)
        setNotice(destination === 'fan'
          ? `${contact.email} is now a pending fan — the double opt-in email is on its way.`
          : BOOKING_KINDS.has(kind ?? '')
            ? `${contact.email} joined the booking queue — confirm it under booking supply to make it a target.`
            : `${contact.email} joined the outreach queue as ${KIND_LABELS[kind ?? 'press'] ?? kind}.`)
      } else {
        await api.dismissDriveContact(props.slug, contact.id, destination)
      }
      refreshQueries(['gdrive-contacts', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'The decision could not be saved'))
    } finally {
      setBusy(null)
    }
  }

  const runBatch = async (mode: 'fans' | 'dismiss') => {
    if (batchConfirm() !== mode) {
      setBatchConfirm(mode)
      return
    }
    setBatchConfirm(null)
    // Snapshot the work list now — refetches during the loop must not add
    // or drop rows mid-run.
    const work = selectedStaged()
    setSelected(new Set<string>())
    setError(null)
    setNotice(null)
    // One row at a time: every promote/dismiss is its own confirmed decision
    // upstream, and a sequential run keeps failures attributable to a row.
    const steps: { contact: DriveContact; destination: 'fan' | 'beacon'; verb: 'promote' | 'dismiss' }[] = []
    for (const contact of work) {
      if (mode === 'fans') {
        if (contact.fan_outcome === 'staged') steps.push({ contact, destination: 'fan', verb: 'promote' })
      } else {
        if (contact.fan_outcome === 'staged') steps.push({ contact, destination: 'fan', verb: 'dismiss' })
        if (contact.beacon_outcome === 'staged') steps.push({ contact, destination: 'beacon', verb: 'dismiss' })
      }
    }
    setBatchProgress({ done: 0, total: steps.length })
    let failed = 0
    for (const step of steps) {
      try {
        if (step.verb === 'promote') {
          await api.promoteDriveContact(props.slug, step.contact.id, 'fan')
        } else {
          await api.dismissDriveContact(props.slug, step.contact.id, step.destination)
        }
      } catch {
        failed += 1
      }
      setBatchProgress(prev => prev && { done: prev.done + 1, total: prev.total })
    }
    setBatchProgress(null)
    refreshQueries(['gdrive-contacts', props.slug])
    if (failed === 0) {
      // In fans mode only fan-staged rows produce a step — `work` also
      // holds beacon-only contacts, which received no opt-in email, so the
      // notice counts the steps, not the selection.
      const count = mode === 'fans' ? steps.length : work.length
      setNotice(mode === 'fans'
        ? `${count} contact${count === 1 ? '' : 's'} promoted — the double opt-in emails are on their way.`
        : `Dismissed ${count} contact${count === 1 ? '' : 's'}.`)
    } else {
      setError(`${failed} of ${steps.length} actions failed — the rows that did not change are still staged.`)
    }
  }

  return (
    <section class="rounded-xl border border-border bg-card p-5">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <SectionIcon name="users" />
            <h3 class="m-0 text-sm font-semibold">Contacts</h3>
          </div>
          <p class="m-0 mt-1.5 text-xs leading-relaxed text-muted-foreground max-w-prose">
            Connected sources — Google Drive spreadsheets, Gmail — stage every address they find here, deduplicated
            by email. Nothing is classified automatically. Promote an address to a <strong>fan</strong> (they get the
            double opt-in email and confirm themselves) and/or to a work queue: <strong>press, radio, playlist</strong>
            and friends go to outreach, <strong>venues, promoters, festivals</strong> go to booking supply. One person
            can be both.
          </p>
        </div>
        <Button writes variant="outline" size="sm" disabled={scanning()} onClick={() => void scanNow()}>
          <Show when={scanning()}><Spinner /></Show> Scan now
        </Button>
      </div>

      <Show when={error()}><ErrorCard>{error()}</ErrorCard></Show>
      <Show when={notice()}>
        <div class="mt-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">{notice()}</div>
      </Show>

      <Show when={contacts.error}>
        <ErrorCard>{errorMessage(contacts.error, 'Drive contacts unavailable')}</ErrorCard>
      </Show>
      <Show when={!contacts.error && !contacts.data}>
        <SkeletonRows count={4} />
      </Show>

      <Show when={contacts.data}>
        <Show
          when={staged().length > 0 || decided().length > 0}
          fallback={
            <EmptyState
              label="No contacts staged yet"
              hint="Connect Google Drive or Gmail under Sources, then Scan now — every address they hold lands here for review."
            />
          }
        >
          <Show when={staged().length > 0}>
            <div class="mt-4 flex items-center gap-3 flex-wrap rounded-md border border-border/50 bg-background/40 px-3 py-2">
              <Checkbox
                checked={staged().length > 0 && selectedStaged().length === staged().length}
                onChange={on => toggleSelectAll(on)}
                label={`${selectedStaged().length} selected`}
              />
              <div class="flex items-center gap-1.5 ml-auto">
                <Button
                  writes
                  size="xs"
                  variant={batchConfirm() === 'fans' ? 'default' : 'outline'}
                  disabled={selectedFanStaged().length === 0 || batchProgress() !== null || busy() !== null}
                  title="Every selected contact becomes a pending fan and gets the double opt-in email"
                  onClick={() => void runBatch('fans')}
                >
                  {batchConfirm() === 'fans' ? `Confirm ${selectedFanStaged().length}` : `Make fans (${selectedFanStaged().length})`}
                </Button>
                <Button
                  writes
                  size="xs"
                  variant={batchConfirm() === 'dismiss' ? 'default' : 'ghost'}
                  disabled={selectedStaged().length === 0 || batchProgress() !== null || busy() !== null}
                  title="Dismisses every still-open decision on the selected contacts"
                  onClick={() => void runBatch('dismiss')}
                >
                  {batchConfirm() === 'dismiss' ? `Confirm ${selectedStaged().length}` : 'Dismiss'}
                </Button>
                <Show when={batchProgress()}>
                  {p => <span class="text-xs text-muted-foreground flex items-center gap-1.5"><Spinner /> {p().done}/{p().total}</span>}
                </Show>
              </div>
            </div>
          </Show>
          <div class="mt-4 flex flex-col gap-2.5">
            <For each={[...staged(), ...decided()]}>
              {contact => (
                <DriveContactRow
                  contact={contact}
                  confirming={confirming()}
                  busy={busy() ?? (batchProgress() ? 'batch' : null)}
                  selectable={selectable().has(contact.id)}
                  selected={selected().has(contact.id)}
                  onSelect={on => toggleSelect(contact.id, on)}
                  kind={beaconKind()[contact.id] ?? defaultBeaconKind(contact)}
                  city={beaconCity()[contact.id] ?? ''}
                  onKind={kind => setBeaconKind(k => ({ ...k, [contact.id]: kind }))}
                  onCity={city => setBeaconCity(c => ({ ...c, [contact.id]: city }))}
                  onAct={act}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}

function DriveContactRow(props: {
  contact: DriveContact
  confirming: string | null
  busy: string | null
  selectable: boolean
  selected: boolean
  onSelect: (on: boolean) => void
  kind: string
  city: string
  onKind: (kind: string) => void
  onCity: (city: string) => void
  onAct: (contact: DriveContact, destination: 'fan' | 'beacon', verb: 'promote' | 'dismiss') => void
}) {
  const key = (destination: 'fan' | 'beacon', verb: 'promote' | 'dismiss') =>
    `${props.contact.id}:${destination}:${verb}`
  const arm = (destination: 'fan' | 'beacon', verb: 'promote' | 'dismiss') =>
    props.confirming === key(destination, verb)

  return (
    <div class="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0 flex items-start gap-2.5">
          <Show when={props.selectable}>
            <Checkbox
              class="mt-0.5"
              checked={props.selected}
              onChange={on => props.onSelect(on)}
              title="Select for a batch action"
            />
          </Show>
          <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-medium">{props.contact.email}</span>
            <For each={props.contact.sources ?? []}>
              {source => <Badge variant="muted">{SOURCE_LABELS[source] ?? source}</Badge>}
            </For>
            <Show when={props.contact.suggested_kind}>
              <Badge variant="muted">{KIND_LABELS[props.contact.suggested_kind!] ?? props.contact.suggested_kind}</Badge>
            </Show>
            <Show when={props.contact.gone_from_source}>
              <Badge variant="warning">Gone from file</Badge>
            </Show>
          </div>
          <p class="m-0 mt-1 text-xs text-muted-foreground">
            {[props.contact.display_name, props.contact.organization, props.contact.city].filter(Boolean).join(' · ') || 'No name on file'}
            {' — '}{props.contact.source_file_name}, seen {formatSeen(props.contact.last_seen_at)}
          </p>
          <Show when={props.contact.notes}>
            <p class="m-0 mt-1 text-xs text-muted-foreground/80 italic">{props.contact.notes}</p>
          </Show>
          </div>
        </div>
      </div>

      <div class="mt-2.5 grid gap-2 sm:grid-cols-2">
        {/* Fan destination */}
        <div class="flex items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2">
          <div class="flex items-center gap-2 text-xs">
            <span class="text-muted-foreground">As fan</span>
            {outcomeBadge(props.contact.fan_outcome)}
          </div>
          <Show when={props.contact.fan_outcome === 'staged'}>
            <div class="flex items-center gap-1.5">
              <Button
                writes
                size="xs"
                variant={arm('fan', 'promote') ? 'default' : 'outline'}
                disabled={props.busy !== null}
                title="Adds them as a pending fan and sends the double opt-in email"
                onClick={() => props.onAct(props.contact, 'fan', 'promote')}
              >
                {props.busy === key('fan', 'promote') ? <Spinner /> : arm('fan', 'promote') ? 'Confirm fan' : 'Make fan'}
              </Button>
              <Button
                writes
                size="xs"
                variant="ghost"
                disabled={props.busy !== null}
                onClick={() => props.onAct(props.contact, 'fan', 'dismiss')}
              >
                {arm('fan', 'dismiss') ? 'Confirm dismiss' : 'Dismiss'}
              </Button>
            </div>
          </Show>
        </div>

        {/* Beacon destination */}
        <div class="flex items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2">
          <div class="flex items-center gap-2 text-xs">
            <span class="text-muted-foreground">As outreach contact</span>
            {outcomeBadge(props.contact.beacon_outcome)}
          </div>
          <Show when={props.contact.beacon_outcome === 'staged'}>
            <div class="flex items-center gap-1.5">
              <NativeSelect
                size="sm"
                class="w-auto"
                value={props.kind}
                onChange={e => props.onKind(e.currentTarget.value)}
                title="What kind of outreach contact this is"
                {...writeGuard()}
              >
                <For each={BEACON_KINDS}>
                  {k => <option value={k}>{KIND_LABELS[k]}</option>}
                </For>
              </NativeSelect>
              <Show when={BOOKING_KINDS.has(props.kind)}>
                <Input
                  class="w-28"
                  value={props.city}
                  onInput={e => props.onCity(e.currentTarget.value)}
                  placeholder={props.contact.city ? `Sheet says: ${props.contact.city}` : 'City — e.g. wroclaw'}
                  title={props.contact.city
                    ? `The sheet filed this contact in ${props.contact.city} — leave empty to use it, or type a city slug to override`
                    : 'Which city this contact books in — booking candidates are filed per city'}
                  {...writeGuard()}
                />
              </Show>
              <Button
                writes
                size="xs"
                variant={arm('beacon', 'promote') ? 'default' : 'outline'}
                disabled={props.busy !== null}
                title={BOOKING_KINDS.has(props.kind)
                  ? 'Files them as a booking candidate — confirm under booking supply to make them a target'
                  : 'Adds them to the outreach screening queue'}
                onClick={() => props.onAct(props.contact, 'beacon', 'promote')}
              >
                {props.busy === key('beacon', 'promote') ? <Spinner /> : arm('beacon', 'promote') ? 'Confirm add' : BOOKING_KINDS.has(props.kind) ? 'Add to booking' : 'Add to outreach'}
              </Button>
              <Button
                writes
                size="xs"
                variant="ghost"
                disabled={props.busy !== null}
                onClick={() => props.onAct(props.contact, 'beacon', 'dismiss')}
              >
                {arm('beacon', 'dismiss') ? 'Confirm dismiss' : 'Dismiss'}
              </Button>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
