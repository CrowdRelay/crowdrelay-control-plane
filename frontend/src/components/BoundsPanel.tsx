import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { api, errorHeading } from '../lib/api'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { formatTimestamp } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Button } from './app/button'
import { Checkbox } from './app/checkbox'
import { Label } from './app/label'
import { Alert } from './app/alert'
import { Input } from './ui/input'
import { SurfaceAction } from './capabilities/SurfaceAction'
import { toast } from './app/toast'

// "What it may do without asking" has limits that are numbers, not sliders:
// the most it may spend on ads, and the booking calendar it books against.
// Both are optimistic-concurrency writes — the version read here is the one
// the write must name, so an edit made elsewhere since is refused rather than
// silently overwritten.

type SpendCeiling = { currency: string; maximum_total_daily_budget_minor: number; maximum_monthly_spend_minor: number; version: number }

type BookingPolicy = {
  policy: {
    annual_target: number
    annual_stretch: number
    stretch_minimum_score_basis_points: number
    prefer_weekend_one_shots: boolean
    priority_markets: string[]
    far_shot_minimum_score_basis_points: number
  }
  source: string
  version: number
  synced_at: string | null
}

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100)

function BookingPolicyEditor(props: { slug: string; current: BookingPolicy; onDone: () => void }) {
  const [target, setTarget] = createSignal(String(props.current.policy.annual_target))
  const [stretch, setStretch] = createSignal(String(props.current.policy.annual_stretch))
  const [weekends, setWeekends] = createSignal(props.current.policy.prefer_weekend_one_shots)
  const [markets, setMarkets] = createSignal(props.current.policy.priority_markets.join(', '))
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const save = async () => {
    const annualTarget = Number(target())
    const annualStretch = Number(stretch())
    const marketList = markets().split(',').map(m => m.trim().toUpperCase()).filter(Boolean)
    if (!Number.isInteger(annualTarget) || !Number.isInteger(annualStretch) || annualTarget < 1 || annualStretch < annualTarget || annualStretch > 60) {
      setError('Target and stretch are whole numbers from 1 to 60, and the stretch is at least the target.')
      return
    }
    // Upstream refuses a calendar with no market — it would plan against
    // nowhere — and reads markets as codes, not city names.
    if (marketList.length === 0 || marketList.length > 12 || !marketList.every(m => /^[A-Z0-9-]{1,24}$/.test(m))) {
      setError('Name 1 to 12 markets as country or region codes, e.g. PL, CZ, DE-BE.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await surface.write(props.slug, 'POST', capabilityAction('booking-policy', 'Set policy').path, {
        policy: {
          ...props.current.policy,
          annual_target: annualTarget,
          annual_stretch: annualStretch,
          prefer_weekend_one_shots: weekends(),
          priority_markets: marketList,
        },
        source: 'operator',
        source_revision: null,
        expected_version: props.current.version,
      })
      toast.success('Booking policy saved')
      props.onDone()
    } catch (caught) {
      setError(errorHeading(caught, 'The policy was not saved'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div class="mt-2 grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
      <div class="space-y-1"><Label>Shows a year — target</Label><Input type="number" value={target()} onInput={e => setTarget(e.currentTarget.value)} /></div>
      <div class="space-y-1"><Label>Shows a year — stretch</Label><Input type="number" value={stretch()} onInput={e => setStretch(e.currentTarget.value)} /></div>
      <div class="space-y-1 sm:col-span-2"><Label>Markets that come first</Label><Input value={markets()} onInput={e => setMarkets(e.currentTarget.value)} placeholder="PL, CZ, DE-BE" /></div>
      <Checkbox label="Prefer one-off weekend shows" checked={weekends()} onChange={(checked: boolean) => setWeekends(checked)} />
      <Show when={error()}><Alert tone="destructive" class="sm:col-span-2">{error()}</Alert></Show>
      <div class="sm:col-span-2"><Button size="sm" writes disabled={busy()} onClick={() => void save()}>{busy() ? 'Saving…' : 'Save the policy'}</Button></div>
    </div>
  )
}

export function BoundsPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = createSignal(false)
  const overview = useQuery(() => ({
    queryKey: ['autopilot-overview', props.slug],
    queryFn: () => api.autopilotOverview(props.slug),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  }))
  const policy = useQuery(() => ({
    queryKey: ['surface', props.slug, 'booking-policy'],
    queryFn: () => surface.read<BookingPolicy>(props.slug, capability('booking-policy').read!.path),
    staleTime: 60_000,
    retry: 1,
  }))
  const ceilings = () => ((overview.data as unknown as { promotion_budget_guardrails?: SpendCeiling[] } | undefined)?.promotion_budget_guardrails ?? [])
  const refreshCeilings = () => void queryClient.invalidateQueries({ queryKey: ['autopilot-overview', props.slug] })

  return (
    <Section title="Bounds it moves within" icon={<SectionIcon name="shield" />} description="The numbers the brain may not cross on its own: ad spend, and the booking calendar it plans against.">
      <div class="space-y-4 text-sm">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ad spend ceiling</p>
          <Show when={!overview.error} fallback={<p class="mt-1 text-muted-foreground">Couldn't check the ceilings.</p>}>
            <Show when={ceilings().length > 0} fallback={<p class="mt-1 text-muted-foreground">No ceiling set — no ad budget can be moved until one is.</p>}>
              <ul class="mt-1 space-y-1">
                <For each={ceilings()}>{c => (
                  <li class="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <span><strong class="text-foreground">{money(c.maximum_total_daily_budget_minor, c.currency)}</strong> a day, {money(c.maximum_monthly_spend_minor, c.currency)} a month</span>
                    <SurfaceAction
                      slug={props.slug}
                      size="xs"
                      variant="ghost"
                      action={capabilityAction('guardrails', 'Ad spend ceiling')}
                      label="Change"
                      initial={{ currency: c.currency, expected_version: String(c.version), maximum_total_daily_budget_minor: String(c.maximum_total_daily_budget_minor), maximum_monthly_spend_minor: String(c.maximum_monthly_spend_minor) }}
                      hidden={['currency', 'expected_version']}
                      onDone={refreshCeilings}
                    />
                  </li>
                )}</For>
              </ul>
            </Show>
            <div class="mt-2">
              <SurfaceAction
                slug={props.slug}
                size="xs"
                action={capabilityAction('guardrails', 'Ad spend ceiling')}
                label="Set a ceiling for a currency"
                initial={{ expected_version: '0' }}
                hidden={['expected_version']}
                onDone={refreshCeilings}
              />
            </div>
          </Show>
        </div>

        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Booking calendar</p>
          <Show when={!policy.error} fallback={<p class="mt-1 text-muted-foreground">Couldn't check the booking policy.</p>}>
            <Show when={policy.data} fallback={<p class="mt-1 text-muted-foreground">Checking…</p>}>
              {p => (
                <>
                  <p class="mt-1 text-muted-foreground">
                    Aims for <strong class="text-foreground">{p().policy.annual_target}</strong> shows a year, stretching to {p().policy.annual_stretch}
                    {p().policy.prefer_weekend_one_shots ? ' · prefers one-off weekends' : ''}
                    {p().policy.priority_markets.length > 0 ? ` · first: ${p().policy.priority_markets.join(', ')}` : ' · no market named yet, so it cannot be saved as it stands'}
                  </p>
                  <p class="text-xs text-muted-foreground">Set by {p().source.replaceAll('_', ' ')}{p().synced_at ? ` · synced ${formatTimestamp(p().synced_at)}` : ''}</p>
                  <Show when={editing()} fallback={<Button size="sm" variant="outline" class="mt-2" writes onClick={() => setEditing(true)}>Change the calendar</Button>}>
                    <BookingPolicyEditor slug={props.slug} current={p()} onDone={() => { setEditing(false); void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'booking-policy'] }) }} />
                  </Show>
                </>
              )}
            </Show>
          </Show>
        </div>
      </div>
    </Section>
  )
}
