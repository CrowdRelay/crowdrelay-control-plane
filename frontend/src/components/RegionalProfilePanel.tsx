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
  const countryValid = () => /^[A-Z]{2}$/.test(draft().countryCode.trim())
  const localeValid = () => /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(draft().locale.trim())
  const timezoneValid = () => /^[A-Za-z0-9_+-]+\/[A-Za-z0-9_+\-/]+$/.test(draft().timezone.trim())
  const currencyValid = () => /^[A-Z]{3}$/.test(draft().currency.trim())
  const ready = () => countryValid() && localeValid() && timezoneValid() && currencyValid()

  return <article class="panel regional-profile-panel">
    <div class="section-title">
      <div><span class="eyebrow">REGIONALIZATION</span><h2>Explicit tenant profile</h2></div>
      <StatusBadge
        status={props.tenant.regionalProfile ? `${props.tenant.regionalProfile.dataRegion.toUpperCase()} classified` : 'legacy / unclassified'}
        tone={props.tenant.regionalProfile ? 'good' : 'warn'}
      />
    </div>
    <Show when={!props.tenant.regionalProfile}>
      <div class="warning-card">No persisted regional profile. Runtime must not infer locale, currency, timezone or data residency from IP/browser settings. Classify this tenant before the next deployment.</div>
    </Show>
    <div class="form-grid regional-profile-grid">
      <label>Country code<input required maxlength="2" autocomplete="country" class={!countryValid() && draft().countryCode ? 'input-invalid' : ''} aria-invalid={!countryValid()} value={draft().countryCode} onInput={e=>set('countryCode', e.currentTarget.value.toUpperCase())} placeholder="DE"/></label>
      <label>Market region<select value={draft().region} onChange={e=>set('region', e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></select></label>
      <label>Locale<input required maxlength="35" class={!localeValid() && draft().locale ? 'input-invalid' : ''} aria-invalid={!localeValid()} value={draft().locale} onInput={e=>set('locale', e.currentTarget.value)} placeholder="de-DE"/><small>BCP-47 tag, e.g. de-DE.</small></label>
      <label>Timezone<input required maxlength="64" class={!timezoneValid() && draft().timezone ? 'input-invalid' : ''} aria-invalid={!timezoneValid()} value={draft().timezone} onInput={e=>set('timezone', e.currentTarget.value)} placeholder="Europe/Berlin"/><small>IANA timezone, e.g. Europe/Berlin.</small></label>
      <label>Currency<input required maxlength="3" class={!currencyValid() && draft().currency ? 'input-invalid' : ''} aria-invalid={!currencyValid()} value={draft().currency} onInput={e=>set('currency', e.currentTarget.value.toUpperCase())} placeholder="EUR"/></label>
      <label>Date format<select value={draft().dateFormat} onChange={e=>set('dateFormat', e.currentTarget.value as RegionalProfile['dateFormat'])}><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option><option value="ymd">YYYY-MM-DD</option></select></label>
      <label>Number format<select value={draft().numberFormat} onChange={e=>set('numberFormat', e.currentTarget.value as RegionalProfile['numberFormat'])}><option value="comma_decimal">1 234,56</option><option value="dot_decimal">1,234.56</option></select></label>
      <label>Data region<select disabled={Boolean(props.tenant.regionalProfile)} value={draft().dataRegion} onChange={e=>set('dataRegion', e.currentTarget.value as 'eu'|'us')}><option value="eu">EU residency</option><option value="us">US residency</option></select><small>{props.tenant.regionalProfile ? 'Residency changes require an explicit migration, not ordinary editing.' : 'Choose before deployment. Normal editing cannot silently move data later.'}</small></label>
    </div>
    <Show when={update.error}><div class="error-card" role="alert">{update.error instanceof Error ? update.error.message : 'Regional profile update failed'}</div></Show>
    <div class="regional-profile-footer">
      <div class="form-readiness" aria-live="polite">
        <Show when={!ready()} fallback={<span class="readiness-message"><span class="auth-dot ok"/>Profile is complete and ready to save.</span>}><span class="readiness-message"><span class="auth-dot"/>Complete country, locale, timezone and currency to continue.</span></Show>
      </div>
      <button type="button" onClick={()=>update.mutate()} disabled={update.isPending || !ready()}>{update.isPending ? 'Saving…' : props.tenant.regionalProfile ? 'Save regional profile' : 'Classify tenant'}</button>
    </div>
  </article>
}
