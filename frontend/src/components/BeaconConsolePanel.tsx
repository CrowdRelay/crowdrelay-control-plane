import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage, formatTimestamp, relativeTime } from '../lib/format'
import { refreshQueries } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { SkeletonPanel } from './Skeleton'
import { Spinner } from './Spinner'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { NativeSelect } from './ui/native-select'
import { buttonVariants } from './ui/button'
import { cn } from '../lib/cn'
import { EmptyState } from './ui/empty-state'

// The beacon roster, and everything you can do to it.
//
// Beacons are the local-growth surface: people in a city who carry a release or
// a show to an audience the band does not own. Six read endpoints were exposed
// and not a single write, so the roster could be watched and never changed —
// no adding a beacon, no inviting one, no recording that somebody replied.
// Every beacon had to be created by hand against the tenant's admin API.
//
// One place, not scattered panels: the list you search is the list you select
// from, and the actions operate on that selection. Bulk invite is the reason
// this exists — inviting a city's worth of beacons one form at a time is how
// it does not get done.

const KINDS = ['venue', 'promoter', 'shop', 'radio', 'zine', 'collective', 'other'] as const
// The picker printed the stored enum values, so the operator chose between
// seven lowercase words with no hint at what each one covers.
const KIND_LABEL: Record<(typeof KINDS)[number], string> = {
  venue: 'Venue — a room that books shows',
  promoter: 'Promoter — books or puts on the show',
  shop: 'Shop — record store, merch counter',
  radio: 'Radio — station, show or DJ',
  zine: 'Zine — blog, magazine, reviewer',
  collective: 'Collective — crew, label, scene group',
  other: 'Other',
}

const STATE_TONE: Record<string, 'good' | 'warn' | 'bad' | 'muted'> = {
  active: 'good',
  invited: 'warn',
  paused: 'muted',
  revoked: 'bad',
  unverified: 'muted',
}

const EMPTY_FORM = {
  displayName: '',
  beaconKind: 'venue',
  contactEmail: '',
  citySlug: '',
  destinationUrl: '',
}

