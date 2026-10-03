import { Show, createEffect, createMemo, createSignal, on, type JSX } from 'solid-js'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { RegionalProfile, TenantSummary } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { ErrorCard } from './layout'
import { SaveActions, SettingsRow, SettingsSection } from './ui/settings'
import { writeGuard } from '../lib/read-only'
import { Alert } from './app/alert'
import { Input } from './ui/input'
import { cn } from '../lib/cn'
import { NativeSelect } from './ui/native-select'

type Props = { tenant: TenantSummary }

const empty = (): RegionalProfile => ({
  countryCode: '', region: 'eu', locale: '', timezone: '', currency: '',
  dateFormat: 'dmy', numberFormat: 'comma_decimal', dataRegion: 'eu',
})

const DATE_FORMATS: Record<RegionalProfile['dateFormat'], string> = {
  dmy: 'DD/MM/YYYY',
  mdy: 'MM/DD/YYYY',
  ymd: 'YYYY-MM-DD',
}

const NUMBER_FORMATS: Record<RegionalProfile['numberFormat'], string> = {
  comma_decimal: '1 234,56',
  dot_decimal: '1,234.56',
}

/**
 * The regional profile is set once, at classification, and then read for the
 * life of the tenant. Its fields are rows of the Settings layout, edited in
 * place and sent together by the section's Save — the runtime may not guess
 * any of them, so Save stays held until the four required ones are valid.
 */
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
        queryClient.invalidateQueries({ queryKey: ['tenant-overview', props.tenant.slug] }),
        queryClient.invalidateQueries({ queryKey: ['tenants'] }),
      ])
    },
  }))
  const set = <K extends keyof RegionalProfile>(key: K, value: RegionalProfile[K]) =>
    setDraft(current => ({ ...current, [key]: value }))

  const profile = () => props.tenant.regionalProfile
  const classified = () => Boolean(profile())

  const countryValid = () => /^[A-Z]{2}$/.test(draft().countryCode.trim())
  const localeValid = () => /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(draft().locale.trim())
  const timezoneValid = () => /^[A-Za-z0-9_+-]+\/[A-Za-z0-9_+\-/]+$/.test(draft().timezone.trim())
  const currencyValid = () => /^[A-Z]{3}$/.test(draft().currency.trim())
  const ready = () => countryValid() && localeValid() && timezoneValid() && currencyValid()

  // Only complain about a field the operator has actually typed in. An empty
  // form is incomplete, not wrong, and eight red borders on first open say
  // nothing an operator can act on.
  const touchedError = (value: string, valid: boolean, message: string) =>
    value.trim() && !valid ? message : undefined

  // The country a fan is in decides which legal regime applies to their data;
  // the locale decides what language they are written to in. The panel used to
  // state neither, so both read as preferences.
  const summary = createMemo(() => {
    const p = profile()
    if (!p) return authState.isPlatformLevel()
      ? 'Not classified. The runtime falls back to inferring locale and residency, which it must never do.'
      : 'Not classified. The system falls back to inferring locale and residency, which it must never do.'
    return authState.isPlatformLevel()
      ? `Fans of this tenant are written to in ${p.locale}, in ${p.currency}, on ${p.timezone} time. Their data is held in the ${p.dataRegion.toUpperCase()}.`
      : `Your fans are written to in ${p.locale}, in ${p.currency}, on ${p.timezone} time. Their data is held in the ${p.dataRegion.toUpperCase()}.`
  })

  const dirty = () => JSON.stringify(draft()) !== JSON.stringify(profile() ?? empty())
  const [saved, setSaved] = createSignal(false)
  const field = (id: string, label: string, hint: string, control: JSX.Element, error?: string) => (
    <SettingsRow for={`region-${id}`} label={label} hint={hint}>
      {control}
      <Show when={error}><small class="mt-1.5 block text-xs text-destructive">{error}</small></Show>
    </SettingsRow>
  )

  return (
    <SettingsSection
      title="Region and language"
      description={summary()}
      actions={<>
        <StatusBadge
          status={classified() ? `${profile()!.dataRegion.toUpperCase()} classified` : 'unclassified'}
          tone={classified() ? 'good' : 'warn'}
        />
        <SaveActions
          dirty={dirty()}
          pending={update.isPending}
          saved={saved()}
          blocked={ready() ? null : 'Country, locale, timezone and currency are required.'}
          saveLabel={classified() ? 'Save' : authState.isPlatformLevel() ? 'Classify tenant' : 'Classify your act'}
          onCancel={() => setDraft(profile() ?? empty())}
          onSave={() => update.mutate(undefined, { onSuccess: () => setSaved(true) })}
        />
      </>}
    >
      <Show when={!classified()}>
        <div class="py-4">
          <Alert tone="warning" role="status" title="No persisted regional profile">
            {authState.isPlatformLevel() ? 'The runtime' : 'The system'} must not infer locale, currency, timezone or data
            residency from an IP address or a browser setting. {authState.isPlatformLevel()
              ? 'Classify this tenant before the next deployment.'
              : 'Classify your act before anything else ships.'}
          </Alert>
        </div>
      </Show>
      <Show when={update.error}>
        <div class="py-4"><ErrorCard title="Couldn't save the regional profile" error={update.error} /></div>
      </Show>
      {field('country', 'Country', 'ISO 3166-1 alpha-2, e.g. DE.',
        <Input id="region-country" required maxlength="2" autocomplete="country" class={cn(draft().countryCode && !countryValid() && 'border-destructive')} aria-invalid={!countryValid()} value={draft().countryCode} onInput={e => { setSaved(false); set('countryCode', e.currentTarget.value.toUpperCase()) }} placeholder="DE" {...writeGuard()} />,
        touchedError(draft().countryCode, countryValid(), 'Two letters, e.g. DE.'))}
      {field('market', 'Market region', authState.isPlatformLevel() ? 'Which market the tenant sells into.' : 'Which market your act sells into.',
        <NativeSelect id="region-market" value={draft().region} onChange={e => { setSaved(false); set('region', e.currentTarget.value as 'eu' | 'us') }} {...writeGuard()}>
          <option value="eu">EU</option>
          <option value="us">US</option>
        </NativeSelect>)}
      {field('locale', 'Language of fan copy', 'BCP-47 tag, e.g. de-DE. Decides the language and formatting of fan-facing copy.',
        <Input id="region-locale" required maxlength="35" class={cn(draft().locale && !localeValid() && 'border-destructive')} aria-invalid={!localeValid()} value={draft().locale} onInput={e => { setSaved(false); set('locale', e.currentTarget.value) }} placeholder="de-DE" {...writeGuard()} />,
        touchedError(draft().locale, localeValid(), 'A language and a region, e.g. de-DE.'))}
      {field('timezone', 'Timezone', 'IANA timezone, e.g. Europe/Berlin. Decides when scheduled sends land.',
        <Input id="region-timezone" required maxlength="64" class={cn(draft().timezone && !timezoneValid() && 'border-destructive')} aria-invalid={!timezoneValid()} value={draft().timezone} onInput={e => { setSaved(false); set('timezone', e.currentTarget.value) }} placeholder="Europe/Berlin" {...writeGuard()} />,
        touchedError(draft().timezone, timezoneValid(), 'An IANA zone, e.g. Europe/Berlin.'))}
      {field('currency', 'Currency', 'ISO 4217, e.g. EUR. Prices and payouts are denominated in it.',
        <Input id="region-currency" required maxlength="3" class={cn(draft().currency && !currencyValid() && 'border-destructive')} aria-invalid={!currencyValid()} value={draft().currency} onInput={e => { setSaved(false); set('currency', e.currentTarget.value.toUpperCase()) }} placeholder="EUR" {...writeGuard()} />,
        touchedError(draft().currency, currencyValid(), 'Three letters, e.g. EUR.'))}
      {field('date', 'Date format', 'How dates read in fan messages.',
        <NativeSelect id="region-date" value={draft().dateFormat} onChange={e => { setSaved(false); set('dateFormat', e.currentTarget.value as RegionalProfile['dateFormat']) }} {...writeGuard()}>
          <option value="dmy">{DATE_FORMATS.dmy}</option>
          <option value="mdy">{DATE_FORMATS.mdy}</option>
          <option value="ymd">{DATE_FORMATS.ymd}</option>
        </NativeSelect>)}
      {field('number', 'Number format', 'How prices and counts read.',
        <NativeSelect id="region-number" value={draft().numberFormat} onChange={e => { setSaved(false); set('numberFormat', e.currentTarget.value as RegionalProfile['numberFormat']) }} {...writeGuard()}>
          <option value="comma_decimal">{NUMBER_FORMATS.comma_decimal}</option>
          <option value="dot_decimal">{NUMBER_FORMATS.dot_decimal}</option>
        </NativeSelect>)}
      <SettingsRow label="Data residency" hint="Where fan data is held. Changing it needs a migration, not an edit.">
        <p class="m-0 text-sm text-foreground">{(profile()?.dataRegion ?? draft().dataRegion).toUpperCase()}</p>
      </SettingsRow>
    </SettingsSection>
  )
}
