import { For, Index, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api, errorHeading } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshQueries } from '../lib/refresh'
import { errorMessage, formatTimestamp } from '../lib/format'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { ErrorCard, Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Checkbox } from './app/checkbox'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { NativeSelect } from './ui/native-select'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { writeGuard } from '../lib/read-only'
import type { BandListing, ListingClaim, ListingState, RepresentationTarget, RepresentationTargetsResponse } from '../lib/types'

const CLAIM_TIERS = [
  { value: 'downstream', label: 'Banked' },
  { value: 'intermediate', label: 'Intent' },
  { value: 'vanity', label: 'Reach' },
] as const

type ClaimDraft = { label: string; value: string; tier: ListingClaim['tier']; basis: string }

type ListingDraft = {
  act_name: string
  genre_tags: string
  cities: string
  claims: ClaimDraft[]
  published_dates: string
  seeking: string
}

const EMPTY_DRAFT: ListingDraft = {
  act_name: '',
  genre_tags: '',
  cities: '',
  claims: [],
  published_dates: '',
  seeking: '',
}

const splitList = (value: string) =>
  value.split(',').map(part => part.trim()).filter(Boolean)

const draftFromListing = (listing: BandListing | null | undefined): ListingDraft => {
  if (!listing) return { ...EMPTY_DRAFT, claims: [] }
  return {
    act_name: listing.act_name,
    genre_tags: listing.genre_tags.join(', '),
    cities: listing.cities.join(', '),
    claims: listing.claims.map(c => ({
      label: c.label,
      value: c.value == null ? '' : String(c.value),
      tier: c.tier,
      basis: c.basis,
    })),
    published_dates: listing.published_dates.join(', '),
    seeking: listing.seeking.join(', '),
  }
}

const draftToBody = (draft: ListingDraft): Omit<BandListing, 'visibility'> => ({
  act_name: draft.act_name,
  genre_tags: splitList(draft.genre_tags),
  cities: splitList(draft.cities),
  claims: draft.claims
    .filter(c => c.label.trim() && c.basis.trim())
    .map(c => ({ label: c.label.trim(), value: c.value.trim() ? Number(c.value) : null, tier: c.tier, basis: c.basis.trim() })),
  published_dates: splitList(draft.published_dates),
  seeking: splitList(draft.seeking),
})

/** A contact the band may approach right now — the client-side mirror of
 *  the domain gate. The server re-checks everything; this only decides
 *  whether the button is worth offering. */
const approachable = (
  target: RepresentationTarget,
  state: ListingState | undefined,
) =>
  target.active &&
  target.verified &&
  target.accepts_outreach &&
  !target.do_not_contact &&
  state?.listing?.visibility === 'admitted_readers' &&
  (state?.approaches_used_this_month ?? 0) < (state?.monthly_approach_allowance ?? 0)

/** The one reason a contact cannot be approached, in the order the band
 *  should fix it. The server still has the last word — this is the
 *  disabled-button explanation, not the gate. */
const blockedReason = (target: RepresentationTarget, state: ListingState | undefined): string => {
  if (target.do_not_contact) return 'asked not to be contacted'
  if (!target.active) return 'inactive'
  if (!target.verified) return 'address not confirmed'
  if (!target.accepts_outreach) return 'has not opted in'
  if (state?.listing?.visibility !== 'admitted_readers') return 'publish the listing first'
  if ((state?.approaches_used_this_month ?? 0) >= (state?.monthly_approach_allowance ?? 0))
    return 'allowance used this month'
  return ''
}

type ContactDraft = {
  editing_id: string | null
  version: number
  kind: 'agent' | 'label'
  display_name: string
  contact_email: string
  accepts_outreach: boolean
  accepts_outreach_basis: string
  verified: boolean
  active: boolean
  do_not_contact: boolean
}

const EMPTY_CONTACT: ContactDraft = {
  editing_id: null,
  version: 0,
  kind: 'agent',
  display_name: '',
  contact_email: '',
  accepts_outreach: false,
  accepts_outreach_basis: '',
  verified: false,
  active: true,
  do_not_contact: false,
}

