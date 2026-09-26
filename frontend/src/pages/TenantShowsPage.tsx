import { MerchTablePanel } from '../components/MerchTablePanel'
import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { TenantShow } from '../lib/types'
import { PageShell, PageHeader, ErrorCard, TabBar, TabPanel, useTabPanels, KpiCard, KpiStrip, Section } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { StatusBadge } from '../components/StatusBadge'
import { Badge } from '../components/app/badge'
import { BookingJourneyPanel } from '../components/BookingJourneyPanel'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection } from '../components/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { Dialog } from '../components/Dialog'
import { Field, FieldGrid } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { Checkbox } from '../components/app/checkbox'
import { Button } from '../components/app/button'
import { Spinner } from '../components/Spinner'
import { toast } from '../components/app/toast'

/** `/tenants/$slug/shows` — the gig list: next up first, then past shows,
 * newest first. The noun every show-day capability hangs off; the night
 * itself opens at `/tenants/$slug/shows/$eventSlug` (UX-2.2). */
export function TenantShowsPage() {
  const params = useParams({ from: '/tenants/$slug/shows' })
  const model = useQuery(() => ({
    queryKey: ['tenant-shows', params().slug],
    queryFn: () => api.shows(params().slug),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  }))
  // Two reads of the same noun: Nights is the list of dates, Booking is the
  // pipeline that produced them. The booking model is an eight-section
  // fan-out — it only fires once the tab mounts (visit, prefetch, or a
  // ?tab=booking deep link), so the default page costs the shows list only.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('nights', ['nights', 'booking', 'merch'])
  const [adding, setAdding] = createSignal(false)

  const upcoming = createMemo(() => (model.data?.events ?? []).filter(event => event.upcoming))
  const past = createMemo(() => (model.data?.events ?? []).filter(event => !event.upcoming))
  const next = () => upcoming()[0] ?? null
  // Sums over the nights that measure the thing: a night with no ticket
  // sale adds nothing to "sold" and does not turn the total into a zero.
  const ticketsKnown = () => upcoming().some(show => show.tickets_sold != null)
  const ticketsSold = () => upcoming().reduce((sum, show) => sum + (show.tickets_sold ?? 0), 0)
  const capacityKnown = () => upcoming().some(show => show.tickets_sold != null && show.capacity != null)
  const capacity = () => upcoming().reduce((sum, show) => sum + (show.tickets_sold != null ? show.capacity ?? 0 : 0), 0)
  const interested = () => upcoming().reduce((sum, show) => sum + (show.interested ?? 0), 0)
  const measuredPast = () => past().filter(show => (show.door_campaigns ?? 0) > 0).length
  const scans = () => past().reduce((sum, show) => sum + show.scan_count, 0)
  const status = (): { tone: 'good' | 'warn' | 'bad' | 'muted'; text: string } | null => {
    if (!model.data) return null
    const draft = upcoming().find(show => show.status === 'draft')
    if (draft) return { tone: 'warn', text: `${draft.city ?? draft.title} is booked, not announced` }
    if (!next()) return { tone: 'warn', text: 'Nothing booked ahead' }
    return { tone: 'good', text: `Next: ${next()!.city ?? next()!.title} in ${daysUntil(next()!.starts_at)}` }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={authState.isPlatformLevel() ? 'TENANT' : undefined}
        title="Shows"
        description="Which nights are coming, and which one needs you."
        actions={
          <>
            <Show when={status()}>{pill => <StatusBadge status={pill().text} tone={pill().tone} />}</Show>
            <Button size="sm" writes onClick={() => setAdding(true)}>
              Add show
            </Button>
          </>
        }
      />
      <AddShowDialog
        slug={params().slug}
        open={adding()}
        onClose={() => setAdding(false)}
      />

      <TabBar
        tabs={[
          { id: 'nights', label: 'Nights' },
          // "Booking" is taken — the tenant wizard's crew-skill option is
          // parity-locked to TeamSkill upstream. The journey's own words.
          { id: 'booking', label: 'Get booked' },
          // The merch table travels with the nights: stock is counted
          // before a run of shows and sold at the door.
          { id: 'merch', label: 'Merch table' },
        ]}
        active={activeTab()}
        onChange={switchTab}
        onPrefetch={prefetch}
      />

      <TabPanel active={activeTab()} id="nights" visited={isVisited('nights')}>
      <Show when={model.error}>
        <SectionFailureCard
          error={model.error}
          fallback="Shows unavailable"
          onRetry={() => void model.refetch()}
        />
      </Show>

      <Show when={!model.error && !model.data}>
        <SkeletonSection titleWidth="140px" lines={3} minHeight="120px" />
        <SkeletonSection titleWidth="120px" lines={4} minHeight="180px" />
      </Show>

      <Show when={model.data}>
        <Show
          when={(model.data?.events.length ?? 0) > 0}
          fallback={
            <EmptyState
              label="No shows yet"
              hint="Add a show above — or publish a gig in CrowdRelay — and it lands here: announced, played, everything the room scanned."
            />
          }
        >
          <KpiStrip>
            <KpiCard
              label="Next show"
              value={next() ? daysUntil(next()!.starts_at) : '—'}
              sub={next() ? [next()!.city, shortDate(next()!.starts_at)].filter(Boolean).join(' · ') : 'nothing booked'}
            />
            <KpiCard
              label="Tickets sold"
              value={ticketsKnown() ? ticketsSold().toLocaleString() : '—'}
              sub={ticketsKnown() ? (capacityKnown() ? `of ${capacity().toLocaleString()} across upcoming nights` : 'across upcoming nights') : 'no ticket sale on the upcoming nights'}
            />
            <KpiCard label="Interested" value={interested().toLocaleString()} sub="fans who asked to be told" />
            <KpiCard
              label="Played, 90 days"
              value={past().length}
              sub={measuredPast() === 0 ? 'no door QR used' : `${scans().toLocaleString()} door scans`}
            />
          </KpiStrip>

          <Section title="Coming up" icon={<SectionIcon name="play" />} count={upcoming().length}>
            <Show when={upcoming().length > 0} fallback={<p class="text-sm text-muted-foreground">Nothing announced.</p>}>
              <div class="flex flex-col gap-2">
                <For each={upcoming()}>{show => <UpcomingCard show={show} slug={params().slug} />}</For>
              </div>
            </Show>
          </Section>

          <Section title="Played" icon={<SectionIcon name="history" />} count={past().length}>
            <Show when={past().length > 0} fallback={<p class="text-sm text-muted-foreground">No played shows in the last ninety days.</p>}>
              <div class="flex flex-col">
                <For each={past()}>{show => <PlayedRow show={show} slug={params().slug} />}</For>
              </div>
              <Show when={measuredPast() === 0}>
                <p class="mt-3 text-xs text-muted-foreground">
                  A door QR scan turns the room into fans. None of these nights used one — the next night's door page has it ready.
                </p>
              </Show>
            </Show>
          </Section>
        </Show>
      </Show>
      </TabPanel>

      <TabPanel active={activeTab()} id="merch" visited={isVisited('merch')}>
        <MerchTablePanel slug={params().slug} />
      </TabPanel>
      <TabPanel active={activeTab()} id="booking" visited={isVisited('booking')}>
        <BookingJourneyPanel slug={params().slug} />
      </TabPanel>
    </PageShell>
  )
}

