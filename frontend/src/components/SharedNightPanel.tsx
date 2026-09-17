import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { NightContributionKind, SharedNight } from '../lib/types'
import { readOnly } from '../lib/read-only'
import { errorMessage, formatTimestamp } from '../lib/format'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { NativeSelect } from './ui/native-select'
import { Badge } from './app/badge'

/** The shared night (4V.6b): one room's date that every tenant's event can
 * point at. What each side sees is the lens upstream derived from its
 * relationship — this block edits only what the tenant's own workspace
 * contributes; nothing here can name another act's terms or draw. */

const KIND_LABEL: Record<NightContributionKind, string> = {
  draw_estimate: 'Draw estimate',
  announce_status: 'Announcement',
  asks: 'Co-promotion asks',
  terms: 'Terms',
}

/** The kinds the workspace already publishes — `contributions.own` is the
 * upstream's own list of active kind names. */
function ownKinds(night: SharedNight): Set<NightContributionKind> {
  return new Set((night.contributions?.own ?? []) as NightContributionKind[])
}

export function SharedNightPanel(props: { slug: string; placeEventId: string }) {
  const queryClient = useQueryClient()
  const night = useQuery(() => ({
    queryKey: ['shared-night', props.slug, props.placeEventId],
    queryFn: () => api.night(props.slug, props.placeEventId),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  }))
  const [flash, setFlash] = createSignal('')
  const [copied, setCopied] = createSignal(false)

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['shared-night', props.slug, props.placeEventId] })

  const contribute = useMutation(() => ({
    mutationFn: (input: { kind: NightContributionKind; value: Record<string, unknown> }) =>
      api.nightContribute(props.slug, props.placeEventId, input.kind, input.value),
    onSuccess: async () => {
      await refresh()
      setFlash('Published to the shared night.')
    },
  }))
  const revokeContribution = useMutation(() => ({
    mutationFn: (kind: NightContributionKind) => api.nightRevokeContribution(props.slug, props.placeEventId, kind),
    onSuccess: async () => {
      await refresh()
      setFlash('Contribution withdrawn.')
    },
  }))
  const mintLink = useMutation(() => ({
    mutationFn: () => api.nightMintOrganiserLink(props.slug, props.placeEventId),
    onSuccess: async () => {
      await refresh()
      setFlash('Organiser link minted — every link sent before this one is dead.')
    },
  }))
  const revokeLink = useMutation(() => ({
    mutationFn: () => api.nightRevokeOrganiserLink(props.slug, props.placeEventId),
    onSuccess: async () => {
      await refresh()
      setFlash('Organiser link revoked.')
    },
  }))
  const confirmAct = useMutation(() => ({
    mutationFn: (actSlug: string) => api.nightConfirmAct(props.slug, props.placeEventId, actSlug),
    onSuccess: async () => {
      await refresh()
      setFlash('Act confirmed on the bill.')
    },
  }))

  const mutationError = () =>
    contribute.error ?? revokeContribution.error ?? mintLink.error ?? revokeLink.error ?? confirmAct.error

  const linkUrl = (token: string) => `${window.location.origin}/nights/${props.slug}/${token}`
  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(linkUrl(token))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // The band-side lenses carry the edit surface; a co-billed read gets the
  // same block but only the public halves.
  const bandSide = () => night.data?.lens === 'own_band' || night.data?.lens === 'roster'

  return (
    <Show when={night.data} fallback={
      <Show when={!night.isLoading}>
        <div class="mb-3 rounded-lg border border-border bg-background px-4 py-2.5">
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shared night</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {night.error ? errorMessage(night.error, 'The shared night is unavailable.') : ''}
          </p>
        </div>
      </Show>
    }>
      {data => (
        <div class="mb-3 rounded-lg border border-border bg-background px-4 py-2.5">
          <div class="flex items-baseline justify-between gap-2">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shared night</p>
            <div class="flex items-center gap-1.5">
              <For each={Object.entries(data().status)}>
                {([status, count]) => (
                  <Badge variant={status === 'cancelled' ? 'muted' : 'default'}>
                    {status} · {count}
                  </Badge>
                )}
              </For>
            </div>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            {data().venue.display_name} · {data().venue.city_name} · {data().event_date}
          </p>

          {/* The night's bill across every tenant that points at it. `mine`
              names the caller's own acts; confirmation only counts when the
              act's own workspace signed. */}
          <div class="mt-2">
            <For each={data().lineup}>
              {act => (
                <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span class="w-4 shrink-0 text-right tabular-nums">{act.position + 1}.</span>
                  <span class="text-foreground">{act.name}</span>
                  <Show when={act.mine}>
                    <Badge variant="outline">ours</Badge>
                  </Show>
                  <Show when={act.confirmed} fallback={<Badge variant="muted">unconfirmed</Badge>}>
                    <Badge variant="success">confirmed</Badge>
                  </Show>
                  <Show when={act.mine && !act.confirmed}>
                    <Button
                      variant="outline"
                      class="h-6 px-2 text-xs"
                      disabled={readOnly() || confirmAct.isPending}
                      onClick={() => confirmAct.mutate(act.act_slug)}
                    >
                      Confirm
                    </Button>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <Show when={bandSide()}>
            <ContributionEditor
              night={data()}
              pending={contribute.isPending}
              disabled={readOnly()}
              onContribute={(kind, value) => contribute.mutate({ kind, value })}
              onRevoke={kind => revokeContribution.mutate(kind)}
              revoking={revokeContribution.isPending}
            />
            <Show when={data().own_terms !== undefined}>
              <p class="mt-2 text-xs text-muted-foreground">
                {data().own_terms
                  ? `Our terms on file: ${data().own_terms?.amount_minor ?? 0} ${data().own_terms?.currency ?? ''} (minor units — only the night's total reaches the organiser).`
                  : 'No terms contributed — the organiser sees only the sum of what acts publish.'}
              </p>
            </Show>
            <Show when={data().draw_split}>
              {split => (
                <p class="mt-1 text-xs text-muted-foreground">
                  Draw split — ours {split().ours.toLocaleString()} reachable, the rest of the bill {split().rest.toLocaleString()}.
                </p>
              )}
            </Show>

            {/* The organiser link: the bearer the band hands the promoter.
                Minting rotates — every link sent before dies on the new one. */}
            <div class="mt-3 border-t border-border pt-3">
              <p class="text-xs font-medium text-foreground">Organiser link</p>
              <Show
                when={data().organiser_link}
                fallback={
                  <div class="mt-1.5 flex items-center gap-2">
                    <Button
                      variant="outline"
                      class="h-7 px-2 text-xs"
                      disabled={readOnly() || mintLink.isPending}
                      onClick={() => mintLink.mutate()}
                    >
                      {mintLink.isPending ? 'Minting…' : 'Mint link'}
                    </Button>
                    <span class="text-xs text-muted-foreground">
                      No live link — the promoter sees the night's sums, never an act's terms.
                    </span>
                  </div>
                }
              >
                {link => (
                  <div class="mt-1.5">
                    <div class="flex items-center gap-2">
                      <code class="min-w-0 flex-1 truncate rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
                        {linkUrl(link().token)}
                      </code>
                      <Button variant="outline" class="h-7 px-2 text-xs" onClick={() => void copyLink(link().token)}>
                        {copied() ? 'Copied' : 'Copy'}
                      </Button>
                      <Button
                        variant="outline"
                        class="h-7 px-2 text-xs"
                        disabled={readOnly() || mintLink.isPending}
                        onClick={() => mintLink.mutate()}
                        title="Mint a fresh link — the old one dies"
                      >
                        Rotate
                      </Button>
                      <Button
                        variant="ghost"
                        class="h-7 px-2 text-xs hover:text-destructive-foreground"
                        disabled={readOnly() || revokeLink.isPending}
                        onClick={() => revokeLink.mutate()}
                      >
                        Revoke
                      </Button>
                    </div>
                    <p class="mt-1 text-xs text-muted-foreground">
                      Live until {formatTimestamp(link().expires_at)} — rotating kills every link already sent.
                    </p>
                  </div>
                )}
              </Show>
            </div>
          </Show>

          {/* CoBilled's public halves — contributed announce states and the
              asks other workspaces published. Draw and terms never appear. */}
          <Show when={data().public_announce && data().public_announce!.length > 0}>
            <div class="mt-2">
              <For each={data().public_announce ?? []}>
                {row => (
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    {row.act ?? 'An unnamed act'} — {row.state}
                  </p>
                )}
              </For>
            </div>
          </Show>
          <Show when={data().asks && data().asks!.length > 0}>
            <div class="mt-2">
              <For each={data().asks ?? []}>
                {ask => (
                  <div class="mt-1 text-xs text-muted-foreground">
                    <For each={ask.items}>{item => <p>· {item}</p>}</For>
                    <Show when={ask.from_acts.length > 0}>
                      <p class="text-xs">from {ask.from_acts.join(', ')}</p>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={flash()}>
            <p class="mt-2 text-xs text-muted-foreground">{flash()}</p>
          </Show>
          <Show when={mutationError()}>
            {error => <p class="mt-2 text-xs text-destructive-foreground">{errorMessage(error(), 'The write failed.')}</p>}
          </Show>
        </div>
      )}
    </Show>
  )
}

/** The four contribute controls — one row each, publishing into the shared
 * view on the workspace's own word. Each kind already contributed shows a
 * revoke; the forms mirror the domain's shapes loosely and let upstream's
 * validator be the authority. */
function ContributionEditor(props: {
  night: SharedNight
  pending: boolean
  disabled: boolean
  revoking: boolean
  onContribute: (kind: NightContributionKind, value: Record<string, unknown>) => void
  onRevoke: (kind: NightContributionKind) => void
}) {
  const own = () => ownKinds(props.night)
  const [reachable, setReachable] = createSignal('')
  const [expectedDraw, setExpectedDraw] = createSignal('')
  const [announceState, setAnnounceState] = createSignal('planned')
  const [asksText, setAsksText] = createSignal('')
  const [amountMinor, setAmountMinor] = createSignal('')
  const [currency, setCurrency] = createSignal('PLN')

  const nonnegInt = (raw: string) => {
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 ? n : null
  }

  const drawValue = () => {
    const fans = nonnegInt(reachable())
    if (fans === null) return null
    const draw = expectedDraw().trim()
    if (draw === '') return { reachable_fans: fans, expected_draw: null }
    const expected = nonnegInt(draw)
    return expected === null ? null : { reachable_fans: fans, expected_draw: expected }
  }

  const asksValue = () => {
    const items = asksText().split('\n').map(line => line.trim()).filter(line => line.length > 0)
    if (items.length === 0 || items.length > 8 || items.some(item => item.length > 500)) return null
    return { items }
  }

  const termsValue = () => {
    const amount = Number(amountMinor())
    const cur = currency().trim().toUpperCase()
    if (!Number.isInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(cur)) return null
    return { amount_minor: amount, currency: cur }
  }

  return (
    <div class="mt-3 border-t border-border pt-3">
      <p class="text-xs font-medium text-foreground">What we publish</p>
      <p class="mt-0.5 text-xs text-muted-foreground">
        Nothing crosses the workspace boundary until it is contributed here — and every kind can be withdrawn.
        {props.night.contributions && props.night.contributions.shared_by_others > 0
          ? ` ${props.night.contributions.shared_by_others} other workspace${props.night.contributions.shared_by_others === 1 ? '' : 's'} on this night are sharing.`
          : ''}
      </p>
      <fieldset class="contents" disabled={props.disabled}>
        {/* draw_estimate */}
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <KindTag kind="draw_estimate" active={own().has('draw_estimate')} onRevoke={props.onRevoke} revoking={props.revoking} />
          <Input class="w-32" placeholder="reachable fans" value={reachable()} onInput={e => setReachable(e.currentTarget.value)} />
          <Input class="w-32" placeholder="expected draw" value={expectedDraw()} onInput={e => setExpectedDraw(e.currentTarget.value)} />
          <Button
            class="h-7 px-2 text-xs"
            disabled={props.pending || drawValue() === null}
            onClick={() => props.onContribute('draw_estimate', drawValue()!)}
          >
            Publish
          </Button>
        </div>
        {/* announce_status */}
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <KindTag kind="announce_status" active={own().has('announce_status')} onRevoke={props.onRevoke} revoking={props.revoking} />
          <NativeSelect class="h-7 w-36 text-xs" value={announceState()} onChange={e => setAnnounceState(e.currentTarget.value)}>
            <option value="planned">planned</option>
            <option value="announced">announced</option>
            <option value="done">done</option>
          </NativeSelect>
          <Button
            class="h-7 px-2 text-xs"
            disabled={props.pending}
            onClick={() => props.onContribute('announce_status', { state: announceState() })}
          >
            Publish
          </Button>
        </div>
        {/* asks */}
        <div class="mt-2">
          <div class="flex items-center gap-2">
            <KindTag kind="asks" active={own().has('asks')} onRevoke={props.onRevoke} revoking={props.revoking} />
            <Button
              class="h-7 px-2 text-xs"
              disabled={props.pending || asksValue() === null}
              onClick={() => props.onContribute('asks', asksValue()!)}
            >
              Publish
            </Button>
          </div>
          <Textarea
            class="mt-1.5 w-full text-xs"
            rows={2}
            placeholder="One ask per line — up to 8, public to the other acts on this bill"
            value={asksText()}
            onInput={e => setAsksText(e.currentTarget.value)}
          />
        </div>
        {/* terms */}
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <KindTag kind="terms" active={own().has('terms')} onRevoke={props.onRevoke} revoking={props.revoking} />
          <Input class="w-32" placeholder="amount, minor" value={amountMinor()} onInput={e => setAmountMinor(e.currentTarget.value)} />
          <Input
            class="w-20 font-mono text-xs uppercase"
            placeholder="PLN"
            value={currency()}
            onInput={e => setCurrency(e.currentTarget.value.toUpperCase())}
          />
          <Button
            class="h-7 px-2 text-xs"
            disabled={props.pending || termsValue() === null}
            onClick={() => props.onContribute('terms', termsValue()!)}
          >
            Publish
          </Button>
          <span class="text-xs text-muted-foreground">the organiser reads the sum, never this line</span>
        </div>
      </fieldset>
    </div>
  )
}

/** The kind's name plus its live state — a published kind carries a revoke
 * chip so "contributed" never reads as permanent. */
function KindTag(props: {
  kind: NightContributionKind
  active: boolean
  revoking: boolean
  onRevoke: (kind: NightContributionKind) => void
}) {
  return (
    <span class="flex w-36 items-center gap-1.5 text-xs text-foreground">
      {KIND_LABEL[props.kind]}
      <Show when={props.active}>
        <Badge variant="success">live</Badge>
        <Button
          variant="ghost"
          class="h-5 px-1 text-xs hover:text-destructive-foreground"
          disabled={props.revoking}
          onClick={() => props.onRevoke(props.kind)}
          title="Withdraw this contribution"
        >
          ×
        </Button>
      </Show>
    </span>
  )
}
