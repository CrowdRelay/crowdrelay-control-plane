import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { TenantShow } from '../lib/types'
import { PageShell, PageHeader, ErrorCard, TabBar, TabPanel, useTabPanels } from '../components/layout'
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
import { formatIsoUntil, formatTimestamp } from '../lib/format'

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
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('nights', ['nights', 'booking'])
  const [adding, setAdding] = createSignal(false)

  const upcoming = createMemo(() => (model.data?.events ?? []).filter(event => event.upcoming))
  const past = createMemo(() => (model.data?.events ?? []).filter(event => !event.upcoming))

  return (
    <PageShell>
      <PageHeader
        eyebrow={authState.isPlatformLevel() ? 'TENANT' : undefined}
        title="Shows"
        description="Every gig in one place — what's next, what happened, and what the room scanned."
        actions={
          <Button size="sm" writes onClick={() => setAdding(true)}>
            Add show
          </Button>
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
        {data => (
          <>
            <Show
              when={data().events.length > 0}
              fallback={
                <EmptyState
                  label="No shows yet"
                  hint="Add a show above — or publish a gig in CrowdRelay — and it lands here: announced, played, everything the room scanned."
                />
              }
            >
              <section class="mb-6">
                <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Next up</h2>
                <Show
                  when={upcoming().length > 0}
                  fallback={<p class="text-sm text-muted-foreground px-1 py-2">Nothing announced.</p>}
                >
                  <div class="flex flex-col gap-2">
                    <For each={upcoming()}>{show => <ShowRow show={show} slug={params().slug} />}</For>
                  </div>
                </Show>
              </section>

              <section>
                <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Past</h2>
                <Show
                  when={past().length > 0}
                  fallback={<p class="text-sm text-muted-foreground px-1 py-2">No played shows in the last ninety days.</p>}
                >
                  <div class="flex flex-col gap-2">
                    <For each={past()}>{show => <ShowRow show={show} slug={params().slug} />}</For>
                  </div>
                </Show>
              </section>
            </Show>
          </>
        )}
      </Show>
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

function ShowRow(props: { show: TenantShow; slug: string }) {
  return (
    <Link
      to="/tenants/$slug/shows/$eventSlug"
      params={{ slug: props.slug, eventSlug: props.show.slug }}
      class="flex items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:bg-card"
    >
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <div class="text-sm font-medium text-foreground truncate">{props.show.title}</div>
          <Show when={props.show.status === 'draft'}>
            <span class="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              draft
            </span>
          </Show>
        </div>
        <div class="text-xs text-muted-foreground mt-0.5">
          {formatTimestamp(props.show.starts_at)}
          {props.show.venue ? ` · ${props.show.venue}` : ''}
        </div>
      </div>
      <div class="text-right shrink-0">
        <Show
          when={!props.show.upcoming}
          fallback={<div class="text-sm font-medium text-foreground">{formatIsoUntil(props.show.starts_at)}</div>}
        >
          <div class="text-sm font-medium text-foreground tabular-nums">{props.show.scan_count}</div>
          <div class="text-xs text-muted-foreground">scans</div>
        </Show>
      </div>
    </Link>
  )
}