export function BeaconConsolePanel(props: { slug: string }) {
  const roster = useQuery(() => ({
    queryKey: ['beacon-console-roster', props.slug],
    queryFn: () => api.beaconSignalDashboard(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  // Only for the researched-contact count. A button that cannot say how many
  // contacts it will bring over is a dare: press it and find out.
  const network = useQuery(() => ({
    queryKey: ['beacon-console-network', props.slug],
    queryFn: () => api.beaconNetwork(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const [query, setQuery] = createSignal('')
  const [statusFilter, setStatusFilter] = createSignal<string>('all')
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [busy, setBusy] = createSignal<string | null>(null)
  const [notice, setNotice] = createSignal<{ tone: 'good' | 'bad'; message: string } | null>(null)
  const [adding, setAdding] = createSignal(false)
  const [form, setForm] = createSignal({ ...EMPTY_FORM })
  // Pagination — only controls what is rendered, not what is selected.
  // "Select all N shown" selects the full filtered set so bulk invite still
  // reaches every matching beacon, even those not yet rendered.
  const MAX_VISIBLE = 10
  const [showAll, setShowAll] = createSignal(false)

  const profiles = () => roster.data?.profiles ?? []

  const visible = createMemo(() => {
    const needle = query().trim().toLowerCase()
    const status = statusFilter()
    return profiles().filter(profile => {
      if (status !== 'all' && profile.status !== status) return false
      if (!needle) return true
      // City and email matter as much as the name: the operator is usually
      // asking "who do we have in Kraków", not "where is this one person".
      return `${profile.displayName} ${profile.city ?? ''} ${profile.contactEmail ?? ''} ${profile.beaconKind}`
        .toLowerCase()
        .includes(needle)
    })
  })

  // Reset pagination when search or filter changes — a new filter should
  // start from the top, not from page 3 of the previous filter.
  const onSearch = (value: string) => { setQuery(value); setShowAll(false) }
  const onFilter = (value: string) => { setStatusFilter(value); setShowAll(false) }

  // Only the first `MAX_VISIBLE` rows are rendered unless expanded. The full
  // `visible()` set is used for selection and the "show all" count.
  const rendered = createMemo(() => showAll() ? visible() : visible().slice(0, MAX_VISIBLE))

  const toggle = (beaconId: string) => {
    const next = new Set(selected())
    if (next.has(beaconId)) next.delete(beaconId)
    else next.add(beaconId)
    setSelected(next)
  }

  // Selects what is currently visible, not the whole roster — selecting rows
  // hidden by a filter is how the wrong people get invited.
  const selectAllVisible = () => {
    const shown = visible().map(profile => profile.beaconId)
    const allShown = shown.every(id => selected().has(id))
    setSelected(allShown ? new Set<string>() : new Set<string>(shown))
  }

  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    if (busy() !== null) return
    setBusy(key)
    setNotice(null)
    try {
      await run()
      setNotice({ tone: 'good', message: done })
      await roster.refetch()
      refreshQueries(['beacon-console-network', props.slug])
    } catch (error) {
      setNotice({ tone: 'bad', message: errorMessage(error, 'That did not work') })
    } finally {
      setBusy(null)
    }
  }

  // Researched contacts land unverified, so this queues names for review
  // rather than adding people who can be emailed. That is the whole reason it
  // is safe as a single button with no confirmation.
  const importResearched = () => {
    const waiting = network.data?.researchedAvailable ?? 0
    if (waiting === 0) return
    void act(
      'import',
      async () => {
        const result = await api.importResearchedBeacons(props.slug)
        await network.refetch()
        return result
      },
      `Imported researched contacts. They are unverified — approve them before inviting.`,
    )
  }

  const importSubmithub = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    void act(
      'submithub',
      async () => {
        const text = await file.text()
        const result = await api.importSubmithubCsv(props.slug, text)
        await network.refetch()
        return result
      },
      `Imported SubmitHub curators. They are unverified — enrich contact info from the chats, then approve.`,
    ).then(() => { input.value = '' })
  }

  const inviteSelected = () => {
    const ids = [...selected()]
    if (ids.length === 0) return
    void act(
      'invite',
      () => api.batchInviteBeacons(props.slug, ids),
      `Invited ${ids.length} beacon${ids.length === 1 ? '' : 's'}.`,
    ).then(() => setSelected(new Set<string>()))
  }

  const setState = (beaconId: string, status: 'active' | 'paused' | 'revoked') =>
    void act(`state:${beaconId}`, () => api.setBeaconState(props.slug, beaconId, status), `Beacon ${status}.`)

  const addBeacon = (event: Event) => {
    event.preventDefault()
    const values = form()
    void act(
      'add',
      () =>
        api.upsertBeacon(props.slug, {
          displayName: values.displayName.trim(),
          beaconKind: values.beaconKind,
          contactEmail: values.contactEmail.trim() || undefined,
          citySlug: values.citySlug.trim() || undefined,
          destinationUrl: values.destinationUrl.trim() || undefined,
          // Sensible defaults for a hand-added beacon: real, reachable, and
          // unproven. Relationship and relevance start neutral and are earned.
          active: true,
          verified: true,
          acceptsOutreach: true,
          doNotContact: false,
          relationshipScore: 50,
          relevanceBasisPoints: 7_500,
          confidenceBasisPoints: 7_500,
        }),
      `Added ${values.displayName.trim()}.`,
    ).then(() => {
      setForm({ ...EMPTY_FORM })
      setAdding(false)
    })
  }

  return (
    <Card flat class="p-4">
      <header class="flex items-center justify-between gap-4 mb-3">
        <h2 class="text-lg font-semibold text-foreground">Beacons</h2>
        <div class="flex items-center gap-2">
          <Show when={roster.data}>
            <span class="text-muted-foreground">
              {roster.data!.total} total · {roster.data!.active} active · {roster.data!.invited} invited
            </span>
          </Show>
          <Show when={roster.dataUpdatedAt}><span class="text-xs text-muted-foreground">Updated {relativeTime(roster.dataUpdatedAt)}</span></Show>
          <Show when={(network.data?.researchedAvailable ?? 0) > 0}>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy() !== null}
              onClick={importResearched}
              title="Adds researched contacts to the roster as unverified. Approve them before inviting."
            >
              {busy() === 'import' && <Spinner />} {busy() === 'import'
                ? 'Importing…'
                : `Import ${network.data!.researchedAvailable} researched`}
            </Button>
          </Show>
          <label
            class={cn(buttonVariants({ variant: 'ghost' }), 'cursor-pointer')}
            classList={{ 'pointer-events-none opacity-45': busy() !== null }}
            title="Upload a SubmitHub Activity CSV. Curators who approved or shared become unverified beacons — enrich contact info from the chats, then approve."
          >
            {busy() === 'submithub' && <Spinner />} {busy() === 'submithub' ? 'Importing…' : 'Import SubmitHub CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              disabled={busy() !== null}
              onChange={importSubmithub}
            />
          </label>
          <Button variant={adding() ? 'ghost' : 'default'} size="sm" onClick={() => setAdding(value => !value)}>
            {adding() ? 'Cancel' : 'Add beacon'}
          </Button>
        </div>
      </header>

      <Show when={roster.isPending}><SkeletonPanel /></Show>
      <Show when={roster.error}>
        <p class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Could not load the roster: {errorMessage(roster.error, 'We couldn\'t load the beacon roster. Try refreshing.')}</p>
      </Show>

      <Show when={adding()}>
        <form class="grid grid-cols-1 md:grid-cols-2 gap-3.5 rounded-lg border border-border bg-card p-4" onSubmit={addBeacon}>
          <label class="grid gap-1.75 text-muted-foreground text-sm">
            Name <small class="text-xs text-muted-foreground">venue, shop or person</small>
            <Input value={form().displayName} required maxlength={200}
                   onInput={e => setForm({ ...form(), displayName: e.currentTarget.value })} />
          </label>
          <label class="grid gap-1.75 text-muted-foreground text-sm">
            Kind <small class="text-xs text-muted-foreground">what they are to the band, not their job title</small>
            <NativeSelect value={form().beaconKind}
                    onChange={e => setForm({ ...form(), beaconKind: e.currentTarget.value })}>
              <For each={KINDS}>{kind => <option value={kind}>{KIND_LABEL[kind]}</option>}</For>
            </NativeSelect>
          </label>
          <label class="grid gap-1.75 text-muted-foreground text-sm">
            City slug <small class="text-xs text-muted-foreground">as the public city list returns it</small>
            <Input value={form().citySlug} maxlength={100}
                   onInput={e => setForm({ ...form(), citySlug: e.currentTarget.value })} />
          </label>
          <label class="grid gap-1.75 text-muted-foreground text-sm">
            Contact email <small class="text-xs text-muted-foreground">needed before they can be invited</small>
            <Input type="email" value={form().contactEmail} maxlength={320}
                   onInput={e => setForm({ ...form(), contactEmail: e.currentTarget.value })} />
          </label>
          <div class="flex gap-2 justify-end mt-5 md:col-span-2">
            <Button size="sm" type="submit" disabled={busy() !== null || !form().displayName.trim()}>
              {busy() === 'add' && <Spinner />} {busy() === 'add' ? 'Adding…' : 'Add beacon'}
            </Button>
          </div>
        </form>
      </Show>

      <Show when={roster.data}>
        {/* An empty roster was still shown a search box, a state filter, a
            "Select all 0 filtered" and an "Invite 0 to Signal" — four dead
            controls above the sentence telling the operator to add their first
            beacon. Nothing to search until there is something to search. */}
        <Show when={profiles().length > 0}>
        <div class="flex gap-2.5 items-center flex-wrap my-3.5">
          {/* Placeholder text disappears the moment you type, so it is not a
              name: the field announced itself as "edit text" to a screen
              reader. Same for the filter beside it. */}
          <Input
            class="flex-1 min-w-[200px]"
            type="search"
            aria-label="Search beacons"
            placeholder="Search name, city, email or kind…"
            value={query()}
            onInput={event => onSearch(event.currentTarget.value)}
          />
          <NativeSelect aria-label="Filter beacons by state" value={statusFilter()} onChange={event => onFilter(event.currentTarget.value)}>
            <option value="all">All states</option>
            <option value="unverified">Unverified</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="paused">Paused</option>
            <option value="revoked">Revoked</option>
          </NativeSelect>
          <Button variant="ghost" size="sm" onClick={selectAllVisible} disabled={visible().length === 0}>
            {visible().every(p => selected().has(p.beaconId)) && visible().length > 0
              ? 'Clear selection'
              : `Select all ${visible().length} filtered`}
          </Button>
          <Button
            size="sm"
            disabled={selected().size === 0 || busy() !== null}
            onClick={inviteSelected}
          >
            {busy() === 'invite' && <Spinner />} {busy() === 'invite' ? 'Inviting…' : `Invite ${selected().size} to Signal`}
          </Button>
        </div>
        </Show>

        {/* Having no beacons yet is a starting position, not a fault, and the
            amber warning panel it used to render said otherwise. */}
        <Show
          when={visible().length > 0}
          fallback={
            <Show
              when={profiles().length === 0}
              fallback={<EmptyState label="No beacon matches that search" hint="Search covers name, city, email and kind." />}
            >
              <EmptyState
                label="No beacons yet"
                hint="Local growth needs people on the ground. Add the venues, shops and promoters the band already knows, then invite them to Signal."
              />
            </Show>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-8" />
                <TableHead>Beacon</TableHead>
                <TableHead class="w-24">Status</TableHead>
                <TableHead class="w-20 text-center">Invites</TableHead>
                <TableHead class="w-32">Last invited</TableHead>
                <TableHead class="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={rendered()}>
                {profile => (
                  <TableRow classList={{ 'bg-primary/5': selected().has(profile.beaconId) }}>
                    <TableCell>
                      <input
                        type="checkbox"
                        class="accent-primary w-4 h-4"
                        checked={selected().has(profile.beaconId)}
                        onChange={() => toggle(profile.beaconId)}
                        aria-label={`Select ${profile.displayName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div class="flex flex-col gap-0.5">
                        <strong class="text-sm text-foreground">{profile.displayName}</strong>
                        <span class="text-xs text-muted-foreground truncate">
                          {profile.beaconKind}
                          {profile.city ? ` · ${profile.city}` : ''}
                          {profile.contactEmail ? ` · ${profile.contactEmail}` : ' · no email'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={profile.status} tone={STATE_TONE[profile.status] ?? 'muted'} />
                    </TableCell>
                    <TableCell class="text-center tabular-nums">{profile.inviteCount}</TableCell>
                    <TableCell>
                      <Show when={profile.lastInvitedAt} fallback={<span class="text-muted-foreground">—</span>}>
                        {at => <span class="text-xs text-muted-foreground">{formatTimestamp(at())}</span>}
                      </Show>
                    </TableCell>
                    <TableCell>
                      <div class="flex gap-1.5 justify-end">
                        <Show when={profile.status !== 'unverified' && profile.status !== 'paused' && profile.status !== 'revoked'}>
                          <Button variant="ghost" size="sm" disabled={busy() !== null}
                                  onClick={() => setState(profile.beaconId, 'paused')}>
                            {busy() === `state:${profile.beaconId}` && <Spinner />} Pause
                          </Button>
                        </Show>
                        <Show when={profile.status === 'paused'}>
                          <Button variant="ghost" size="sm" disabled={busy() !== null}
                                  onClick={() => setState(profile.beaconId, 'active')}>
                            {busy() === `state:${profile.beaconId}` && <Spinner />} Resume
                          </Button>
                        </Show>
                        <Show when={profile.status !== 'unverified' && profile.status !== 'revoked'}>
                          <Button variant="destructive-ghost" size="sm" disabled={busy() !== null}
                                  onClick={() => setState(profile.beaconId, 'revoked')}>
                            {busy() === `state:${profile.beaconId}` && <Spinner />} Revoke
                          </Button>
                        </Show>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </For>
            </TableBody>
          </Table>
          <Show when={visible().length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAll(s => !s)}>
              {showAll() ? 'Show less' : `Show all (${visible().length})`}
            </Button>
          </Show>
        </Show>
      </Show>

      <Show when={notice()}>
        {value => <p class="rounded-lg border p-4 text-sm" classList={{
          'border-success/30 bg-success/10 text-success': value().tone === 'good',
          'border-destructive/30 bg-destructive/10 text-destructive': value().tone === 'bad',
        }}>{value().message}</p>}
      </Show>
    </Card>
  )
}
