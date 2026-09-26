import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { ApiError, api } from '../lib/api'
import { authState } from '../lib/auth'
import { READ_ONLY_REASON, readOnly, writeGuard } from '../lib/read-only'
import { FileInput } from './ui/file-input'
import { buttonVariants } from './app/button'
import { cn } from '../lib/cn'
import { refreshQueries } from '../lib/refresh'
import { errorMessage } from '../lib/format'
import type { DriveContact, DriveSegmentCounts } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { ErrorCard, ShowMore, useShowMore } from './layout'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Checkbox } from './app/checkbox'
import { Spinner } from './Spinner'
import { SectionIcon } from './SectionIcon'
import { NativeSelect } from './ui/native-select'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Dialog } from './Dialog'

const KIND_LABELS: Record<string, string> = {
  fan: 'Fan',
  press: 'Press',
  radio: 'Radio',
  playlist: 'Playlist',
  media_patronage: 'Media patronage',
  endorsement: 'Endorsement',
  creator: 'Creator',
  organiser: 'Organiser',
  promoter: 'Promoter',
  booking_agent: 'Booking agent',
  talent_buyer: 'Talent buyer',
  agent: 'Agent',
  label: 'Label',
  venue: 'Venue',
  festival: 'Festival',
}

const BEACON_KINDS = ['press', 'radio', 'playlist', 'media_patronage', 'endorsement', 'creator', 'organiser', 'promoter', 'venue', 'festival', 'booking_agent', 'talent_buyer', 'agent', 'label'] as const
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
  upload: 'Uploaded sheet',
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

// The upstream segment vocabulary — order is the panel's, the names are
// the API's (`?segment=` values). `beacon` renders as "Press & venues"
// because that is what the kind means to the operator.
const SEGMENT_CHIPS: { value: string; label: string; count: (c: DriveSegmentCounts) => number }[] = [
  { value: 'likely_fan', label: 'Likely fans', count: c => c.likely_fan },
  { value: 'likely_org', label: 'Organisations', count: c => c.likely_org },
  { value: 'beacon', label: 'Press & venues', count: c => c.beacon },
  { value: 'inactive', label: 'Inactive', count: c => c.inactive },
  { value: 'gone', label: 'Gone', count: c => c.gone },
]

