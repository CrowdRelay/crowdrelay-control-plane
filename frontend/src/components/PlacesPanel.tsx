import { For, Show, createSignal } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { PanelTitle } from './layout'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './ui/empty-state'
import { SkeletonSection } from './Skeleton'
import { SectionFailureCard } from './SectionFailureCard'
import { Card } from './app/card'
import { Badge } from './app/badge'
import { Button } from './app/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import type { CityFunnelRow, CityVenueRow } from '../lib/types'

// Where the fans are, and the rooms near them.
//
// Sprint 4 shipped five read models about place — the city funnel, its
// organise-now ranking, and the shared venue registry — and shipped no screen
// for any of them. Six registered routes across two services answered
// questions nobody could see, which is the same as not having answered them.
//
// This is the whole visible output of that sprint, on one tab. It is
// deliberately two tables rather than a dashboard: the questions are "which
// city next" and "what rooms are there", and both are answered by sorting a
// list.

/** A missing number reads as "—", never as 0.
 *
 *  This matters more here than on most panels. `typical_draw` is null when no
 *  marked show at a room sold tickets through us — an unmeasured night, not an
 *  empty one — and rendering that as 0 would rank a room nobody has measured
 *  below a room that genuinely draws nobody. */
const count = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString()

const draw = (value: number | null) => (value == null ? '—' : Math.round(value).toLocaleString())

/** Months since the last show, with "never" kept distinct from "a long time".
 *
 *  A band that has never played a city and a band that played it two years ago
 *  need opposite things — an introduction versus a reason to come back — so the
 *  two never collapse into one string. */
const lastPlayed = (row: CityFunnelRow) => {
  if (row.last_show_at == null) return 'never played'
  if (row.months_since_show == null) return 'played, date unclear'
  if (row.months_since_show === 0) return 'this month'
  return `${row.months_since_show} mo ago`
}

/** The organise score as a plain word.
 *
 *  Basis points are how the domain computes it and not how a person reads it.
 *  The bands are coarse because the score's own inputs are coarse; showing
 *  "6,840" would imply a precision the formula does not have. */
const organiseBand = (bp: number): { label: string; variant: 'success' | 'warning' | 'muted' } => {
  if (bp >= 6_000) return { label: 'organise now', variant: 'success' }
  if (bp >= 3_000) return { label: 'worth a look', variant: 'warning' }
  return { label: 'not yet', variant: 'muted' }
}