type ShowDraft = {
  title: string
  /** `datetime-local` wall times — converted to ISO on submit. */
  startsAt: string
  doorsAt: string
  endsAt: string
  venue: string
  venueAddress: string
  cityName: string
  cityCountry: string
  ticketUrl: string
  publish: boolean
}

const emptyShowDraft = (): ShowDraft => ({
  title: '', startsAt: '', doorsAt: '', endsAt: '',
  venue: '', venueAddress: '', cityName: '', cityCountry: '', ticketUrl: '',
  publish: true,
})

/** `datetime-local` yields a local wall time with no zone — convert through
 * the browser clock rather than appending a Z that would silently shift the
 * night (same call ReleaseCampaignsPanel makes). */
const toIso = (value: string) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** The form for a label that never ran a sync source — the night's basics,
 * nothing provider-shaped. City is a pair: both fields or neither. */
function AddShowDialog(props: { slug: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = createSignal<ShowDraft>(emptyShowDraft())
  // One key per form session — a retried submit replays to the same show
  // upstream instead of booking a second night. Closing re-keys and resets.
  const [createKey, setCreateKey] = createSignal(crypto.randomUUID())
  const set = <K extends keyof ShowDraft>(key: K, value: ShowDraft[K]) =>
    setDraft(current => ({ ...current, [key]: value }))
  const close = () => {
    props.onClose()
    setDraft(emptyShowDraft())
    setCreateKey(crypto.randomUUID())
    // Without the reset a refused submit's error card greets the next
    // session — the new draft is a fresh start, not a retry.
    create.reset()
  }

  const startsIso = () => toIso(draft().startsAt)
  const doorsIso = () => toIso(draft().doorsAt)
  const endsIso = () => toIso(draft().endsAt)
  const scheduleOk = () =>
    (!draft().doorsAt || (doorsIso() !== null && startsIso() !== null && doorsIso()! <= startsIso()!))
    && (!draft().endsAt || (endsIso() !== null && startsIso() !== null && endsIso()! >= startsIso()!))
  const cityOk = () => {
    const name = draft().cityName.trim()
    const code = draft().cityCountry.trim()
    return (name === '') === (code === '') && (code === '' || /^[A-Z]{2}$/.test(code))
  }
  const ticketOk = () =>
    draft().ticketUrl.trim() === '' || /^https:\/\/\S+$/.test(draft().ticketUrl.trim())
  const ready = () =>
    draft().title.trim() !== '' && startsIso() !== null && scheduleOk() && cityOk() && ticketOk()

  const create = useMutation(() => ({
    // The session key rides as the mutation variable: a submit that lands
    // after a cancel+reopen must refresh the list but not wipe the draft
    // the operator is typing in the new session.
    mutationFn: (key: string) =>
      api.showCreate(props.slug, {
        title: draft().title.trim(),
        starts_at: startsIso()!,
        doors_at: doorsIso(),
        ends_at: endsIso(),
        venue: draft().venue.trim() || null,
        venue_address: draft().venueAddress.trim() || null,
        city_name: draft().cityName.trim() || null,
        city_country_code: draft().cityCountry.trim().toUpperCase() || null,
        ticket_url: draft().ticketUrl.trim() || null,
        publish: draft().publish,
      }, key),
    onSuccess: async (created, key) => {
      if (key === createKey()) close()
      toast.success(
        created.status === 'draft'
          ? 'Added as a draft — announce it when the night is confirmed.'
          : 'Show added — it is on the site now.',
      )
      await queryClient.invalidateQueries({ queryKey: ['tenant-shows', props.slug] })
    },
  }))

  return (
    <Dialog
      open={props.open}
      onClose={close}
      label="Add show"
      title="Add show"
      description="The night as you know it — checklists, gig planning and the report pick it up from here. Uncheck 'announce' to keep it a draft."
      class="max-w-2xl"
      footer={<>
        <span class="mr-auto text-xs text-muted-foreground" aria-live="polite">
          {ready() ? 'Ready to save.' : 'Title and a start time are required.'}
        </span>
        <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
        <Button size="sm" writes onClick={() => create.mutate(createKey())} disabled={create.isPending || !ready()}>
          {create.isPending && <Spinner />} {create.isPending ? 'Adding…' : 'Add show'}
        </Button>
      </>}
    >
      <Show when={create.error}>
        <ErrorCard class="mb-4">{create.error instanceof Error ? create.error.message : 'Could not add the show'}</ErrorCard>
      </Show>
      <FieldGrid>
        <Field label="Title" hint="As it appears on the poster — e.g. Live in Warszawa.">
          <Input
            required maxlength="300" autocomplete="off"
            value={draft().title}
            onInput={e => set('title', e.currentTarget.value)}
            placeholder="Live in Warszawa"
          />
        </Field>
        <Field
          label="Starts"
          hint={Intl.DateTimeFormat().resolvedOptions().timeZone || 'local timezone'}
        >
          <Input
            required type="datetime-local"
            value={draft().startsAt}
            onInput={e => set('startsAt', e.currentTarget.value)}
          />
        </Field>
        <Field label="Doors" hint="Optional — earlier than the start.">
          <Input
            type="datetime-local"
            value={draft().doorsAt}
            onInput={e => set('doorsAt', e.currentTarget.value)}
          />
        </Field>
        <Field label="Ends" hint="Optional — curfew or expected end.">
          <Input
            type="datetime-local"
            value={draft().endsAt}
            onInput={e => set('endsAt', e.currentTarget.value)}
          />
        </Field>
        <Field label="Venue" hint="Optional — the room's name, e.g. Progresja.">
          <Input
            maxlength="500" autocomplete="off"
            value={draft().venue}
            onInput={e => set('venue', e.currentTarget.value)}
            placeholder="Progresja"
          />
        </Field>
        <Field label="Venue address" hint="Optional — street and number.">
          <Input
            maxlength="500" autocomplete="off"
            value={draft().venueAddress}
            onInput={e => set('venueAddress', e.currentTarget.value)}
            placeholder="Fort Wola 22"
          />
        </Field>
        <Field
          label="City"
          hint="Optional — with a country code, or leave both empty."
          error={!cityOk() ? 'City needs its two-letter country code.' : undefined}
        >
          <Input
            maxlength="200" autocomplete="off"
            aria-invalid={!cityOk()}
            value={draft().cityName}
            onInput={e => set('cityName', e.currentTarget.value)}
            placeholder="Warszawa"
          />
        </Field>
        <Field label="Country code" hint="ISO alpha-2 — PL, DE, CZ…">
          <Input
            maxlength="2" autocomplete="off"
            aria-invalid={!cityOk()}
            value={draft().cityCountry}
            onInput={e => set('cityCountry', e.currentTarget.value.toUpperCase())}
            placeholder="PL"
          />
        </Field>
        <Field
          label="Ticket URL"
          hint="Optional — https only; it becomes the door link."
          error={!ticketOk() ? 'Ticket links start with https://' : undefined}
        >
          <Input
            type="url" maxlength="2048" autocomplete="off"
            aria-invalid={!ticketOk()}
            value={draft().ticketUrl}
            onInput={e => set('ticketUrl', e.currentTarget.value)}
            placeholder="https://tickets.example/yourband"
          />
        </Field>
      </FieldGrid>
      <Checkbox
        class="mt-4"
        label="Announce on the public site now — unchecked keeps it a draft only the console sees."
        checked={draft().publish}
        onChange={checked => set('publish', checked === true)}
      />
    </Dialog>
  )
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))

