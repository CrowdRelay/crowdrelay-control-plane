import { For, Show, createSignal, onMount } from 'solid-js'
import { api } from '../lib/api'
import type { SharedNight } from '../lib/types'

/** `/nights/{slug}/{token}` — the organiser lens on one shared night
 * (4V.6b). No session, no shell chrome: the bearer token is the whole
 * credential, the slug names the tenant that minted it, and a dead link is
 * the same not-found as a token that never existed.
 *
 * The reader is a stranger on a phone with thirty seconds. The order is
 * theirs: what is this → is it still on → who plays → what the bill can
 * bring → what the acts said. Nothing scrolls sideways at 375px. */

/** The night's events rolled up by status, as a stranger reads them —
 * 'published' is what the room announced, 'completed' is a night that
 * happened, 'cancelled' must be louder than the rest. */
const STATUS_LABEL: Record<string, string> = {
  published: 'Announced',
  completed: 'Played',
  cancelled: 'Cancelled',
}

/** The contributed announce states — `planned|announced|done` upstream,
 * phrased for a reader who does not know the schema. */
const ANNOUNCE_LABEL: Record<string, string> = {
  planned: 'plans to announce',
  announced: 'announced the night',
  done: 'posted about it',
}

export default function PublicNightPage(props: { slug: string; token: string }) {
  const [night, setNight] = createSignal<SharedNight | null>(null)
  const [failed, setFailed] = createSignal(false)

  onMount(() => {
    api
      .publicNight(props.slug, props.token)
      .then(setNight)
      .catch(() => setFailed(true))
  })

  const money = (minor: number | null | undefined) =>
    minor == null ? null : `${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`

  const nightDate = (iso: string) => {
    const date = new Date(`${iso}T00:00:00Z`)
    return Number.isNaN(date.getTime())
      ? iso
      : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  }

  const statusBadges = (status: Record<string, number>) =>
    Object.entries(status).map(([key, count]) => ({
      key,
      count,
      label: STATUS_LABEL[key] ?? key.replaceAll('_', ' '),
      cancelled: key === 'cancelled',
    }))

  return (
    <div class="mx-auto max-w-xl px-5 py-10"><div class="rounded-xl border border-border bg-card px-4 py-3.5">
      <Show when={night()} fallback={
        <Show when={failed()} fallback={<p class="text-sm text-muted-foreground">Loading…</p>}>
          <p class="text-sm text-muted-foreground">
            This link does not resolve — it may have been rotated, revoked, or expired.
          </p>
        </Show>
      }>
        {data => (
          <>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">A shared night</p>
            <h1 class="m-0 mt-1 text-xl font-medium text-foreground">
              {data().venue.display_name} · {data().venue.city_name}
            </h1>
            <p class="mt-0.5 text-sm text-muted-foreground">{nightDate(data().event_date)}</p>

            <Show when={statusBadges(data().status ?? {}).length > 0 || countdown(data().event_date)}>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <Show when={countdown(data().event_date)}>
                  {label => <span class="rounded-full bg-info-foreground/15 px-2 py-0.5 text-xs font-medium text-info-foreground">{label()}</span>}
                </Show>
                <For each={statusBadges(data().status ?? {})}>
                  {badge => (
                    <span
                      class={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        badge.cancelled
                          ? 'bg-error-foreground/15 text-error-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {badge.count > 1 ? `${badge.count}× ` : ''}{badge.label}
                    </span>
                  )}
                </For>
              </div>
            </Show>

            <Show when={(data().lineup ?? []).length > 0}>
              <div class="mt-5">
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">The bill</p>
                <For each={data().lineup}>
                  {act => (
                    <div class="mt-1.5 flex items-baseline gap-2 text-sm">
                      <span class="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{act.position + 1}.</span>
                      <span class="text-foreground">{act.name}</span>
                      <span class="text-xs text-muted-foreground">{act.confirmed ? 'confirmed' : ''}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Sums only — a per-act part cannot appear on this lens because
                the payload never selects one. Every cell reads as a number
                or '—'; zero is a number, absent is a fact about consent. */}
            <div class="mt-5 grid grid-cols-2 gap-2.5">
              <Fact label="People the bill can reach" value={data().combined_reachable?.toLocaleString() ?? '—'} />
              <Fact
                label="Tickets sold"
                value={data().tickets_sold == null ? '—' : `${data().tickets_sold!.toLocaleString()}${data().capacity != null ? ` of ${data().capacity!.toLocaleString()}` : ''}`}
              />
              <Fact label="Room capacity" value={data().capacity?.toLocaleString() ?? '—'} />
              <Fact label="Payout to the bill" value={money(data().payout_total_minor) ?? '—'} />
            </div>

            <Show when={(data().announce ?? []).length > 0}>
              <div class="mt-5">
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">What the acts posted</p>
                <For each={data().announce ?? []}>
                  {row => (
                    <p class="mt-1 text-sm text-muted-foreground">
                      {row.act ?? 'An unnamed act'} — {ANNOUNCE_LABEL[row.state] ?? row.state.replaceAll('_', ' ')}
                    </p>
                  )}
                </For>
              </div>
            </Show>

            <p class="mt-8 text-xs leading-relaxed text-muted-foreground">
              Shared by the acts on this bill. Sums only — no act's own list is shown
              to the others, and every figure is what an act chose to publish.
            </p>
          </>
        )}
      </Show>
    </div></div>
  )
}

/** Days until the night, in words; null once it has passed. The night is a
 *  UTC date, so "today" is the date itself, not a 24-hour window. */
function countdown(isoDate: string): string | null {
  const night = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(night)) return null
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  const days = Math.round((night - today) / 86_400_000)
  if (days < 0) return null
  if (days === 0) return 'Tonight'
  return days === 1 ? '1 day to go' : `${days} days to go`
}

function Fact(props: { label: string; value: string }) {
  return (
    <div class="min-w-0 rounded-lg bg-muted/55 px-3.5 py-3">
      <p class="m-0 text-xs text-muted-foreground">{props.label}</p>
      <p class="m-0 mt-0.5 break-words text-2xl font-medium tabular-nums text-foreground">{props.value}</p>
    </div>
  )
}
