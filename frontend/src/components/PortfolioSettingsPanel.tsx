import { For, Show, createMemo, createSignal } from 'solid-js'
import { useMutation, useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { PortfolioSettingsReadModel } from '../lib/types'
import { SectionIcon } from './SectionIcon'
import { ErrorCard, SectionTitle } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import { northStarLabel, northStarMeaning } from '../lib/north-star'
import { writeGuard } from '../lib/read-only'

const LABELS: Record<string, string> = {
  member_site_base_url: 'Member site base URL',
  member_area_path: 'Member area path',
  synesthesia_campaign_slug: 'Synesthesia campaign slug',
  signal_enabled: 'Signal app',
  synesthesia_enabled: 'Synesthesia',
  north_star_metric: 'What the brain chases',
  social_auto_post: 'Social auto-posting',
  growth_cadence_moments_per_month: 'Serious moments per month',
  growth_cadence_fillers_enabled: 'Filler calendar',
  crew_locale: 'Language the crew reads',
}

// The server grew three more editable keys than this panel had labels for, so
// `signal_enabled` and `north_star_metric` rendered as their own key names over
// a free-text box — a boolean and an enum you had to spell correctly by hand.
const BOOLEAN_KEYS = new Set(['signal_enabled', 'synesthesia_enabled', 'social_auto_post', 'growth_cadence_fillers_enabled'])

// A key name alone does not say what the value does or what shape it takes.
// Each row carries what the value drives, and an example of a valid one — the
// two questions an operator has in front of an empty text field.
const HINTS: Record<string, { hint: string; example: string }> = {
  member_site_base_url: {
    hint: 'Origin the fan-facing member links point at. Emails, Signal deep links and QR codes are all built from it.',
    example: 'https://future-metal.example',
  },
  member_area_path: {
    hint: 'Path appended to the member site for the logged-in area. Leading slash, no trailing one.',
    example: '/members',
  },
  synesthesia_campaign_slug: {
    hint: 'Campaign the Synesthesia experience opens on. Must match a campaign slug that exists in the tenant workspace.',
    example: 'sanity-check',
  },
  signal_enabled: {
    hint: 'Whether the Signal mobile app is part of this tenant. Turning it off stops the brain dispatching signal-inviter work and hides Signal links from fan-facing surfaces.',
    example: 'true',
  },
  synesthesia_enabled: {
    hint: 'Whether the Synesthesia album experience is part of this tenant. Off means its campaign and leaderboard are not offered to fans.',
    example: 'false',
  },
  north_star_metric: {
    hint: 'The one number the brain tries to move. It still records everything else — this only decides which way it goes when two good options pull apart.',
    example: 'activated_fans_30d',
  },
  crew_locale: {
    hint: 'Language for task emails and the staff panel. Briefings are written in English and translated for the crew; a language nobody has written wording for yet reads as English rather than as blanks. Two-letter code, optionally with a region.',
    example: 'pl',
  },
  social_auto_post: {
    hint: 'When enabled, the social post executor publishes to Facebook Pages and Instagram through the Graph API instead of drafting for manual review. X always drafts. The publish guard still runs — a held post lands in the operator queue with its reason. Instagram needs at least one active photo press asset.',
    example: 'false',
  },
  growth_cadence_moments_per_month: {
    hint: 'Serious moments (release, video, or show) the tenant commits to each month — each gets its vertical, tier decision and spend. 1 is the default; a tenant who beats it moves their own number up. 1–4.',
    example: '1',
  },
  growth_cadence_fillers_enabled: {
    hint: 'Whether the machine schedules fillers between serious moments — demos, harvest output, catalogue rotation, show material, no spend and no gate. The quiet weeks fill themselves.',
    example: 'true',
  },
}

// One text input per editable key. A key with no override shows the shipped
// default (the value already merged upstream) and an "override" badge only
// when a row exists — so operators always see what is live, not what is saved.
export function PortfolioSettingsPanel(props: {
  slug: string
  model: PortfolioSettingsReadModel | undefined
  onChanged: () => void
}) {
  const [drafts, setDrafts] = createSignal<Record<string, string>>({})
  const [pendingKey, setPendingKey] = createSignal<string | null>(null)
  const [errorText, setErrorText] = createSignal<string | null>(null)
  const [savedKey, setSavedKey] = createSignal<string | null>(null)

  // The north star vocabulary lives in the Rust domain, so the picker asks the
  // server for it rather than shipping a second copy that can drift.
  const goals = useQuery(() => ({
    queryKey: ['portfolio-goals', props.slug],
    queryFn: () => api.northStarOptions(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const keys = createMemo(() => props.model?.editable_keys ?? [])
  const dirty = (key: string) =>
    drafts()[key] !== undefined && drafts()[key] !== props.model?.settings[key]

  const save = useMutation(() => ({
    mutationFn: async (key: string) => {
      setPendingKey(key); setErrorText(null); setSavedKey(null)
      return api.updatePortfolioSetting(props.slug, key, drafts()[key] ?? '')
    },
    onSuccess: async (_result, key) => {
      setDrafts(current => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setSavedKey(key)
      setPendingKey(null)
      props.onChanged()
    },
    onError: (error) => {
      setPendingKey(null)
      setErrorText(error instanceof Error ? error.message : 'Save failed')
    },
  }))

  return <Card flat>
    <SectionTitle eyebrow="BRAND" title="Brand settings" icon={<SectionIcon name="settings" />} description="Where this tenant's fan-facing links point. Each field is live as soon as it is saved — the apps read these values directly." />
    <p class="text-sm text-muted-foreground leading-relaxed">A field left empty runs the shipped default; <Badge variant="warning">override</Badge> marks the ones this tenant has replaced. Edit a field and its Save button appears beside it.</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <For each={keys()}>{key => (
        <label class="flex flex-col gap-1.5">
          <span class="text-sm text-foreground">
            {LABELS[key] ?? key}
            <Show when={props.model?.overridden.includes(key)}>
              {' '}<Badge variant="warning">override</Badge>
            </Show>
          </span>
          <Show
            when={BOOLEAN_KEYS.has(key)}
            fallback={
              <Show
                when={key === 'north_star_metric' && (goals.data?.options.length ?? 0) > 0}
                fallback={
                  <Input
                    value={drafts()[key] ?? props.model?.settings[key] ?? ''}
                    placeholder={HINTS[key]?.example}
                    onInput={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
                    {...writeGuard()}
                  />
                }
              >
                <NativeSelect value={drafts()[key] ?? props.model?.settings[key] ?? ''}
                  onChange={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
                  {...writeGuard()}
                >
                  <For each={goals.data!.options}>{option =>
                    <option value={option.value}>{northStarLabel(option)}</option>
                  }</For>
                </NativeSelect>
              </Show>
            }
          >
            <NativeSelect value={drafts()[key] ?? props.model?.settings[key] ?? 'false'}
              onChange={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
              {...writeGuard()}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </NativeSelect>
          </Show>
          <Show when={HINTS[key]}>{h => <small class="text-xs text-muted-foreground leading-relaxed">{h().hint}<Show when={!BOOLEAN_KEYS.has(key) && key !== 'north_star_metric'}> Example: <code class="text-xs">{h().example}</code></Show></small>}</Show>
          {/* What the selected goal means, under the selector that chose it.
              The generic hint says what a north star is; this says what this
              one commits the brain to. */}
          <Show when={key === 'north_star_metric'}>
            {(() => {
              const meaning = () => northStarMeaning(drafts()[key] ?? props.model?.settings[key] ?? '')
              return <Show when={meaning()}>
                <small class="text-xs leading-relaxed text-secondary-foreground">{meaning()}</small>
              </Show>
            })()}
          </Show>
          <Show when={dirty(key)} fallback={
            <Show when={savedKey() === key}><small class="text-xs text-muted-foreground">Saved ✓</small></Show>
          }>
            <div class="mt-1">
              <Button
                size="sm"
                writes
                disabled={pendingKey() !== null}
                onClick={() => save.mutate(key)}
              >
                {pendingKey() === key ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </Show>
        </label>
      )}</For>
    </div>
    <Show when={errorText()}>
      <ErrorCard>{errorText()}</ErrorCard>
    </Show>
  </Card>
}
