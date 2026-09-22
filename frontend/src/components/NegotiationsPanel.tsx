import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { currencyFractionDigits, errorMessage, money } from '../lib/format'
import { refreshQueries } from '../lib/refresh'
import { EmptyState } from './ui/empty-state'
import type { NegotiationEntry } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SkeletonPanel } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Button } from './app/button'
import { Input } from './ui/input'

const deadlineLabel = (iso: string) => {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  const hours = Math.round((at.getTime() - Date.now()) / 3_600_000)
  if (hours < 0) return 'window closed'
  if (hours < 24) return `${hours}h left`
  return `${Math.floor(hours / 24)}d left`
}

const floorBasisLabel = (basis: string) =>
  ({
    cost: 'the costed trip',
    market: 'the market evidence',
    counterparty_history: "their own last fee",
  })[basis] ?? basis

const settledLabel = (entry: NegotiationEntry) => {
  if (entry.state === 'accepted') return 'accepted'
  const reasons: Record<string, string> = {
    below_floor: 'below the floor',
    requires_contract: 'contract required',
    exclusive: 'exclusive ask',
    date_not_free: 'date not free',
    past_annual_stretch: 'past the stretch budget',
    stretch_score_too_low: 'score too low',
    cost_insufficient: 'below cost',
    promoter_withdrew: 'promoter withdrew',
    window_closed: 'window closed',
  }
  const why = entry.settled_reason ? (reasons[entry.settled_reason] ?? entry.settled_reason) : entry.state
  return `${entry.state} — ${why}`
}

const settledTone = (state: string): 'good' | 'bad' | 'muted' =>
  state === 'accepted' ? 'good' : state === 'declined' ? 'bad' : 'muted'

export function NegotiationsPanel() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const model = useQuery(() => ({
    queryKey: ['negotiations', params().slug],
    queryFn: () => api.negotiations(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  }))

  return <div class="space-y-4">
    <div class="flex items-start justify-between gap-4">
      <p class="text-sm text-muted-foreground">{authState.isPlatformLevel()
        ? 'Every live terms conversation: the offer on the table, the ladder the agent argued from, and the move waiting on an approval. The operator reads the reply and records the position; the evaluator proposes the counter.'
        : 'Every live conversation about money: the offer on the table, what the floor is, and the drafted answer waiting for a yes.'}</p>
      <Show when={model.data}>
        <StatusBadge
          status={model.data!.live.length > 0 ? `${model.data!.live.length} live` : 'clear'}
          tone={model.data!.live.length > 0 ? 'warn' : 'good'}
        />
      </Show>
    </div>

    <Show when={model.error}>
      <div class="rounded-lg border border-warning-foreground/30 bg-warning-foreground/10 p-4 text-sm text-warning-foreground" role="status">
        {model.error instanceof Error ? model.error.message : 'The negotiations list is temporarily unavailable.'}
      </div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonPanel lines={4} /></Show>

    <Show when={model.data}>{d => <>
      <Show
        when={d().live.length > 0}
        fallback={<EmptyState label="Nothing on the table" hint={authState.isPlatformLevel() ? 'A negotiation opens when the operator records a promoter offer on an opportunity. Settled conversations keep their record below.' : 'A negotiation opens when an offer is recorded on an opportunity.'} />}
      >
        <div class="flex flex-col">
          <For each={d().live}>{entry => <LiveRow entry={entry} slug={params().slug} />}</For>
        </div>
      </Show>

      <Show when={d().settled.length > 0}>
        <section class="pt-4 border-t border-border">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="history" />The record</h3>
          <p class="text-xs text-muted-foreground mt-1">Settled conversations from the last ninety days.</p>
          <div class="flex flex-col mt-3">
            <For each={d().settled}>{entry => (
              <div class="flex items-baseline justify-between gap-3 py-2 border-b border-border last:border-0">
                <div class="min-w-0 flex-1">
                  <span class="text-sm text-foreground">{entry.organization}</span>
                  <span class="text-sm text-muted-foreground">{` — ${entry.title} · ${money(entry.offered_fee_minor, entry.currency)}`}</span>
                </div>
                <StatusBadge status={settledLabel(entry)} tone={settledTone(entry.state)} />
              </div>
            )}</For>
          </div>
        </section>
      </Show>
    </>}</Show>
  </div>
}