export function ListingPanel(props: { slug: string; data?: ListingState; targets?: RepresentationTargetsResponse }) {
  // The proof read model feeds both lists — fed, the panel never asks.
  const fed = () => props.data !== undefined && props.targets !== undefined
  const [error, setError] = createSignal<string | null>(null)
  const [saving, setSaving] = createSignal(false)
  const [acting, setActing] = createSignal<string | null>(null)
  const [copied, setCopied] = createSignal(false)
  const [draft, setDraft] = createSignal<ListingDraft>({ ...EMPTY_DRAFT })
  // The slug the draft was seeded for — a tenant switch must not carry the
  // previous tenant's form into this one's save.
  const [seededSlug, setSeededSlug] = createSignal<string | null>(null)
  const [addingContact, setAddingContact] = createSignal(false)
  const [contact, setContact] = createSignal<ContactDraft>({ ...EMPTY_CONTACT })

  const listing = useQuery(() => ({
    queryKey: ['tenant-listing', props.slug],
    queryFn: () => api.listingState(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    enabled: !fed(),
  }))
  const targets = useQuery(() => ({
    queryKey: ['representation-targets', props.slug],
    queryFn: () => api.representationTargets(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    enabled: !fed(),
  }))

  // Load the draft once per tenant, from the server — typing after that is
  // the band's until it saves. Re-seeding on every refetch would silently
  // eat edits; keying the seed to the slug keeps a tenant switch from
  // writing the previous tenant's draft into this one's listing.
  createEffect(() => {
    const s = state()
    if (s && seededSlug() !== props.slug) {
      setDraft(draftFromListing(s.listing))
      setSeededSlug(props.slug)
    }
  })

  const state = () => (fed() ? props.data : listing.data)
  const targetsState = () => (fed() ? props.targets : targets.data)
  const published = () => state()?.listing?.visibility === 'admitted_readers'

  // The share link opens on the tenant's member site — the same
  // `member_site_base_url` the Workspace settings tab edits, read through
  // the same query so both panels share one cache entry. Never a borrowed
  // host: unset means no link, not the first tenant's origin.
  const settings = useQuery(() => ({
    queryKey: ['tenant-settings', props.slug],
    queryFn: () => api.tenantSettings(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const memberSite = () => {
    const base = settings.data?.settings['member_site_base_url']?.trim().replace(/\/+$/, '')
    return base ? base : null
  }
  const shareUrl = createMemo(() => {
    const token = state()?.share_token
    const base = memberSite()
    return token && base ? `${base}/listing?t=${token}` : null
  })

  const run = async (key: string, action: () => Promise<unknown>) => {
    setError(null)
    setActing(key)
    try {
      await action()
      await Promise.all([listing.refetch(), targets.refetch()])
      // A queued approach lands on Attention's decision queue, the
      // operations KPI strip and the proof drawer — invalidate so all
      // three catch it on next visit.
      refreshQueries(['tenant-today', props.slug], ['tenant-operator-attention-snapshot', props.slug], ['tenant-proof', props.slug])
    } catch (e) {
      setError(errorMessage(e, 'That could not be saved.'))
    } finally {
      setActing(null)
    }
  }

  const saveDraft = () => run('save', async () => {
    setSaving(true)
    try {
      await api.saveListing(props.slug, draftToBody(draft()))
    } finally {
      setSaving(false)
    }
  })

  const publish = () => run('publish', () => api.publishListing(props.slug))
  const unlist = () => run('unlist', () => api.unlistListing(props.slug))
  const rotateToken = () => run('rotate', () => api.rotateListingToken(props.slug))

  const copyLink = async () => {
    const url = shareUrl()
    if (!url) return
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const approach = (target: RepresentationTarget) =>
    run(`approach:${target.target_id}`, () =>
      api.requestRepresentationApproach(props.slug, target.target_id))

  const editContact = (target: RepresentationTarget) => {
    setContact({
      editing_id: target.target_id,
      version: target.version,
      kind: target.kind === 'label' ? 'label' : 'agent',
      display_name: target.display_name,
      // The address never leaves the platform, so an edit re-confirms it
      // rather than echoing it back — that is also where a typo gets fixed.
      contact_email: '',
      accepts_outreach: target.accepts_outreach,
      accepts_outreach_basis: target.accepts_outreach_basis ?? '',
      verified: target.verified,
      active: target.active,
      do_not_contact: target.do_not_contact,
    })
    setAddingContact(true)
  }

  const saveContact = () => run('save-contact', async () => {
    const c = contact()
    await api.upsertRepresentationTarget(props.slug, {
      target_id: c.editing_id ?? undefined,
      expected_version: c.editing_id ? c.version : undefined,
      kind: c.kind,
      display_name: c.display_name.trim(),
      contact_email: c.contact_email.trim(),
      accepts_outreach: c.accepts_outreach,
      accepts_outreach_basis: c.accepts_outreach_basis.trim() || undefined,
      verified: c.verified,
      active: c.active,
      do_not_contact: c.do_not_contact,
    })
    setContact({ ...EMPTY_CONTACT })
    setAddingContact(false)
  })

  const setClaim = (index: number, patch: Partial<ClaimDraft>) =>
    setDraft(d => ({
      ...d,
      claims: d.claims.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }))

  const used = () => state()?.approaches_used_this_month ?? 0
  const allowance = () => state()?.monthly_approach_allowance ?? 0

  return (
    <div class="flex flex-col gap-4">
      <Show when={error()}>
        <ErrorCard>{errorHeading(error(), 'Something went wrong')}: {error()}</ErrorCard>
      </Show>

      {/* The listing — the band-authored profile a share link admits a
          reader to. Saving never publishes; the Publish button runs the
          upstream review and its refusal lands in `error`. */}
      <Section
        title="Your listing"
        icon={<SectionIcon name="target" />}
        description="What an agent or label sees when you hand them the link. Every number needs the basis you can be held to."
        action={
          <Show when={state()}>
            <Badge variant={published() ? 'success' : 'muted'}>
              {published() ? 'Listed' : 'Unlisted'}
            </Badge>
          </Show>
        }
      >
        <Show when={!fed() && listing.error}>
          <ErrorCard>Listing unavailable: {errorMessage(listing.error, 'We could not reach the listing.')}</ErrorCard>
        </Show>
        <Show when={seededSlug() === props.slug || state()} fallback={<SkeletonRows count={4} />}>
          <div class="flex flex-col gap-4">
            <div class="grid gap-4 md:grid-cols-2">
              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-medium text-muted-foreground">Act name</span>
                <Input
                  value={draft().act_name}
                  onInput={e => setDraft(d => ({ ...d, act_name: e.currentTarget.value }))}
                  placeholder="Your act name"
                  {...writeGuard()}
                />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-medium text-muted-foreground">Genre tags</span>
                <Input
                  value={draft().genre_tags}
                  onInput={e => setDraft(d => ({ ...d, genre_tags: e.currentTarget.value }))}
                  placeholder="blackened hardcore, sludge"
                  {...writeGuard()}
                />
              </label>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-medium text-muted-foreground">Cities you draw in</span>
                <Input
                  value={draft().cities}
                  onInput={e => setDraft(d => ({ ...d, cities: e.currentTarget.value }))}
                  placeholder="Warsaw, Kraków, Prague"
                  {...writeGuard()}
                />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-xs font-medium text-muted-foreground">Looking for</span>
                <Input
                  value={draft().seeking}
                  onInput={e => setDraft(d => ({ ...d, seeking: e.currentTarget.value }))}
                  placeholder="booking agent, label"
                  {...writeGuard()}
                />
              </label>
            </div>
            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-muted-foreground">Dates you can show</span>
              <Input
                value={draft().published_dates}
                onInput={e => setDraft(d => ({ ...d, published_dates: e.currentTarget.value }))}
                placeholder="Announced shows or free windows — e.g. 2026-11-14 Warsaw"
                {...writeGuard()}
              />
            </label>

            {/* Claims — the numbers that make this worth more than a press
                kit. A claim with no number yet stays in the draft but never
                reaches a reader. */}
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-muted-foreground">
                  Numbers you can stand behind
                </span>
                <Button
                  variant="ghost" size="sm"
                  disabled={draft().claims.length >= 24}
                  onClick={() => setDraft(d => ({ ...d, claims: [...d.claims, { label: '', value: '', tier: 'downstream', basis: '' }] }))}
                  {...writeGuard()}
                >
                  Add a number
                </Button>
              </div>
              <Show when={draft().claims.length === 0}>
                <p class="text-sm text-muted-foreground">
                  No numbers yet. A listing whose only claims are reach reads as a press kit —
                  "420 tickets banked in Warsaw" is worth more than "50k monthly listeners".
                </p>
              </Show>
              {/* <Index>, not <For>: edits replace the claim object, and a
                  value-keyed list would dispose the row — and the focused
                  input — on every keystroke. */}
              <Index each={draft().claims}>{(claim, index) => (
                <div class="grid items-end gap-2 rounded-md border border-border p-3 md:grid-cols-[1fr_120px_110px_1fr_auto]">
                  <label class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Claim</span>
                    <Input
                      value={claim().label}
                      onInput={e => setClaim(index, { label: e.currentTarget.value })}
                      placeholder="Tickets sold in Warsaw, last 12 months"
                      {...writeGuard()}
                    />
                  </label>
                  <label class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Number</span>
                    <Input
                      value={claim().value}
                      inputmode="numeric"
                      onInput={e => setClaim(index, { value: e.currentTarget.value })}
                      placeholder="420"
                      {...writeGuard()}
                    />
                  </label>
                  <label class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Tier</span>
                    <NativeSelect
                      value={claim().tier}
                      onChange={e => setClaim(index, { tier: e.currentTarget.value as ListingClaim['tier'] })}
                      {...writeGuard()}
                    >
                      <For each={CLAIM_TIERS}>{t => <option value={t.value}>{t.label}</option>}</For>
                    </NativeSelect>
                  </label>
                  <label class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Basis — where the number comes from</span>
                    <Input
                      value={claim().basis}
                      onInput={e => setClaim(index, { basis: e.currentTarget.value })}
                      placeholder="CrowdRelay ticket ledger"
                      {...writeGuard()}
                    />
                  </label>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setDraft(d => ({ ...d, claims: d.claims.filter((_, i) => i !== index) }))}
                    {...writeGuard()}
                  >
                    Remove
                  </Button>
                </div>
              )}</Index>
            </div>

            <div class="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button onClick={() => void saveDraft()} disabled={saving() || acting() !== null} {...writeGuard()}>
                {saving() ? 'Saving…' : 'Save draft'}
              </Button>
              <Show when={!published()}>
                <Button variant="secondary" onClick={() => void publish()} disabled={acting() !== null} {...writeGuard()}>
                  {acting() === 'publish' ? 'Publishing…' : 'Publish listing'}
                </Button>
              </Show>
              <Show when={published()}>
                <Button variant="secondary" onClick={() => void unlist()} disabled={acting() !== null} {...writeGuard()}>
                  {acting() === 'unlist' ? 'Taking down…' : 'Unlist'}
                </Button>
              </Show>
              <Show when={published() && state()?.published_at}>
                <span class="text-xs text-muted-foreground">
                  Listed since {formatTimestamp(state()!.published_at)}
                </span>
              </Show>
            </div>

            {/* The share link is the admission — whoever holds it reads the
                published listing. Rotating it revokes every link sent. */}
            <Show when={published() && shareUrl()}>
              <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
                <code class="min-w-0 flex-1 truncate text-xs text-foreground">{shareUrl()}</code>
                <Button variant="ghost" size="sm" onClick={() => void copyLink()}>
                  {copied() ? 'Copied' : 'Copy link'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void rotateToken()} disabled={acting() !== null} {...writeGuard()}>
                  {acting() === 'rotate' ? 'Rotating…' : 'Revoke & rotate'}
                </Button>
              </div>
            </Show>
            {/* Published but no member site configured — say why there is
                no link instead of printing the first tenant's host. A failed
                settings read is a different answer than an unset one. */}
            <Show when={published() && !shareUrl()}>
              <Show
                when={settings.data}
                fallback={
                  <Show when={settings.error}>
                    <p class="text-xs text-muted-foreground">
                      The share link could not be built right now — the settings read is degraded.
                    </p>
                  </Show>
                }
              >
                <p class="text-xs text-muted-foreground">
                  Set this tenant's Member site base URL (
                  <Link
                    to="/tenants/$slug"
                    params={{ slug: props.slug }}
                    search={{ tab: 'workspace' }}
                    class="text-primary underline-offset-2 hover:underline"
                  >
                    Settings → Workspace
                  </Link>
                  ) to get a share link.
                </p>
              </Show>
            </Show>
          </div>
        </Show>
      </Section>

      {/* Representation — agents and labels the band may approach. The
          address never leaves the platform: the pitch is brokered, so the
          table shows names and consent state, not mailboxes. */}
      <Section
        title="Representation"
        icon={<SectionIcon name="users" />}
        description="Agents and labels you can approach. Approaches are brokered — the pitch carries your listing, never a raw address — and scarce: a few a month, so each one has to be worth sending."
        action={
          <Show when={state()}>
            <Badge variant={used() >= allowance() ? 'warning' : 'muted'}>
              {used()}/{allowance()} approaches this month
            </Badge>
          </Show>
        }
      >
        <Show when={!fed() && targets.error}>
          <ErrorCard>Contacts unavailable: {errorMessage(targets.error, 'We could not reach the contact list.')}</ErrorCard>
        </Show>
        <Show when={targetsState()} fallback={<SkeletonRows count={3} />}>
          <Show
            when={(targetsState()?.targets.length ?? 0) > 0}
            fallback={
              <EmptyState
                label="No representation contacts yet"
                hint="Add an agent or label below, or promote one from the Drive contacts scan. A contact must opt in before you can approach."
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Consent</TableHead>
                  <TableHead>Last approached</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={targetsState()?.targets ?? []}>{target => {
                  const reason = () => blockedReason(target, state())
                  return (
                    <TableRow>
                      <TableCell>
                        <strong>{target.display_name}</strong>
                        <Show when={target.do_not_contact}>
                          <br /><Badge variant="destructive">do not contact</Badge>
                        </Show>
                      </TableCell>
                      <TableCell><Badge variant="muted">{target.kind}</Badge></TableCell>
                      <TableCell>
                        <Show
                          when={target.accepts_outreach}
                          fallback={<Badge variant="warning">not opted in</Badge>}
                        >
                          <Badge variant="success">opted in</Badge>
                          <Show when={target.accepts_outreach_basis}>
                            <br /><span class="text-xs text-muted-foreground">{target.accepts_outreach_basis}</span>
                          </Show>
                        </Show>
                      </TableCell>
                      <TableCell>
                        {target.last_outreach_at ? formatTimestamp(target.last_outreach_at) : 'never'}
                      </TableCell>
                      <TableCell numeric>
                        <div class="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => editContact(target)}
                            {...writeGuard()}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="secondary" size="sm"
                            disabled={acting() !== null || !approachable(target, state())}
                            title={reason() || (authState.isPlatformLevel() ? 'Queue an approach for approval' : 'Send an approach for approval')}
                            onClick={() => void approach(target)}
                            {...writeGuard()}
                          >
                            {acting() === `approach:${target.target_id}` ? (authState.isPlatformLevel() ? 'Queueing…' : 'Sending…') : 'Approach'}
                          </Button>
                        </div>
                        <Show when={!approachable(target, state()) && reason()}>
                          <span class="text-xs text-muted-foreground">{reason()}</span>
                        </Show>
                      </TableCell>
                    </TableRow>
                  )
                }}</For>
              </TableBody>
            </Table>
          </Show>

          {/* Add or edit a contact — consent is asserted, not assumed. The
              basis field is the sentence "they asked for…" that makes the
              opt-in mean something, and the confirmed-address check is the
              band's own attestation that the mailbox reaches the person. */}
          <div class="mt-4 border-t border-border pt-4">
            <Show
              when={addingContact()}
              fallback={
                <Button variant="ghost" size="sm" onClick={() => { setContact({ ...EMPTY_CONTACT }); setAddingContact(true) }} {...writeGuard()}>
                  Add an agent or label
                </Button>
              }
            >
              <div class="grid gap-3 md:grid-cols-2">
                <label class="flex flex-col gap-1.5">
                  <span class="text-xs font-medium text-muted-foreground">Name</span>
                  <Input
                    value={contact().display_name}
                    onInput={e => setContact(c => ({ ...c, display_name: e.currentTarget.value }))}
                    placeholder="Roster agency / label name"
                  />
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-xs font-medium text-muted-foreground">
                    {contact().editing_id ? 'Contact email — re-enter to confirm or correct' : 'Contact email'}
                  </span>
                  <Input
                    type="email"
                    value={contact().contact_email}
                    onInput={e => setContact(c => ({ ...c, contact_email: e.currentTarget.value }))}
                    placeholder="bookings@example.com"
                  />
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-xs font-medium text-muted-foreground">Kind</span>
                  <NativeSelect
                    value={contact().kind}
                    onChange={e => setContact(c => ({ ...c, kind: e.currentTarget.value as 'agent' | 'label' }))}
                  >
                    <option value="agent">Agent</option>
                    <option value="label">Label</option>
                  </NativeSelect>
                </label>
                <div class="flex flex-col gap-2 self-end pb-2">
                  <Checkbox
                    checked={contact().accepts_outreach}
                    onChange={on => setContact(c => ({ ...c, accepts_outreach: on }))}
                    label="They take pitches"
                  />
                  <Checkbox
                    checked={contact().verified}
                    onChange={on => setContact(c => ({ ...c, verified: on }))}
                    label="Address confirmed"
                  />
                </div>
                <Show when={contact().editing_id}>
                  <div class="flex flex-col gap-2 self-end pb-2">
                    <Checkbox
                      checked={contact().active}
                      onChange={on => setContact(c => ({ ...c, active: on }))}
                      label="Active"
                    />
                    <Checkbox
                      checked={contact().do_not_contact}
                      onChange={on => setContact(c => ({ ...c, do_not_contact: on }))}
                      label="Do not contact"
                    />
                  </div>
                </Show>
                <Show when={contact().accepts_outreach}>
                  <label class="flex flex-col gap-1.5 md:col-span-2">
                    <span class="text-xs font-medium text-muted-foreground">
                      On what basis — how you know they take pitches
                    </span>
                    <Textarea
                      rows={2}
                      value={contact().accepts_outreach_basis}
                      onInput={e => setContact(c => ({ ...c, accepts_outreach_basis: e.currentTarget.value }))}
                      placeholder="Asked for bands drawing 200+ in PL at the showcase; roster page lists submissions"
                    />
                  </label>
                </Show>
              </div>
              <div class="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={
                    acting() !== null ||
                    !contact().display_name.trim() ||
                    !contact().contact_email.trim() ||
                    (contact().accepts_outreach && !contact().accepts_outreach_basis.trim())
                  }
                  onClick={() => void saveContact()}
                  {...writeGuard()}
                >
                  {acting() === 'save-contact' ? 'Saving…' : contact().editing_id ? 'Save contact' : 'Add contact'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setContact({ ...EMPTY_CONTACT }); setAddingContact(false) }}>
                  Cancel
                </Button>
              </div>
            </Show>
          </div>
        </Show>
      </Section>
    </div>
  )
}