export function PlacesPanel(props: { slug: string }) {
  const [order, setOrder] = createSignal<'organise' | undefined>('organise')

  const funnel = useQuery(() => ({
    queryKey: ['city-funnel', props.slug, order()],
    queryFn: () => api.cityFunnel(props.slug, order()),
    reconcile: 'city_slug',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const venues = useQuery(() => ({
    queryKey: ['city-venues', props.slug],
    queryFn: () => api.cityVenues(props.slug),
    reconcile: 'venue_id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  return (
    <>
      <Card class="mb-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <PanelTitle icon={<SectionIcon name="map-pin" />}>Cities</PanelTitle>
            <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
              Where the fans already are, and whether anything is booked there.
              Reachable means consented and inside the radius they chose — the
              people we could actually tell about a show.
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={order() === 'organise'}
              class={`h-7 px-2 text-xs ${order() === 'organise' ? 'border-primary text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setOrder('organise')}
            >
              Ranked
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={order() === undefined}
              class={`h-7 px-2 text-xs ${order() === undefined ? 'border-primary text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setOrder(undefined)}
            >
              By activity
            </Button>
          </div>
        </div>
        <Show when={funnel.error}>
          <SectionFailureCard
            error={funnel.error}
            fallback={authState.isPlatformLevel() ? 'City funnel unavailable' : 'The cities'}
            onRetry={() => void funnel.refetch()}
          />
        </Show>
        <Show when={!funnel.error && !funnel.data}>
          <SkeletonSection titleWidth="140px" lines={5} minHeight="200px" />
        </Show>
        <Show when={funnel.data}>
          {rows => (
            <Show
              when={rows().length > 0}
              fallback={
                <EmptyState
                  label="No cities yet"
                  hint="A city appears once a fan there says where they are. Nothing here means nobody has told us where they live, not that nobody is out there."
                />
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>City</TableHead>
                    <TableHead class="text-right">Fans</TableHead>
                    <TableHead class="text-right">Reachable</TableHead>
                    <TableHead class="text-right">Active 30d</TableHead>
                    <TableHead>Last show</TableHead>
                    <TableHead>What's there</TableHead>
                    <TableHead>Verdict</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={rows()}>
                    {(row: CityFunnelRow) => {
                      const band = organiseBand(row.organise_score_bp)
                      return (
                        <TableRow>
                          <TableCell>
                            {/* N.12 — the city opens as its own page. */}
                            <Link
                              to="/tenants/$slug/cities/$cityId"
                              params={{ slug: props.slug, cityId: row.city_slug }}
                              class="text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                            >
                              {row.city_name}
                            </Link>
                            <span class="ml-1 text-xs text-muted-foreground">{row.country_code}</span>
                          </TableCell>
                          <TableCell class="text-right tabular-nums">{count(row.fans)}</TableCell>
                          <TableCell class="text-right tabular-nums">{count(row.reachable)}</TableCell>
                          <TableCell class="text-right tabular-nums">{count(row.active_30d)}</TableCell>
                          <TableCell class="text-xs text-muted-foreground">{lastPlayed(row)}</TableCell>
                          <TableCell class="text-xs text-muted-foreground">
                            {/* Confirmed, contactable supply — not candidates
                                awaiting screening. "What's there" has to mean
                                what we could write to this week. */}
                            {row.venues} venues · {row.promoters} promoters · {row.festivals} festivals
                          </TableCell>
                          <TableCell>
                            <Badge variant={band.variant}>{band.label}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    }}
                  </For>
                </TableBody>
              </Table>
            </Show>
          )}
        </Show>
      </Card>

      <Card>
        <div class="flex items-start justify-between gap-3">
          <div>
            <PanelTitle icon={<SectionIcon name="map-pin" />}>Rooms</PanelTitle>
            <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
              {authState.isPlatformLevel()
                ? "Every room any tenant's played or completed show has marked, with what it draws. Aggregated across tenants — the count of contributors never names one."
                : "Every room any act's played or completed show has marked, with what it draws. Aggregated across acts — the count of contributors never names one."}
            </p>
          </div>
          <VerifyRegistryButton slug={props.slug} />
        </div>
        <Show when={venues.error}>
          <SectionFailureCard
            error={venues.error}
            fallback={authState.isPlatformLevel() ? 'Venue registry unavailable' : 'The rooms'}
            onRetry={() => void venues.refetch()}
          />
        </Show>
        <Show when={!venues.error && !venues.data}>
          <SkeletonSection titleWidth="140px" lines={5} minHeight="200px" />
        </Show>
        <Show when={venues.data}>
          {rows => (
            <Show
              when={rows().length > 0}
              fallback={
                <EmptyState
                  label="No rooms on record"
                  hint="A room appears here when a published or completed show names it. Logging past shows fills this in — the registry builds itself from the calendar."
                />
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead class="text-right">Shows played</TableHead>
                    <TableHead class="text-right">Typical draw</TableHead>
                    <TableHead class="text-right">Regulars</TableHead>
                    <TableHead class="text-right">Bands</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={rows()}>
                    {(row: CityVenueRow) => (
                      <TableRow>
                        <TableCell class="text-foreground">
                          {row.display_name}
                          {/* §12-1: the venue answer is a sentence, not a
                              score — the because-list when the evidence
                              carries one, the honest refusal when it does
                              not. A stale server sends neither field and
                              the room just shows its name. */}
                          <Show when={row.assessment === 'worth_contact'}>
                            <p class="m-0 mt-1 max-w-xs text-xs leading-relaxed font-normal text-muted-foreground">
                              {row.assessment_sentence}
                            </p>
                          </Show>
                          <Show when={row.assessment === 'insufficient_evidence'}>
                            <p class="m-0 mt-1 max-w-xs text-xs italic leading-relaxed font-normal text-muted-foreground/80">
                              {row.assessment_sentence}
                            </p>
                          </Show>
                          <Show when={row.assessment === 'closed'}>
                            <p class="m-0 mt-1 max-w-xs text-xs leading-relaxed font-normal text-warning-foreground">
                              {row.assessment_sentence}
                            </p>
                          </Show>
                          {/* not_assessed — the tenant's own facts could not
                              be read, so the sentence says so rather than
                              claiming a verdict the read could not support. */}
                          <Show when={row.assessment === 'not_assessed'}>
                            <p class="m-0 mt-1 max-w-xs text-xs italic leading-relaxed font-normal text-muted-foreground/60">
                              {row.assessment_sentence}
                            </p>
                          </Show>
                        </TableCell>
                        <TableCell class="text-xs text-muted-foreground">
                          <Link
                            to="/tenants/$slug/cities/$cityId"
                            params={{ slug: props.slug, cityId: row.city_slug }}
                            class="underline decoration-border underline-offset-4 hover:text-primary"
                          >
                            {row.city_name}
                          </Link>
                          {' '}{row.country_code}
                        </TableCell>
                        <TableCell class="text-right tabular-nums">
                          {count(row.shows_played)}
                          <Show when={row.shows_booked > 0}>
                            <span class="ml-1 text-xs text-muted-foreground">
                              +{row.shows_booked} booked
                            </span>
                          </Show>
                        </TableCell>
                        {/* Null draw is an unticketed night, not a night
                            nobody came to. */}
                        <TableCell class="text-right tabular-nums">{draw(row.typical_draw)}</TableCell>
                        <TableCell class="text-right tabular-nums">
                          {count(row.repeat_attenders)}
                        </TableCell>
                        <TableCell class="text-right tabular-nums">{count(row.contributors)}</TableCell>
                      </TableRow>
                    )}
                  </For>
                </TableBody>
              </Table>
            </Show>
          )}
        </Show>
      </Card>
    </>
  )
}

/** "Verify the registry" — the delegation loop run the other way.
 *
 *  The registry's entries are claims the world made; this button hands all
 *  three lists — rooms, bands, booking agents — to the operator's AI as a
 *  paste-ready prompt: is each entry still alive, and which active ones are
 *  missing. The answer sheets land back through the Drive intake upstream —
 *  a closed room stops being proposed, a dead band retires, an inactive
 *  agent deactivates. Fetched lazily: the brief only exists to
 *  be copied, so it is not part of the page's standing payload. */
function VerifyRegistryButton(props: { slug: string }) {
  const [copied, setCopied] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  // Null brief is an answer, not an error: no rooms on record means there is
  // nothing to verify.
  const [empty, setEmpty] = createSignal(false)

  const copy = () => {
    const clipboard = navigator.clipboard
    if (!clipboard) {
      setFailed(true)
      return
    }
    void api
      .registryVerificationBrief(props.slug)
      .then(({ brief }) => {
        setFailed(false)
        // Null brief is an answer, not an error: nothing on record means
        // there is nothing to verify.
        if (!brief) {
          setEmpty(true)
          return
        }
        setEmpty(false)
        return clipboard.writeText(brief).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      })
      .catch(() => setFailed(true))
  }

  return (
    <div class="shrink-0">
      <Button variant="outline" size="sm" class="h-7 px-2 text-xs" onClick={copy}>
        {copied() ? 'Copied' : 'Copy verification brief'}
      </Button>
      <Show when={failed()}>
        <p class="mt-1 max-w-xs text-xs text-destructive">
          {authState.isPlatformLevel()
            ? 'Could not fetch or copy the brief — check clipboard permissions.'
            : 'Could not fetch or copy the brief — try again in a moment.'}
        </p>
      </Show>
      <Show when={empty() && !failed()}>
        <p class="mt-1 max-w-xs text-xs text-muted-foreground">
          Nothing on record to verify yet.
        </p>
      </Show>
    </div>
  )
}
