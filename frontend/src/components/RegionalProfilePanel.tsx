import { Show, createEffect, createSignal } from 'solid-js'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { RegionalProfile, TenantSummary } from '../lib/types'
import { StatusBadge } from './StatusBadge'

type Props = { tenant: TenantSummary }

const empty = (): RegionalProfile => ({
  countryCode: '', region: 'eu', locale: '', timezone: '', currency: '',
  dateFormat: 'dmy', numberFormat: 'comma_decimal', dataRegion: 'eu',
})

export function RegionalProfilePanel(props: Props) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = createSignal<RegionalProfile>(props.tenant.regionalProfile ?? empty())
  createEffect(() => setDraft(props.tenant.regionalProfile ?? empty()))
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
  const ready = () => draft().countryCode.trim().length === 2
    && draft().locale.trim().length >= 4
    && draft().timezone.trim().includes('/')
    && draft().currency.trim().length === 3

  return <article class="panel">
    <div class="section-title">
      <div><span class="eyebrow">REGIONALIZATION</span><h2>Explicit tenant profile</h2></div>
      <StatusBadge
        status={props.tenant.regionalProfile ? `${props.tenant.regionalProfile.dataRegion.toUpperCase()} classified` : 'legacy / unclassified'}
        tone={props.tenant.regionalProfile ? 'good' : 'warn'}
      />
    </div>
    <Show when={!props.tenant.regionalProfile}>
      <div class="warning-card">
        No persisted regional profile. Runtime must not infer locale, currency, timezone or data residency from IP/browser settings. Classify this tenant before the next deployment.
      </div>
    </Show>
    <div class="form-grid">
      <label>Country code<input maxlength="2" value={draft().countryCode} onInput={e=>set('countryCode', e.currentTarget.value.toUpperCase())}/></label>
      <label>Market region<select value={draft().region} onChange={e=>set('region', e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></select></label>
      <label>Locale<input value={draft().locale} onInput={e=>set('locale', e.currentTarget.value)} placeholder="de-DE"/></label>
      <label>Timezone<input value={draft().timezone} onInput={e=>set('timezone', e.currentTarget.value)} placeholder="Europe/Berlin"/></label>
      <label>Currency<input maxlength="3" value={draft().currency} onInput={e=>set('currency', e.currentTarget.value.toUpperCase())} placeholder="EUR"/></label>
      <label>Date format<select value={draft().dateFormat} onChange={e=>set('dateFormat', e.currentTarget.value as RegionalProfile['dateFormat'])}><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option><option value="ymd">YYYY-MM-DD</option></select></label>
      <label>Number format<select value={draft().numberFormat} onChange={e=>set('numberFormat', e.currentTarget.value as RegionalProfile['numberFormat'])}><option value="comma_decimal">1 234,56</option><option value="dot_decimal">1,234.56</option></select></label>
      <label>Data region<select disabled={Boolean(props.tenant.regionalProfile)} value={draft().dataRegion} onChange={e=>set('dataRegion', e.currentTarget.value as 'eu'|'us')}><option value="eu">EU residency</option><option value="us">US residency</option></select><small>{props.tenant.regionalProfile ? 'Residency changes require an explicit migration, not ordinary editing.' : 'Choose before deployment. Normal editing cannot silently move data later.'}</small></label>
    </div>
    <Show when={update.error}><div class="error-card" role="alert">{update.error instanceof Error ? update.error.message : 'Regional profile update failed'}</div></Show>
    <button onClick={()=>update.mutate()} disabled={update.isPending || !ready()}>
      {update.isPending ? 'Saving…' : props.tenant.regionalProfile ? 'Save regional profile' : 'Classify tenant'}
    </button>
  </article>
}
