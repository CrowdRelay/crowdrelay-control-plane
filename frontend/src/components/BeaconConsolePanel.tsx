import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { BeaconProfileView } from '../lib/types'
import { beaconKindLabel, errorMessage, formatTimestamp, humanizeToken } from '../lib/format'
import { refreshQueries } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { SkeletonPanel } from './Skeleton'
import { Spinner } from './Spinner'
import { Button } from './app/button'
import { READ_ONLY_REASON, readOnly } from '../lib/read-only'
import { FileInput } from './ui/file-input'
import { Input } from './ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { NativeSelect } from './ui/native-select'
import { Checkbox } from './app/checkbox'
import { buttonVariants } from './app/button'
import { cn } from '../lib/cn'
import { EmptyState } from './ui/empty-state'
import { ErrorCard, Section } from './layout'

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

// The badge says what happened, not the stored enum — "invited" is the
// state, what the operator needs to know is that mail went out.
const STATE_LABEL: Record<string, string> = {
  invited: 'Invitation sent',
}

const EMPTY_FORM = {
  displayName: '',
  beaconKind: 'venue',
  contactEmail: '',
  citySlug: '',
  destinationUrl: '',
}

export function BeaconConsolePanel(props: { slug: string }) {
  // Same keys the signal panel uses — two names for one endpoint meant the
  // roster fetched the full dashboard twice every time the tab opened.
  const roster = useQuery(() => ({
    queryKey: ['beacon-signal-dashboard', props.slug],
    queryFn: () => api.beaconSignalDashboard(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  // Only for the researched-contact count. A button that cannot say how many
  // contacts it will bring over is a dare: press it and find out.
  const network = useQuery(() => ({
    queryKey: ['beacon-signal-network', props.slug],
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
  const MAX_VISIBLE = 15
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

  // Mirrors the batch eligibility the upstream mint enforces: a bulk invite
  // is new outreach only — never-invited or a lapsed invite, with an email to
  // send to. Members, paused, revoked and still-live invites are excluded;
  // paused/revoked stay revivable one at a time through Re-invite.
  const invitable = (profile: BeaconProfileView) =>
    profile.contactEmail !== null &&
    profile.verified !== false &&
    profile.acceptsOutreach !== false &&
    profile.doNotContact !== true &&
    (profile.status === 'unverified' ||
      (profile.status === 'invited' &&
        !(profile.inviteExpiresAt && new Date(profile.inviteExpiresAt).getTime() > Date.now())))

  const notInvitableReason = (profile: BeaconProfileView) => {
    if (profile.contactEmail === null) return 'No contact email — add one before inviting'
    if (profile.doNotContact === true) return 'Marked do-not-contact'
    if (profile.verified === false || profile.acceptsOutreach === false)
      return 'Contact route not verified yet — the roster only invites verified addresses'
    if (profile.status === 'active') return 'Already a Signal member'
    if (profile.status === 'invited') return 'Invitation already sent — re-invites once the link expires'
    if (profile.status === 'paused') return 'Paused — use Re-invite to approach deliberately'
    if (profile.status === 'revoked') return 'Revoked — use Re-invite to approach deliberately'
    return 'Not invitable'
  }

  const toggle = (beaconId: string) => {
    const next = new Set(selected())
    if (next.has(beaconId)) next.delete(beaconId)
    else next.add(beaconId)
    setSelected(next)
  }

  // Selects what is currently visible AND invitable — a row already holding a
  // live invite must not ride along into a second email.
  const invitableVisible = createMemo(() => visible().filter(invitable))

  const selectAllVisible = () => {
    const shown = invitableVisible().map(profile => profile.beaconId)
    const allShown = shown.length > 0 && shown.every(id => selected().has(id))
    setSelected(allShown ? new Set<string>() : new Set<string>(shown))
  }

  const act = async <T,>(key: string, run: () => Promise<T>, done: string | ((result: T) => string)) => {
    if (busy() !== null) return
    setBusy(key)
    setNotice(null)
    try {
      const result = await run()
      setNotice({ tone: 'good', message: typeof done === 'function' ? done(result) : done })
      await roster.refetch()
      refreshQueries(['beacon-signal-network', props.slug], ['beacon-signal-candidates', props.slug])
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
      `Imported researched contacts. They are unverified — the roster only invites verified addresses.`,
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
      `Imported SubmitHub curators. They are unverified — enrich contact info from the chats first.`,
    ).then(() => { input.value = '' })
  }

  const inviteSelected = () => {
    const ids = invitableVisible().map(profile => profile.beaconId).filter(id => selected().has(id))
    if (ids.length === 0) return
    void act(
      'invite',
      // One mint caps at 200 ids — a city-scale select goes in waves, each
      // wave its own idempotent request, and the tally reports what all the
      // waves together actually did.
      async () => {
        const MAX_WAVE = 200
        let created = 0
        let skipped = 0
        for (let i = 0; i < ids.length; i += MAX_WAVE) {
          try {
            const wave = await api.batchInviteBeacons(props.slug, ids.slice(i, i + MAX_WAVE))
            created += wave.created
            skipped += wave.skipped
          } catch (error) {
            // A wave that fails after earlier waves minted is a partial send —
            // the error says what actually went out, never a flat failure.
            if (created === 0) throw error
            throw new Error(
              `${created} invitation${created === 1 ? '' : 's'} sent, then a wave failed: ${errorMessage(error, 'upstream refused')}`,
            )
          }
        }
        return { created, skipped }
      },
      // Report what the mint actually did, not what was asked for — a
      // selection can contain rows that became ineligible between render and
      // send, and "Invited 5" that mailed 3 is the lie this panel exists
      // to kill.
      (result) => {
        const sent = `${result.created} invitation${result.created === 1 ? '' : 's'} sent`
        return result.skipped > 0 ? `${sent} · ${result.skipped} skipped (already covered or ineligible)` : `${sent}.`
      },
    ).then(() => setSelected(new Set<string>()))
  }

  // Deliberate revive: paused and revoked beacons are excluded from the bulk
  // path so an accidental select-all cannot undo an operator decision, but a
  // single named row can always be re-approached.
  const reinvite = (beaconId: string) =>
    void act(`invite:${beaconId}`, () => api.inviteBeacon(props.slug, beaconId), 'Invitation sent.')

  const setState = (beaconId: string, status: 'active' | 'paused' | 'revoked') =>
    void act(`state:${beaconId}`, () => api.setBeaconState(props.slug, beaconId, status), `Amplifier ${status}.`)

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
    <Section
      flush
      title="Roster"
      count={roster.data?.total}
      description={roster.data
        ? `${roster.data.active} active · ${roster.data.invited} invited. The list you search is the list you select and invite.`
        : 'The list you search is the list you select and invite.'}
      action={
        <div class="flex flex-wrap items-center gap-2">
          <Show when={(network.data?.researchedAvailable ?? 0) > 0}>
            <Button writes
              variant="outline"
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
            class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}
            classList={{ 'pointer-events-none opacity-45': busy() !== null || readOnly() }}
            title={readOnly() ? READ_ONLY_REASON : "Upload a SubmitHub Activity CSV. Curators who approved or shared land as unverified amplifiers — enrich contact info from the chats, then approve."}
          >
            {busy() === 'submithub' && <Spinner />} {busy() === 'submithub' ? 'Importing…' : 'Import SubmitHub CSV'}
            <FileInput
              writes
              accept=".csv,text/csv"
              disabled={busy() !== null}
              onChange={importSubmithub}
            />
          </label>
          <Button writes variant={adding() ? 'ghost' : 'default'} size="sm" onClick={() => setAdding(value => !value)}>
            {adding() ? 'Cancel' : 'Add amplifier'}
          </Button>
        </div>
      }
    >

      <Show when={roster.isPending}><SkeletonPanel /></Show>
      <Show when={roster.error}>
        <ErrorCard>Could not load the roster: {errorMessage(roster.error, 'We couldn\'t load the amplifier roster. Try refreshing.')}</ErrorCard>
      </Show>

      <Show when={adding()}>
        <form class="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4" onSubmit={addBeacon}>
          <label class="grid gap-1.5 text-muted-foreground text-sm">
            Name <small class="text-xs text-muted-foreground">venue, shop or person</small>
            <Input value={form().displayName} required maxlength={200}
                   onInput={e => setForm({ ...form(), displayName: e.currentTarget.value })} />
          </label>
          <label class="grid gap-1.5 text-muted-foreground text-sm">
            Kind <small class="text-xs text-muted-foreground">what they are to the band, not their job title</small>
            <NativeSelect value={form().beaconKind}
                    onChange={e => setForm({ ...form(), beaconKind: e.currentTarget.value })}>
              <For each={KINDS}>{kind => <option value={kind}>{KIND_LABEL[kind]}</option>}</For>
            </NativeSelect>
          </label>
          <label class="grid gap-1.5 text-muted-foreground text-sm">
            City slug <small class="text-xs text-muted-foreground">as the public city list returns it</small>
            <Input value={form().citySlug} maxlength={100}
                   onInput={e => setForm({ ...form(), citySlug: e.currentTarget.value })} />
          </label>
          <label class="grid gap-1.5 text-muted-foreground text-sm">
            Contact email <small class="text-xs text-muted-foreground">needed before they can be invited</small>
            <Input type="email" value={form().contactEmail} maxlength={320}
                   onInput={e => setForm({ ...form(), contactEmail: e.currentTarget.value })} />
          </label>
          <div class="flex gap-2 justify-end mt-5 md:col-span-2">
            <Button writes size="sm" type="submit" disabled={busy() !== null || !form().displayName.trim()}>
              {busy() === 'add' && <Spinner />} {busy() === 'add' ? 'Adding…' : 'Add amplifier'}
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
        <div class="flex gap-2.5 items-center flex-wrap my-4">
          {/* Placeholder text disappears the moment you type, so it is not a
              name: the field announced itself as "edit text" to a screen
              reader. Same for the filter beside it. */}
          <Input
            class="flex-1 min-w-[200px]"
            type="search"
            aria-label="Search amplifiers"
            placeholder="Search name, city, email or kind…"
            value={query()}
            onInput={event => onSearch(event.currentTarget.value)}
          />
          <NativeSelect aria-label="Filter amplifiers by state" value={statusFilter()} onChange={event => onFilter(event.currentTarget.value)}>
            <option value="all">All states</option>
            <option value="unverified">Unverified</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="paused">Paused</option>
            <option value="revoked">Revoked</option>
          </NativeSelect>
          <Button variant="ghost" size="sm" onClick={selectAllVisible} disabled={invitableVisible().length === 0}
                  title={invitableVisible().length === 0 ? 'No amplifier in view can be invited — members, paused and already-invited rows are skipped' : undefined}>
            {invitableVisible().length > 0 && invitableVisible().every(p => selected().has(p.beaconId))
              ? 'Clear selection'
              : `Select all ${invitableVisible().length} invitable`}
          </Button>
          <Button writes
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
              fallback={<EmptyState label="No amplifier matches that search" hint="Search covers name, city, email and kind." />}
            >
              <EmptyState
                label="No amplifiers yet"
                hint="Local growth needs people on the ground. Add the venues, shops and promoters the band already knows, then invite them to Signal."
              />
            </Show>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-8" />
                <TableHead>Amplifier</TableHead>
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
                      <Checkbox
                        checked={selected().has(profile.beaconId)}
                        onChange={() => toggle(profile.beaconId)}
                        disabled={!invitable(profile)}
                        title={invitable(profile) ? undefined : notInvitableReason(profile)}
                        aria-label={`Select ${profile.displayName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div class="flex flex-col gap-0.5">
                        <strong class="text-sm text-foreground">{profile.displayName}</strong>
                        <span class="text-xs text-muted-foreground truncate">
                          {beaconKindLabel(profile.beaconKind)}
                          {profile.city ? ` · ${profile.city}` : ''}
                          {profile.contactEmail ? ` · ${profile.contactEmail}` : ' · no email'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={STATE_LABEL[profile.status] ?? humanizeToken(profile.status)} tone={STATE_TONE[profile.status] ?? 'muted'} />
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
                          <Button writes variant="ghost" size="sm" disabled={busy() !== null}
                                  onClick={() => setState(profile.beaconId, 'paused')}>
                            {busy() === `state:${profile.beaconId}` && <Spinner />} Pause
                          </Button>
                        </Show>
                        {/* Resume only works on a member — upstream 'active'
                            requires a join. A paused beacon that never joined
                            revives through a new invitation instead. */}
                        <Show when={profile.status === 'paused' && profile.joinedAt !== null}>
                          <Button writes variant="ghost" size="sm" disabled={busy() !== null}
                                  onClick={() => setState(profile.beaconId, 'active')}>
                            {busy() === `state:${profile.beaconId}` && <Spinner />} Resume
                          </Button>
                        </Show>
                        <Show when={profile.status === 'paused' || profile.status === 'revoked'}>
                          <Button writes variant="ghost" size="sm" disabled={busy() !== null}
                                  title="Send a fresh invitation — the deliberate revive path the bulk invite excludes"
                                  onClick={() => reinvite(profile.beaconId)}>
                            {busy() === `invite:${profile.beaconId}` && <Spinner />} Re-invite
                          </Button>
                        </Show>
                        <Show when={profile.status !== 'unverified' && profile.status !== 'revoked'}>
                          <Button writes variant="destructive-ghost" size="sm" disabled={busy() !== null}
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
              {showAll() ? 'Show fewer' : `Show all ${visible().length}`}
            </Button>
          </Show>
        </Show>
      </Show>

      <Show when={notice()}>
        {value => <p class="rounded-lg border p-4 text-sm" classList={{
          'border-success-foreground/30 bg-success-foreground/10 text-success-foreground': value().tone === 'good',
          'border-destructive/30 bg-destructive/10 text-destructive': value().tone === 'bad',
        }}>{value().message}</p>}
      </Show>
    </Section>
  )
}