function LiveRow(props: { entry: NegotiationEntry; slug: string }) {
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [offer, setOffer] = createSignal('')
  const [respondsBy, setRespondsBy] = createSignal('')
  const [editing, setEditing] = createSignal(false)

  const submit = async (withdrawn: boolean) => {
    if (busy()) return
    const unit = 10 ** currencyFractionDigits(props.entry.currency)
    const amount = Math.round(Number.parseFloat(offer().replace(',', '.')) * unit)
    if (!withdrawn && (!Number.isFinite(amount) || amount < 0)) {
      setError('Enter the fee they offered')
      return
    }
    const deadline = respondsBy() ? new Date(`${respondsBy()}T23:59:59Z`) : null
    if (!withdrawn && (!deadline || deadline.getTime() <= Date.now())) {
      setError('Pick the date their answer window closes')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.recordOpportunityTerms(props.slug, props.entry.opportunity_id, {
        position: withdrawn ? 'withdrawn' : 'offer',
        offered_fee_minor: withdrawn ? 0 : amount,
        currency: props.entry.currency,
        responds_by: (deadline ?? new Date(Date.now() + 86400_000)).toISOString(),
      })
      setEditing(false)
      setOffer('')
      setRespondsBy('')
      refreshQueries(['negotiations', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to record the position'))
    } finally {
      setBusy(false)
    }
  }

  const e = () => props.entry
  return <div class="py-3 border-b border-border last:border-0">
    <div class="flex items-baseline justify-between gap-3">
      <div class="min-w-0 flex-1">
        <span class="text-sm font-medium text-foreground">{e().organization}</span>
        <span class="text-sm text-muted-foreground">{` — ${e().title}`}</span>
      </div>
      <StatusBadge status={deadlineLabel(e().responds_by)} tone={new Date(e().responds_by).getTime() - Date.now() < 86_400_000 ? 'warn' : 'muted'} />
    </div>
    <div class="mt-1 text-sm text-muted-foreground">
      {`On the table ${money(e().offered_fee_minor, e().currency)} · floor ${money(e().walk_away_minor, e().currency)} (${floorBasisLabel(e().floor_basis)}) · target ${money(e().target_minor, e().currency)}`}
      {(() => { const asked = e().countered_fee_minor; return asked != null ? ` · asked ${money(asked, e().currency)}${e().counter_rounds > 0 ? ` (round ${e().counter_rounds})` : ''}` : '' })()}
    </div>
    <Show when={e().pending_move}>
      {mv => (
        <div class="mt-1 text-sm">
          <BadgeMove kind={mv().kind} amount={mv().amount_minor} currency={e().currency} round={mv().round} />
        </div>
      )}
    </Show>
    <div class="mt-2">
      <Show
        when={editing()}
        fallback={
          <Button writes variant="ghost" size="sm" disabled={busy()} onClick={() => setEditing(true)}>
            Record their answer
          </Button>
        }
      >
        <div class="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            inputmode="decimal"
            placeholder={`fee in ${e().currency}`}
            value={offer()}
            onInput={ev => setOffer(ev.currentTarget.value)}
            class="h-8 w-28"
          />
          <Input
            type="date"
            value={respondsBy()}
            onInput={ev => setRespondsBy(ev.currentTarget.value)}
            class="h-8 w-auto"
          />
          <Button writes variant="ghost" size="sm" class="text-success-foreground" disabled={busy()} onClick={() => submit(false)}>
            {busy() ? '…' : 'Record offer'}
          </Button>
          <Button writes variant="ghost" size="sm" class="text-destructive" disabled={busy()} onClick={() => submit(true)} title="They withdrew — settle the conversation">
            Withdrew
          </Button>
          <Button variant="ghost" size="sm" disabled={busy()} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </Show>
    </div>
    <Show when={error()}><small class="block text-destructive text-sm mt-1">{error()}</small></Show>
  </div>
}

function BadgeMove(props: { kind: string; amount: number | null; currency: string; round: number }) {
  const label = () => {
    const amount = props.amount
    const priced = amount != null ? money(amount, props.currency) : null
    return props.kind === 'accept_live_opportunity_terms'
      ? `accept ${priced ?? 'the offer'} — waiting for approval`
      : `counter at ${priced ?? '—'} (round ${props.round}) — waiting for approval`
  }
  return <StatusBadge status={label()} tone="warn" />
}