const daysUntil = (iso: string) => {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`
}

/** The room's name as the registry knows it, else the event's own venue text
 *  when that is not just the title or tour repeated. */
const roomOf = (show: TenantShow) =>
  show.room ?? (show.venue && show.venue !== show.title ? show.venue : null)

/** One upcoming night: where, when, how far off, and the two numbers that say
 *  whether it will sell — tickets against capacity and fans who asked. */
function UpcomingCard(props: { show: TenantShow; slug: string }) {
  const sold = () => props.show.tickets_sold
  const cap = () => props.show.capacity
  const share = () => (sold() != null && cap() ? Math.min(100, Math.round((sold()! / cap()!) * 100)) : 0)
  return (
    <Link
      to="/tenants/$slug/shows/$eventSlug"
      params={{ slug: props.slug, eventSlug: props.show.slug }}
      class="group block rounded-lg border border-border bg-background p-4 transition-colors hover:border-foreground/30"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="truncate text-base font-medium text-foreground group-hover:underline">{props.show.city ?? props.show.title}</span>
            <Show when={props.show.status === 'draft'}><Badge variant="warning">not announced</Badge></Show>
          </div>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {[shortDate(props.show.starts_at), roomOf(props.show), props.show.city ? props.show.title : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span class="shrink-0 text-sm font-medium tabular-nums text-foreground">{daysUntil(props.show.starts_at)}</span>
      </div>
      <div class="mt-3 flex items-center gap-3">
        <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary" style={{ width: `${share()}%` }} />
        </div>
        <span class="shrink-0 text-xs text-muted-foreground">
          {sold() == null ? 'no ticket sale' : `${sold()} ${cap() ? `of ${cap()}` : ''} tickets`}
          {` · ${props.show.interested ?? 0} interested`}
        </span>
      </div>
    </Link>
  )
}

/** One played night: date, where, and whether the door was measured. */
function PlayedRow(props: { show: TenantShow; slug: string }) {
  const measured = () => (props.show.door_campaigns ?? 0) > 0
  return (
    <Link
      to="/tenants/$slug/shows/$eventSlug/report"
      params={{ slug: props.slug, eventSlug: props.show.slug }}
      class="group flex items-center gap-3 border-t border-border py-2.5 text-sm first:border-t-0"
    >
      <span class="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(props.show.starts_at)}</span>
      <span class="min-w-0 flex-1 truncate text-foreground group-hover:underline">
        {[props.show.city, roomOf(props.show)].filter(Boolean).join(' · ') || props.show.title}
      </span>
      <span class={`shrink-0 text-xs ${measured() ? 'text-foreground' : 'text-muted-foreground'}`}>
        {measured() ? `${props.show.scan_count} scanned` : 'no door scan'}
      </span>
    </Link>
  )
}
