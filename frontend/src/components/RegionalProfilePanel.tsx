import { Show, createEffect, createMemo, createSignal, on } from 'solid-js'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { RegionalProfile, TenantSummary } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { Dialog } from './Dialog'
import { Section, ErrorCard } from './layout'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '../lib/cn'
import { NativeSelect } from './ui/native-select'
import { Field, FieldGrid, ReadField, Unset } from './ui/field'

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
 * life of the tenant. It was drawn as eight always-live inputs with bare
 * `<label>` elements — unstyled, so the field name, the box and the hint ran
 * together on one baseline — under a permanent Save button.
 *
 * A record that is rarely edited should read as a record. The values are shown;
 * the form is behind Edit, in the same modal shell every other form in the
 * console now uses.
 */
export function RegionalProfilePanel(props: Props) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = createSignal(false)
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
      setEditing(false)
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

  const open = () => { setDraft(profile() ?? empty()); setEditing(true) }

  // The country a fan is in decides which legal regime applies to their data;
  // the locale decides what language they are written to in. The panel used to
  // state neither, so both read as preferences.
  const summary = createMemo(() => {
    const p = profile()
    if (!p) return 'Not classified. The runtime falls back to inferring locale and residency, which it must never do.'
    return `Fans of this tenant are written to in ${p.locale}, in ${p.currency}, on ${p.timezone} time. Their data is held in the ${p.dataRegion.toUpperCase()}.`
  })

  return (
    <Section
      title="Regional profile"
      icon={<SectionIcon name="globe" />}
      description={summary()}
      action={<>
        <StatusBadge
          status={classified() ? `${profile()!.dataRegion.toUpperCase()} classified` : 'unclassified'}
          tone={classified() ? 'good' : 'warn'}
        />
        {/* The opener is marked, not the eight fields behind it: a viewer that
            can reach the form fills it in and then finds Save dead. */}
        <Button variant={classified() ? 'ghost' : 'default'} size="sm" writes onClick={open}>
          {classified() ? 'Edit' : 'Classify tenant'}
        </Button>
      </>}
    >
      <Show when={!classified()}>
        <div class="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          No persisted regional profile. The runtime must not infer locale, currency, timezone or data
          residency from an IP address or a browser setting. Classify this tenant before the next deployment.
        </div>
      </Show>

      <Show when={profile()}>{p => (
        <FieldGrid min="150px">
          <ReadField label="Country">{p().countryCode || <Unset />}</ReadField>
          <ReadField label="Market region">{p().region.toUpperCase()}</ReadField>
          <ReadField label="Locale" hint="Language of fan-facing copy">{p().locale || <Unset />}</ReadField>
          <ReadField label="Timezone" hint="When sends are scheduled">{p().timezone || <Unset />}</ReadField>
          <ReadField label="Currency">{p().currency || <Unset />}</ReadField>
          <ReadField label="Date format">{DATE_FORMATS[p().dateFormat]}</ReadField>
          <ReadField label="Number format">{NUMBER_FORMATS[p().numberFormat]}</ReadField>
          <ReadField label="Data residency" hint="Changing this needs a migration, not an edit">
            {p().dataRegion.toUpperCase()}
          </ReadField>
        </FieldGrid>
      )}</Show>

      <Dialog
        open={editing()}
        onClose={() => setEditing(false)}
        label="Regional profile"
        title={classified() ? 'Edit regional profile' : 'Classify tenant'}
        description="These values are explicit for a reason: the runtime is not allowed to guess any of them from a request."
        class="max-w-2xl"
        footer={<>
          <span class="mr-auto text-xs text-muted-foreground" aria-live="polite">
            {ready() ? 'Ready to save.' : 'Country, locale, timezone and currency are required.'}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" writes onClick={() => update.mutate()} disabled={update.isPending || !ready()}>
            {update.isPending && <Spinner />} {update.isPending ? 'Saving…' : classified() ? 'Save profile' : 'Classify tenant'}
          </Button>
        </>}
      >
        <Show when={update.error}>
          <ErrorCard class="mb-4">{update.error instanceof Error ? update.error.message : 'Regional profile update failed'}</ErrorCard>
        </Show>
        <FieldGrid>
          <Field
            label="Country code"
            hint="ISO 3166-1 alpha-2, e.g. DE."
            error={touchedError(draft().countryCode, countryValid(), 'Two letters, e.g. DE.')}
          >
            <Input
              required maxlength="2" autocomplete="country"
              class={cn(draft().countryCode && !countryValid() && 'border-destructive')}
              aria-invalid={!countryValid()}
              value={draft().countryCode}
              onInput={e => set('countryCode', e.currentTarget.value.toUpperCase())}
              placeholder="DE"
            />
          </Field>
          <Field label="Market region" hint="Which market the tenant sells into.">
            <NativeSelect value={draft().region} onChange={e => set('region', e.currentTarget.value as 'eu' | 'us')}>
              <option value="eu">EU</option>
              <option value="us">US</option>
            </NativeSelect>
          </Field>
          <Field
            label="Locale"
            hint="BCP-47 tag, e.g. de-DE. Decides the language and formatting of fan-facing copy."
            error={touchedError(draft().locale, localeValid(), 'A language and a region, e.g. de-DE.')}
          >
            <Input
              required maxlength="35"
              class={cn(draft().locale && !localeValid() && 'border-destructive')}
              aria-invalid={!localeValid()}
              value={draft().locale}
              onInput={e => set('locale', e.currentTarget.value)}
              placeholder="de-DE"
            />
          </Field>
          <Field
            label="Timezone"
            hint="IANA timezone, e.g. Europe/Berlin. Decides when scheduled sends land."
            error={touchedError(draft().timezone, timezoneValid(), 'An IANA zone, e.g. Europe/Berlin.')}
          >
            <Input
              required maxlength="64"
              class={cn(draft().timezone && !timezoneValid() && 'border-destructive')}
              aria-invalid={!timezoneValid()}
              value={draft().timezone}
              onInput={e => set('timezone', e.currentTarget.value)}
              placeholder="Europe/Berlin"
            />
          </Field>
          <Field
            label="Currency"
            hint="ISO 4217, e.g. EUR. Prices and payouts are denominated in it."
            error={touchedError(draft().currency, currencyValid(), 'Three letters, e.g. EUR.')}
          >
            <Input
              required maxlength="3"
              class={cn(draft().currency && !currencyValid() && 'border-destructive')}
              aria-invalid={!currencyValid()}
              value={draft().currency}
              onInput={e => set('currency', e.currentTarget.value.toUpperCase())}
              placeholder="EUR"
            />
          </Field>
          <Field label="Date format">
            <NativeSelect value={draft().dateFormat} onChange={e => set('dateFormat', e.currentTarget.value as RegionalProfile['dateFormat'])}>
              <option value="dmy">{DATE_FORMATS.dmy}</option>
              <option value="mdy">{DATE_FORMATS.mdy}</option>
              <option value="ymd">{DATE_FORMATS.ymd}</option>
            </NativeSelect>
          </Field>
          <Field label="Number format">
            <NativeSelect value={draft().numberFormat} onChange={e => set('numberFormat', e.currentTarget.value as RegionalProfile['numberFormat'])}>
              <option value="comma_decimal">{NUMBER_FORMATS.comma_decimal}</option>
              <option value="dot_decimal">{NUMBER_FORMATS.dot_decimal}</option>
            </NativeSelect>
          </Field>
          <Field
            label="Data residency"
            note={classified() ? 'locked' : undefined}
            hint={classified()
              ? 'Set at classification. Moving a tenant\'s data between regions requires an explicit migration, so this field is not editable here.'
              : 'Choose before deployment. Ordinary editing must never be able to move fan data to another region later.'}
          >
            <NativeSelect
              disabled={classified()}
              value={draft().dataRegion}
              onChange={e => set('dataRegion', e.currentTarget.value as 'eu' | 'us')}
            >
              <option value="eu">EU residency</option>
              <option value="us">US residency</option>
            </NativeSelect>
          </Field>
        </FieldGrid>
      </Dialog>
    </Section>
  )
}