export function DriveContactsPanel(props: { slug: string }) {
  const [segment, setSegment] = createSignal<string | null>(null)
  // A scan lands rows asynchronously over tens of seconds — poll while the
  // window it opened is live, then stop. Polling forever, scan or not, was
  // the Contacts tab's idle cost. The timestamp is read in the options body
  // so arming the window re-evaluates the interval at once, and the interval
  // function re-checks the clock on every tick so it disarms itself.
  const [scanPollUntil, setScanPollUntil] = createSignal(0)
  const contacts = useQuery(() => {
    const until = scanPollUntil()
    return {
      queryKey: ['gdrive-contacts', props.slug, segment()],
      queryFn: () => api.gdriveContacts(props.slug, segment() ?? undefined),
      refetchOnWindowFocus: false,
      staleTime: 10_000,
      refetchInterval: () => (until > Date.now() ? 15_000 : false),
    }
  })

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
  // Promoting a selection is a real send — every staged address becomes a
  // pending fan and gets the double opt-in email. It goes through a review
  // step that names exactly who and what, never a bare confirm click.
  const [promoteReviewOpen, setPromoteReviewOpen] = createSignal(false)
  // The rows the review was opened on — `runBatch` clears `selected` when it
  // starts, so the dialog reads this snapshot, not the live selection.
  const [promoteReviewRows, setPromoteReviewRows] = createSignal<DriveContact[]>([])
  const [uploading, setUploading] = createSignal(false)
  // The promote-all dialog: the operator sees the live count, types the
  // one line the opt-in mail carries, and confirms. The count travels as
  // `expected_count` — the tenant re-counts and answers 409 on drift, so
  // a scan between render and click never widens the send.
  const [promoteAllOpen, setPromoteAllOpen] = createSignal(false)
  const [promoteAllReason, setPromoteAllReason] = createSignal('')
  const [promoteAllBusy, setPromoteAllBusy] = createSignal(false)

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
  // Up to 500 staged rows used to mount all at once — every row a card of
  // controls — which is why Contacts took seconds to paint. The first
  // screenful renders; selection still covers the whole staged set.
  const queue = createMemo(() => [...staged(), ...decided()])
  const showMore = useShowMore(queue, 15)
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

  // P.2 — the operator's own sheet is an intake source too. The CSV text
  // passes through; upstream parses, dedupes by email and stages.
  const uploadSheet = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    void (async () => {
      setUploading(true)
      setError(null)
      setNotice(null)
      try {
        const text = await file.text()
        const result = await api.uploadDriveContacts(props.slug, file.name, text)
        refreshQueries(['gdrive-contacts', props.slug])
        const skipped = result.rows_without_email > 0
          ? `, ${result.rows_without_email} row${result.rows_without_email === 1 ? '' : 's'} had no usable address`
          : ''
        setNotice(`Staged ${result.staged} contact${result.staged === 1 ? '' : 's'} from ${file.name}${skipped}.`)
      } catch (err) {
        setError(errorMessage(err, 'The upload did not land — the file stayed unchanged.'))
      } finally {
        setUploading(false)
      }
    })()
  }

  const scanNow = async () => {
    setScanning(true)
    setError(null)
    setNotice(null)
    try {
      await api.gdriveScan(props.slug)
      setScanPollUntil(Date.now() + 90_000)
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
        const result = await api.promoteDriveContact(props.slug, contact.id, destination, kind, city)
        setNotice(destination === 'fan'
          ? (result.opt_in_emailed === false
            ? `${contact.email} is on the fan list — the opt-in email already left recently, so nothing new was sent.`
            : `${contact.email} is now a pending fan — the double opt-in email is on its way.`)
          : BOOKING_KINDS.has(kind ?? '')
            ? (authState.isPlatformLevel()
              ? `${contact.email} joined the booking queue — confirm it under booking supply to make it a target.`
              : `${contact.email} joined the booking list — confirm it under Booking to make it a target.`)
            : `${contact.email} joined the ${authState.isPlatformLevel() ? 'outreach queue' : 'outreach list'} as ${KIND_LABELS[kind ?? 'press'] ?? kind}.`)
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

  // `confirmed` is the review dialog's path: it already asked, so arming the
  // button a second time would only stall the run it just approved. The
  // inline dismiss keeps its two-click arm.
  const runBatch = async (mode: 'fans' | 'dismiss', confirmed = false) => {
    if (!confirmed && batchConfirm() !== mode) {
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

  // Segment-wide fan promotion — one upstream call, one transaction. The
  // hand-picked loop above stays for selections; this path is for the whole
  // likely-fan cut and is the only way a count in the hundreds is sane.
  const promoteAll = async () => {
    const counts = contacts.data?.segment_counts
    if (!counts) return
    const expected = counts.likely_fan
    setPromoteAllBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await api.promoteDriveContactsBatch(
        props.slug,
        'likely_fan',
        expected,
        promoteAllReason(),
      )
      setPromoteAllOpen(false)
      setPromoteAllReason('')
      setSelected(new Set<string>())
      refreshQueries(['gdrive-contacts', props.slug])
      // The counters are the tenant's own — verbatim, never rounded into
      // one "N promoted" that would hide the suppressed and the cooldowns.
      const parts = [
        `${result.imported_pending} pending`,
        result.confirmation_resent > 0 ? `${result.confirmation_resent} re-sent` : null,
        result.already_active > 0 ? `${result.already_active} already fans` : null,
        result.skipped_suppressed > 0 ? `${result.skipped_suppressed} suppressed` : null,
        result.cooldown_skipped > 0 ? `${result.cooldown_skipped} in cooldown` : null,
      ].filter((p): p is string => p !== null)
      setNotice(`Promoted ${result.promoted} contact${result.promoted === 1 ? '' : 's'} — ${parts.join(', ')}. The double opt-in emails are on their way.`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The segment moved between render and click — show the live
        // numbers again instead of confirming a count that no longer is.
        setError(errorMessage(err, 'The segment changed since this count — confirm again.'))
        setPromoteAllOpen(false)
        void contacts.refetch()
      } else {
        setError(errorMessage(err, 'The batch promote did not land — nothing was marked.'))
      }
    } finally {
      setPromoteAllBusy(false)
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
            double opt-in email and confirm themselves) and/or to a {authState.isPlatformLevel() ? 'work queue' : 'work list'}: <strong>press, radio, playlist</strong>
            and friends go to outreach — organisers included, they get asked for a gig, not a review — <strong>venues, promoters, festivals</strong> go to {authState.isPlatformLevel() ? 'booking supply' : 'booking'}. One person
            can be both.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <label
            class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}
            classList={{ 'pointer-events-none opacity-45': uploading() || readOnly() }}
            title={readOnly() ? READ_ONLY_REASON : 'Upload a CSV or spreadsheet export — every row with an email address lands here staged, deduplicated.'}
          >
            {uploading() && <Spinner />} {uploading() ? 'Uploading…' : 'Upload a sheet'}
            <FileInput
              writes
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              disabled={uploading()}
              onChange={uploadSheet}
            />
          </label>
          <Button writes variant="outline" size="sm" disabled={scanning()} onClick={() => void scanNow()}>
            <Show when={scanning()}><Spinner /></Show> Scan now
          </Button>
        </div>
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
          {/* P.2 — the registry join, counted over the whole staging
              population upstream (the rendered page is capped). A stranger
              count of zero on a big sheet is the honest finding too. */}
          <Show when={contacts.data?.registry_summary}>
            {summary => (
              <p class="m-0 mt-3 text-xs text-muted-foreground">
                Of {summary().total} staged — <strong>{summary().known_venues} already in the venue registry</strong>
                <Show when={summary().own_rooms > 0}> ({summary().own_rooms} of them rooms the band already played)</Show>
                {' · '}<strong>{summary().known_counterparties} known counterparties</strong>
                <Show when={summary().dealt_with > 0}> ({summary().dealt_with} the band has worked with)</Show>.
              </p>
            )}
          </Show>
          {/* Segment chips — counted over the whole staging population
              upstream, never inferred from the capped page. A null
              segment_counts means the count pass failed; chips still
              filter, but the promote-all path below stays closed because
              there is no number to confirm. */}
          <Show when={contacts.data?.segment_counts} keyed>
            {counts => (
              <div class="mt-3 flex items-center gap-1.5 flex-wrap" role="group" aria-label="Contact segments">
                <Button
                  size="xs"
                  variant={segment() === null ? 'default' : 'outline'}
                  onClick={() => setSegment(null)}
                >
                  All
                </Button>
                <For each={SEGMENT_CHIPS}>
                  {chip => (
                    <Button
                      size="xs"
                      variant={segment() === chip.value ? 'default' : 'outline'}
                      onClick={() => setSegment(segment() === chip.value ? null : chip.value)}
                    >
                      {chip.label} · {chip.count(counts)}
                    </Button>
                  )}
                </For>
              </div>
            )}
          </Show>
          {/* One click, one transaction: the whole likely-fan cut becomes
              pending fans. The dialog makes the operator confirm the exact
              number upstream will re-check — a count that drifted is a 409,
              not a wider send. */}
          <Show when={segment() === 'likely_fan' && (contacts.data?.segment_counts?.likely_fan ?? 0) > 0}>
            <div class="mt-3 flex items-center gap-2">
              <Button
                writes
                size="sm"
                disabled={contacts.data?.segment_counts == null || promoteAllBusy()}
                onClick={() => setPromoteAllOpen(true)}
              >
                <Show when={promoteAllBusy()}><Spinner /></Show>
                Promote all {contacts.data?.segment_counts?.likely_fan} likely fans
              </Button>
              <span class="text-xs text-muted-foreground">Every one gets the double opt-in email — they confirm themselves.</span>
            </div>
          </Show>
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
                  variant="outline"
                  disabled={selectedFanStaged().length === 0 || batchProgress() !== null || busy() !== null}
                  title="Review the selection, then every staged address becomes a pending fan and gets the double opt-in email"
                  onClick={() => { setPromoteReviewRows(selectedFanStaged()); setPromoteReviewOpen(true) }}
                >
                  Review & make fans ({selectedFanStaged().length})
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
            <For each={showMore.visible()}>
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
            <ShowMore
              hidden={showMore.hidden()}
              expanded={showMore.expanded()}
              onToggle={showMore.toggle}
              noun="contacts"
            />
          </div>
        </Show>
      </Show>

      {/* Selected batch — review first, promote second. The list names the
          addresses the send will reach so a stray tick cannot hide behind a
          count. */}
      <Dialog
        open={promoteReviewOpen()}
        onClose={() => { if (batchProgress() === null) setPromoteReviewOpen(false) }}
        label="Review before promoting"
        title={`Make ${promoteReviewRows().length} contact${promoteReviewRows().length === 1 ? '' : 's'} fans`}
        description="Each address becomes a pending fan and gets the double opt-in email — nobody is subscribed without confirming. Addresses that lost their staged state since the selection are skipped."
        footer={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPromoteReviewOpen(false)} disabled={batchProgress() !== null}>
              Cancel
            </Button>
            <Button
              writes
              type="button"
              size="sm"
              disabled={promoteReviewRows().length === 0 || batchProgress() !== null}
              onClick={() => void runBatch('fans', true).then(() => setPromoteReviewOpen(false))}
            >
              <Show when={batchProgress() !== null}><Spinner /></Show>
              {batchProgress() ? `Promoting ${batchProgress()!.done}/${batchProgress()!.total}` : `Promote ${promoteReviewRows().length}`}
            </Button>
          </>
        }
      >
        <ul class="m-0 max-h-56 list-none overflow-y-auto p-0">
          <For each={promoteReviewRows().slice(0, 12)}>{contact => (
            <li class="truncate border-b border-border/50 py-1.5 text-sm text-secondary-foreground last:border-0">
              {contact.email ?? contact.display_name ?? contact.id}
            </li>
          )}</For>
          <Show when={promoteReviewRows().length > 12}>
            <li class="py-1.5 text-xs text-muted-foreground">…and {promoteReviewRows().length - 12} more</li>
          </Show>
        </ul>
      </Dialog>

      <Dialog
        open={promoteAllOpen()}
        onClose={() => setPromoteAllOpen(false)}
        label="Promote likely fans"
        title={`Promote ${contacts.data?.segment_counts?.likely_fan ?? 0} likely fans`}
        description="Each address becomes a pending fan and gets the double opt-in email — nobody is subscribed without confirming. Suppressed addresses are skipped and stay staged."
        footer={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPromoteAllOpen(false)} disabled={promoteAllBusy()}>
              Cancel
            </Button>
            <Button
              writes
              type="button"
              size="sm"
              disabled={promoteAllBusy() || contacts.data?.segment_counts == null}
              onClick={() => void promoteAll()}
            >
              <Show when={promoteAllBusy()}><Spinner /></Show>
              Confirm {contacts.data?.segment_counts?.likely_fan ?? 0}
            </Button>
          </>
        }
      >
        <label class="block text-xs font-medium text-muted-foreground" for="promote-all-reason">
          One line for the opt-in email — why they're hearing from you (optional)
        </label>
        <Textarea
          id="promote-all-reason"
          class="mt-1.5"
          rows={2}
          maxLength={200}
          value={promoteAllReason()}
          onInput={e => setPromoteAllReason(e.currentTarget.value)}
          placeholder="Moving our contact list to Signal — confirm if you still want to hear from us"
        />
      </Dialog>
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
            <Show when={props.contact.matched_venue}>
              <Badge variant="muted" title="The venue registry already knows this organisation">
                On the books: {props.contact.matched_venue}
              </Badge>
            </Show>
            <Show when={props.contact.venue_played_here}>
              <Badge variant="success" title="The band's own marks say they already played this room">Played here</Badge>
            </Show>
            <Show when={props.contact.matched_counterparty}>
              <Badge variant="muted" title="The counterparty registry already knows this address">
                Known: {props.contact.matched_counterparty}
              </Badge>
            </Show>
            <Show when={props.contact.counterparty_worked_with}>
              <Badge variant="success" title="The band's own marks say they already dealt with them">Worked together</Badge>
            </Show>
            <Show when={props.contact.counterparty_prior && props.contact.counterparty_prior.tenants_contacted > 0 ? props.contact.counterparty_prior : null}>
              {prior => (
                <Badge
                  variant="muted"
                  title="Anonymous counts across every tenant — this address's reply record on the platform"
                >
                  {`${prior().tenants_contacted} wrote · ${prior().tenants_replied} answered${prior().tenants_won > 0 ? ` · ${prior().tenants_won} won` : ''}`}
                </Badge>
              )}
            </Show>
            <Show when={props.contact.venue_prior && props.contact.venue_prior.tenants_played > 0 ? props.contact.venue_prior : null}>
              {prior => (
                <Badge
                  variant="muted"
                  title="Anonymous counts across every tenant — the room's play record on the registry"
                >
                  {`${prior().tenants_played} played · ${prior().shows} show${prior().shows === 1 ? '' : 's'}`}
                </Badge>
              )}
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
                  ? (authState.isPlatformLevel()
                    ? 'Files them as a booking candidate — confirm under booking supply to make them a target'
                    : 'Files them as a booking candidate — confirm under Booking to make them a target')
                  : (authState.isPlatformLevel()
                    ? 'Adds them to the outreach screening queue'
                    : 'Adds them to outreach screening')}
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
