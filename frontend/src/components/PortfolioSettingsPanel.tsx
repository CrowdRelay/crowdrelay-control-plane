import { For, Show, createMemo, createSignal } from 'solid-js'
import { useMutation, useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { PortfolioSettingsReadModel } from '../lib/types'
import { SectionIcon } from './SectionIcon'
import { ErrorCard, Section } from './layout'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import { northStarLabel, northStarMeaning, northStarTechnicalName } from '../lib/north-star'
import { writeGuard } from '../lib/read-only'

const LABELS: Record<string, string> = {
  member_site_base_url: 'Member site base URL',
  member_area_path: 'Member area path',
  synesthesia_campaign_slug: 'Synesthesia campaign slug',
  signal_enabled: 'Signal app',
  synesthesia_enabled: 'Synesthesia',
  north_star_metric: 'What the brain chases',
  tenant_intent: 'What the band is doing',
  social_auto_post: 'Social auto-posting',
  ticketing_enabled: 'Ticket sales',
  growth_cadence_moments_per_month: 'Serious moments per month',
  growth_cadence_fillers_enabled: 'Filler calendar',
  crew_locale: 'Language the crew reads',
  join_ask_variants: 'Join-ask posts (your words)',
  join_ask_cadence_days: 'Join-ask cadence (days)',
  join_ask_platforms: 'Join-ask channels',
}

// The server grew three more editable keys than this panel had labels for, so
// `signal_enabled` and `north_star_metric` rendered as their own key names over
// a free-text box — a boolean and an enum you had to spell correctly by hand.
const BOOLEAN_KEYS = new Set(['signal_enabled', 'synesthesia_enabled', 'social_auto_post', 'growth_cadence_fillers_enabled', 'ticketing_enabled'])

// A key name alone does not say what the value does or what shape it takes.
// Each row carries what the value drives, and an example of a valid one — the
// two questions an operator has in front of an empty text field.
// `band` is the tenant-operator phrasing of the same hint — the audience
// page shows this panel to the band, where "this tenant" is the wrong name
// for their own act.
const HINTS: Record<string, { hint: string; example: string; band?: string }> = {
  tenant_intent: {
    hint: "The tenant's stated focus — the gig planner reads it before proposing, and 'heads down' withholds every proposal.",
    band: "What you are working on — the gig planner reads it before proposing, and 'heads down' withholds every proposal.",
    example: 'booking_shows',
  },
  member_site_base_url: {
    hint: 'Origin the fan-facing member links point at. Emails, Signal deep links and QR codes are all built from it.',
    band: 'Where the fan-facing member links point. Emails, Signal links and QR codes are all built from it.',
    example: 'https://future-metal.example',
  },
  member_area_path: {
    hint: 'Path appended to the member site for the logged-in area. Leading slash, no trailing one.',
    example: '/members',
  },
  synesthesia_campaign_slug: {
    hint: 'Campaign the Synesthesia experience opens on. Must match a campaign slug that exists in the tenant workspace.',
    band: 'Campaign the Synesthesia experience opens on. Must match a campaign slug that exists for your act.',
    example: 'sanity-check',
  },
  signal_enabled: {
    hint: 'Whether the Signal mobile app is part of this tenant. Turning it off stops the brain dispatching signal-inviter work and hides Signal links from fan-facing surfaces.',
    band: 'Whether the Signal app is part of your act. Turning it off stops the work that brings fans into it and hides Signal links from them.',
    example: 'true',
  },
  synesthesia_enabled: {
    hint: 'Whether the Synesthesia album experience is part of this tenant. Off means its campaign and leaderboard are not offered to fans.',
    band: 'Whether the Synesthesia album experience is part of your act. Off means its campaign and leaderboard are not offered to your fans.',
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
    band: 'When on, posts publish straight to Facebook Pages and Instagram instead of waiting as drafts for your review. X always drafts. The safety check still runs — a held post lands in Needs you with its reason. Instagram needs at least one active photo press asset.',
    example: 'false',
  },
  growth_cadence_moments_per_month: {
    hint: 'Serious moments (release, video, or show) the tenant commits to each month — each gets its vertical, tier decision and spend. 1 is the default; a tenant who beats it moves their own number up. 1–4.',
    band: 'Serious moments (release, video, or show) you commit to each month — each gets its vertical, tier decision and spend. 1 is the default; beat it and your number moves up. 1–4.',
    example: '1',
  },
  ticketing_enabled: {
    hint: "Whether this tenant sells tickets through the member site's own checkout. Needs the Stripe keys below — turning it on without them fails closed at checkout, not silently.",
    band: "Whether you sell tickets through your site's own checkout. Needs the Stripe keys below — turning it on without them fails closed at checkout, not silently.",
    example: 'false',
  },
  growth_cadence_fillers_enabled: {
    hint: 'Whether the machine schedules fillers between serious moments — demos, harvest output, catalogue rotation, show material, no spend and no gate. The quiet weeks fill themselves.',
    example: 'true',
  },
  join_ask_variants: {
    hint: "One to five short posts asking followers to join the fanbase, as a JSON list of strings. The system rotates them onto the tenant's own channels and appends the tracked join link; it never rewrites them. Empty means the weekly ask is off.",
    band: 'One to five short posts asking your followers to join, in your own words, as a JSON list of strings. We rotate them onto your own channels and add the join link — we never rewrite them. Empty means the weekly ask is off.',
    example: '["Jesteśmy w Signal — koncerty w pobliżu i bilety pierwsi. Dołącz:", "Nowa muzyka najpierw dla ludzi z Signal. Wchodzisz?"]',
  },
  join_ask_cadence_days: {
    hint: 'Minimum days between two join-asks on the same channel. One post per channel per ISO week at most, whatever this says. 3–30; absent means 7.',
    example: '7',
  },
  join_ask_platforms: {
    hint: 'Comma list of channels the join-ask goes to. Facebook and Instagram publish today; telegram and discord are accepted but held until their executor is wired. Absent means facebook,instagram.',
    example: 'facebook,instagram',
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

  // Same discipline for the intent vocabulary: it lives in the Rust domain,
  // so the picker asks rather than shipping a copy that can drift.
  const intents = useQuery(() => ({
    queryKey: ['tenant-intents', props.slug],
    queryFn: () => api.tenantIntentOptions(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  // Enum keys render as a select over the server's own vocabulary — a
  // free-text enum is a spelling test, and a typo in `tenant_intent` reads
  // back as "unstated" upstream.
  const enumOptions = (key: string): { value: string; label: string }[] | undefined => {
    const options =
      key === 'north_star_metric'
        ? goals.data?.options.map(option => ({ value: option.value, label: northStarLabel(option) }))
        : key === 'tenant_intent'
          ? intents.data?.options.map(option => ({
              value: option.value,
              label: option.value.replaceAll('_', ' '),
            }))
          : undefined
    // An empty list is no list — fall back to the input rather than render a
    // select with nothing to select.
    return options && options.length > 0 ? options : undefined
  }

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

  return <Section
    title="Brand settings"
    icon={<SectionIcon name="settings" />}
    description={<>{authState.isPlatformLevel() ? "Where this tenant's fan-facing links point." : 'Where your fan-facing links point.'} Each field is live as soon as it is saved. An empty field runs the shipped default; <Badge variant="warning">override</Badge> marks a replaced one.</>}
  >
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
                when={enumOptions(key)}
                fallback={
                  <Input
                    value={drafts()[key] ?? props.model?.settings[key] ?? ''}
                    placeholder={HINTS[key]?.example}
                    onInput={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
                    {...writeGuard()}
                  />
                }
              >
                {options => (
                  <NativeSelect value={drafts()[key] ?? props.model?.settings[key] ?? ''}
                    onChange={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
                    {...writeGuard()}
                  >
                    <For each={options()}>{option =>
                      <option value={option.value}>{option.label}</option>
                    }</For>
                  </NativeSelect>
                )}
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
          <Show when={HINTS[key]}>{h => <small class="text-xs text-muted-foreground leading-relaxed">{h().band && !authState.isPlatformLevel() ? h().band : h().hint}<Show when={!BOOLEAN_KEYS.has(key) && key !== 'north_star_metric'}> Example: <code class="text-xs">{h().example}</code></Show></small>}</Show>
          <Show when={key === 'tenant_intent'}>
            {(() => {
              const current = () => drafts()[key] ?? props.model?.settings[key] ?? ''
              const option = () => intents.data?.options.find(o => o.value === current())
              return <>
                <Show when={option()?.description}>
                  <small class="block text-xs leading-relaxed text-secondary-foreground">{option()?.description}</small>
                </Show>
                <Show when={option()?.withholdsProposals}>
                  <small class="block text-xs leading-relaxed text-amber-400/90">
                    This withholds every gig proposal until the intent changes back — the
                    planner will refuse rather than book around it.
                  </small>
                </Show>
              </>
            })()}
          </Show>
          {/* What the selected goal means, under the selector that chose it.
              The generic hint says what a north star is; this says what this
              one commits the brain to. */}
          <Show when={key === 'north_star_metric'}>
            {(() => {
              const current = () => drafts()[key] ?? props.model?.settings[key] ?? ''
              const meaning = () => northStarMeaning(current())
              const technical = () => {
                const option = goals.data?.options.find(o => o.value === current())
                return option ? northStarTechnicalName(option) : undefined
              }
              return <>
                <Show when={meaning()}>
                  <small class="text-xs leading-relaxed text-secondary-foreground">{meaning()}</small>
                </Show>
                {/* The plain-language name is what the row reads; the value
                    is what the server records, what traces name and what
                    support asks for — precision keeps its own name here. */}
                <Show when={current()}>
                  <small class="block text-xs leading-relaxed text-muted-foreground">Stored as <code class="text-xs">{current()}</code><Show when={technical()}>{t => ` — ${t()}`}</Show></small>
                </Show>
              </>
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
  </Section>
}
