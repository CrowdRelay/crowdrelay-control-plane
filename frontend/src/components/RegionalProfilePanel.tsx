import { Show, createEffect, createSignal, on, type JSX } from 'solid-js'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { RegionalProfile, TenantSummary } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '../lib/cn'
import { NativeSelect } from './ui/native-select'

type Props = { tenant: TenantSummary }

/** Small hoverable question mark that shows help text via native title tooltip. */
const HelpDot = (props: { text: string }): JSX.Element => (
  <span
    class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted-foreground/40 text-muted-foreground text-[10px] font-bold cursor-help align-middle ml-1"
    title={props.text}
    aria-label={props.text}
    role="img"
  >?</span>
)

const empty = (): RegionalProfile => ({
  countryCode: '', region: 'eu', locale: '', timezone: '', currency: '',
  dateFormat: 'dmy', numberFormat: 'comma_decimal', dataRegion: 'eu',
})

export function RegionalProfilePanel(props: Props) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = createSignal<RegionalProfile>(props.tenant.regionalProfile ?? empty())
  // Only re-sync from server when the profile actually changed, not on
  // every parent re-render — otherwise background refetches wipe unsaved
  // operator edits.
  createEffect(on(
    () => props.tenant.regionalProfile,
    (profile, prev) => {
      const next = profile ?? empty()
      if (prev === undefined || JSON.stringify(next) !== JSON.stringify(prev ?? empty())) {
        setDraft(next)
      }
    },
  ))
  const update = useMutation(() => ({
    mutationFn: () => api.regionalProfile(props.tenant.slug, draft()),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant', props.tenant.slug] }),
        queryClient.invalidateQueries({ queryKey: ['tenants'] }),
      ])
    },
  }))
  const set = <K extends keyof RegionalProfile>(key: K, value: RegionalProfile[K]) =>
    setDraft(current => ({ ...current, [key]: value }))
  const countryValid = () => /^[A-Z]{2}$/.test(draft().countryCode.trim())
  const localeValid = () => /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(draft().locale.trim())
  const timezoneValid = () => /^[A-Za-z0-9_+-]+\/[A-Za-z0-9_+\-/]+$/.test(draft().timezone.trim())
  const currencyValid = () => /^[A-Z]{3}$/.test(draft().currency.trim())
  const ready = () => countryValid() && localeValid() && timezoneValid() && currencyValid()

  return <Card flat class="p-4">
    <div class="flex items-center justify-between gap-4 mt-6 mb-3">
      <div><h2 class="text-lg font-semibold text-foreground flex items-center gap-2"><SectionIcon name="globe" />Explicit tenant profile</h2></div>
      <StatusBadge
        status={props.tenant.regionalProfile ? `${props.tenant.regionalProfile.dataRegion.toUpperCase()} classified` : 'legacy / unclassified'}
        tone={props.tenant.regionalProfile ? 'good' : 'warn'}
      />
    </div>
    <Show when={!props.tenant.regionalProfile}>
      <div class="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">No persisted regional profile. Runtime must not infer locale, currency, timezone or data residency from IP/browser settings. Classify this tenant before the next deployment.</div>
    </Show>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
      <label>Country code<Input required maxlength="2" autocomplete="country" class={cn(!countryValid() && draft().countryCode && 'border-destructive')} aria-invalid={!countryValid()} value={draft().countryCode} onInput={e=>set('countryCode', e.currentTarget.value.toUpperCase())} placeholder="DE"/></label>
      <label>Market region<NativeSelect value={draft().region} onChange={e=>set('region', e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></NativeSelect></label>
      <label>Locale<HelpDot text="BCP-47 tag, e.g. de-DE. Decides the language and formatting of fan-facing copy." /><Input required maxlength="35" class={cn(!localeValid() && draft().locale && 'border-destructive')} aria-invalid={!localeValid()} value={draft().locale} onInput={e=>set('locale', e.currentTarget.value)} placeholder="de-DE"/><small>BCP-47 tag, e.g. de-DE.</small></label>
      <label>Timezone<Input required maxlength="64" class={cn(!timezoneValid() && draft().timezone && 'border-destructive')} aria-invalid={!timezoneValid()} value={draft().timezone} onInput={e=>set('timezone', e.currentTarget.value)} placeholder="Europe/Berlin"/><small>IANA timezone, e.g. Europe/Berlin.</small></label>
      <label>Currency<Input required maxlength="3" class={cn(!currencyValid() && draft().currency && 'border-destructive')} aria-invalid={!currencyValid()} value={draft().currency} onInput={e=>set('currency', e.currentTarget.value.toUpperCase())} placeholder="EUR"/></label>
      <label>Date format<NativeSelect value={draft().dateFormat} onChange={e=>set('dateFormat', e.currentTarget.value as RegionalProfile['dateFormat'])}><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option><option value="ymd">YYYY-MM-DD</option></NativeSelect></label>
      <label>Number format<NativeSelect value={draft().numberFormat} onChange={e=>set('numberFormat', e.currentTarget.value as RegionalProfile['numberFormat'])}><option value="comma_decimal">1 234,56</option><option value="dot_decimal">1,234.56</option></NativeSelect></label>
      <label>Data region<HelpDot text={props.tenant.regionalProfile ? 'Residency changes require an explicit migration, not ordinary editing.' : 'Choose before deployment. Normal editing cannot silently move data later.'} /><NativeSelect disabled={Boolean(props.tenant.regionalProfile)}  value={draft().dataRegion} onChange={e=>set('dataRegion', e.currentTarget.value as 'eu'|'us')}><option value="eu">EU residency</option><option value="us">US residency</option></NativeSelect><small>{props.tenant.regionalProfile ? 'Residency changes require an explicit migration, not ordinary editing.' : 'Choose before deployment. Normal editing cannot silently move data later.'}</small></label>
    </div>
    <Show when={update.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{update.error instanceof Error ? update.error.message : 'Regional profile update failed'}</div></Show>
    <div class="flex items-center justify-between gap-4 mt-5 pt-4 border-t border-border">
      <div class="min-w-0" aria-live="polite">
        <Show when={!ready()} fallback={<span class="inline-flex items-center gap-2 text-muted-foreground text-sm"><span class="w-1.75 h-1.75 rounded-full bg-success"/>Profile is complete and ready to save.</span>}><span class="inline-flex items-center gap-2 text-muted-foreground text-sm"><span class="w-1.75 h-1.75 rounded-full bg-destructive"/>Complete country, locale, timezone and currency to continue.</span></Show>
      </div>
      <Button type="button" onClick={()=>update.mutate()} disabled={update.isPending || !ready()}>{update.isPending && <Spinner />} {update.isPending ? 'Saving…' : props.tenant.regionalProfile ? 'Save regional profile' : 'Classify tenant'}</Button>
    </div>
  </Card>
}
