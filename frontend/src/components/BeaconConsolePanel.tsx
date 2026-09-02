import { For, Show, createMemo, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { errorMessage, formatTimestamp } from '../lib/format'
import { triggerRefresh } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { SkeletonPanel } from './Skeleton'

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

const STATE_TONE: Record<string, 'good' | 'warn' | 'bad' | 'muted'> = {
  active: 'good',
  invited: 'warn',
  paused: 'muted',
  revoked: 'bad',
}

const EMPTY_FORM = {
  displayName: '',
  beaconKind: 'venue',
  contactEmail: '',
  citySlug: '',
  destinationUrl: '',
}

export function BeaconConsolePanel(props: { slug: string }) {
  const [roster, { refetch }] = createResource(() => props.slug, api.beaconSignalDashboard)

  const [query, setQuery] = createSignal('')
  const [statusFilter, setStatusFilter] = createSignal<string>('all')
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [busy, setBusy] = createSignal<string | null>(null)
  const [notice, setNotice] = createSignal<{ tone: 'good' | 'bad'; message: string } | null>(null)
  const [adding, setAdding] = createSignal(false)
  const [form, setForm] = createSignal({ ...EMPTY_FORM })

  const profiles = () => roster()?.profiles ?? []

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
      await refetch()
      triggerRefresh()
    } catch (error) {
      setNotice({ tone: 'bad', message: errorMessage(error, 'That did not work') })
    } finally {
      setBusy(null)
    }
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
    <section class="panel">
      <header class="panel-header">
        <h2>Beacons</h2>
        <div class="panel-header-actions">
          <Show when={roster()}>
            <span class="muted">
              {roster()!.total} total · {roster()!.active} active · {roster()!.invited} invited
            </span>
          </Show>
          <button class="ghost" onClick={() => setAdding(value => !value)}>
            {adding() ? 'Cancel' : 'Add beacon'}
          </button>
        </div>
      </header>

      <Show when={roster.loading}><SkeletonPanel /></Show>
      <Show when={roster.error}>
        <p class="notice bad">Could not load the roster: {errorMessage(roster.error, 'unknown error')}</p>
      </Show>

      <Show when={adding()}>
        <form class="form-grid beacon-create" onSubmit={addBeacon}>
          <label>
            Name <small>venue, shop or person</small>
            <input value={form().displayName} required maxlength={200}
                   onInput={e => setForm({ ...form(), displayName: e.currentTarget.value })} />
          </label>
          <label>
            Kind
            <select value={form().beaconKind}
                    onChange={e => setForm({ ...form(), beaconKind: e.currentTarget.value })}>
              <For each={KINDS}>{kind => <option value={kind}>{kind}</option>}</For>
            </select>
          </label>
          <label>
            City slug <small>as the public city list returns it</small>
            <input value={form().citySlug} maxlength={100}
                   onInput={e => setForm({ ...form(), citySlug: e.currentTarget.value })} />
          </label>
          <label>
            Contact email <small>needed before they can be invited</small>
            <input type="email" value={form().contactEmail} maxlength={320}
                   onInput={e => setForm({ ...form(), contactEmail: e.currentTarget.value })} />
          </label>
          <div class="form-actions right">
            <button class="primary" type="submit" disabled={busy() !== null || !form().displayName.trim()}>
              {busy() === 'add' ? 'Adding…' : 'Add beacon'}
            </button>
          </div>
        </form>
      </Show>

      <Show when={roster()}>
        <div class="beacon-toolbar">
          <input
            class="beacon-search"
            placeholder="Search name, city, email or kind…"
            value={query()}
            onInput={event => setQuery(event.currentTarget.value)}
          />
          <select value={statusFilter()} onChange={event => setStatusFilter(event.currentTarget.value)}>
            <option value="all">All states</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="paused">Paused</option>
            <option value="revoked">Revoked</option>
          </select>
          <button class="ghost" onClick={selectAllVisible} disabled={visible().length === 0}>
            {visible().every(p => selected().has(p.beaconId)) && visible().length > 0
              ? 'Clear selection'
              : `Select ${visible().length} shown`}
          </button>
          <button
            class="primary"
            disabled={selected().size === 0 || busy() !== null}
            onClick={inviteSelected}
          >
            {busy() === 'invite' ? 'Inviting…' : `Invite ${selected().size} to Signal`}
          </button>
        </div>

        <Show
          when={visible().length > 0}
          fallback={
            <p class="notice warn">
              {profiles().length === 0
                ? 'No beacons yet. Local growth needs people on the ground — add the venues, shops and promoters you already know.'
                : 'No beacon matches that search.'}
            </p>
          }
        >
          <div class="beacon-list">
            <For each={visible()}>
              {profile => (
                <div class="beacon-row" classList={{ selected: selected().has(profile.beaconId) }}>
                  <label class="beacon-pick">
                    <input
                      type="checkbox"
                      checked={selected().has(profile.beaconId)}
                      onChange={() => toggle(profile.beaconId)}
                    />
                  </label>
                  <div class="beacon-identity">
                    <strong>{profile.displayName}</strong>
                    <span class="muted">
                      {profile.beaconKind}
                      {profile.city ? ` · ${profile.city}` : ''}
                      {profile.contactEmail ? ` · ${profile.contactEmail}` : ' · no email'}
                    </span>
                  </div>
                  <div class="beacon-facts">
                    <StatusBadge status={profile.status} tone={STATE_TONE[profile.status] ?? 'muted'} />
                    <span class="badge">{profile.inviteCount} invite{profile.inviteCount === 1 ? '' : 's'}</span>
                    <Show when={profile.lastInvitedAt}>
                      {at => <span class="muted">last invited {formatTimestamp(at())}</span>}
                    </Show>
                    <Show when={profile.joinedAt}>
                      {at => <span class="muted">joined {formatTimestamp(at())}</span>}
                    </Show>
                  </div>
                  <div class="beacon-row-actions">
                    <Show when={profile.status !== 'paused' && profile.status !== 'revoked'}>
                      <button class="ghost" disabled={busy() !== null}
                              onClick={() => setState(profile.beaconId, 'paused')}>
                        Pause
                      </button>
                    </Show>
                    <Show when={profile.status === 'paused'}>
                      <button class="ghost" disabled={busy() !== null}
                              onClick={() => setState(profile.beaconId, 'active')}>
                        Resume
                      </button>
                    </Show>
                    <Show when={profile.status !== 'revoked'}>
                      <button class="ghost danger-ghost" disabled={busy() !== null}
                              onClick={() => setState(profile.beaconId, 'revoked')}>
                        Revoke
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={notice()}>
        {value => <p class={`notice ${value().tone}`}>{value().message}</p>}
      </Show>
    </section>
  )
}
