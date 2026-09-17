import { For, Show, createSignal, onMount } from 'solid-js'
import { api } from '../lib/api'
import type { SharedNight } from '../lib/types'

/** `/nights/{slug}/{token}` — the organiser lens on one shared night
 * (4V.6b). No session, no shell chrome: the bearer token is the whole
 * credential, the slug names the tenant that minted it, and a dead link is
 * the same not-found as a token that never existed. */

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

  return (
    <div class="mx-auto max-w-xl px-5 py-10">
      <Show when={night()} fallback={
        <Show when={failed()} fallback={<p class="text-sm text-muted-foreground">Loading…</p>}>
          <p class="text-sm text-muted-foreground">
            This link does not resolve — it may have been rotated, revoked, or expired.
          </p>
        </Show>
      }>
        {data => (
          <>
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">The night</p>
            <h1 class="mt-1 text-xl font-semibold text-foreground">
              {data().venue.display_name} · {data().venue.city_name}
            </h1>
            <p class="mt-0.5 text-sm text-muted-foreground">{data().event_date}</p>

            <div class="mt-5">
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lineup</p>
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

            {/* Sums only — a per-act part cannot appear on this lens because
                the payload never selects one. */}
            <div class="mt-5 grid grid-cols-2 gap-3">
              <Fact label="Combined reach" value={data().combined_reachable?.toLocaleString() ?? '—'} />
              <Fact label="Tickets sold" value={data().tickets_sold?.toLocaleString() ?? '—'} />
              <Fact label="Room capacity" value={data().capacity?.toLocaleString() ?? '—'} />
              <Fact label="Payout total" value={money(data().payout_total_minor) ?? '—'} />
            </div>

            <Show when={(data().announce ?? []).length > 0}>
              <div class="mt-5">
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Announcements</p>
                <For each={data().announce ?? []}>
                  {row => (
                    <p class="mt-1 text-sm text-muted-foreground">
                      {row.act ?? 'An unnamed act'} — {row.state}
                    </p>
                  )}
                </For>
              </div>
            </Show>

            <p class="mt-8 text-xs text-muted-foreground">
              Shared by the acts on this bill. Figures are what each side chose to publish.
            </p>
          </>
        )}
      </Show>
    </div>
  )
}

function Fact(props: { label: string; value: string }) {
  return (
    <div class="rounded-lg border border-border bg-background px-3 py-2">
      <p class="text-xs uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <p class="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{props.value}</p>
    </div>
  )
}
