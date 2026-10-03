import { For, Index, Show, createMemo, createSignal } from 'solid-js'
import { SkeletonRows } from './Skeleton'
import { failureLine } from '../lib/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { PortfolioSettingsReadModel } from '../lib/types'
import { ErrorCard } from './layout'
import { SaveActions, SettingsRow, SettingsSection } from './ui/settings'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Input } from './ui/input'
import { FileInput } from './ui/file-input'
import { NativeSelect } from './ui/native-select'
import { northStarLabel, northStarMeaning, northStarTechnicalName } from '../lib/north-star'
import { writeGuard } from '../lib/read-only'

const LABELS: Record<string, string> = {
  brand_wordmark: 'Name in fan messages',
  member_site_base_url: 'Member site base URL',
  member_area_path: 'Member area path',
  live_page_path: 'Show page path (door QR)',
  synesthesia_campaign_slug: 'Synesthesia campaign slug',
  signal_enabled: 'Signal app',
  synesthesia_enabled: 'Synesthesia',
  north_star_metric: 'What the brain chases',
  tenant_intent: 'What the band is doing',
  act_style: 'What the act sounds like',
  act_home_city: 'Where the act is from',
  social_auto_post: 'Social auto-posting',
  social_autopost_platforms: 'Auto-posting platforms',
  ticketing_enabled: 'Ticket sales',
  growth_cadence_moments_per_month: 'Serious moments per month',
  growth_cadence_fillers_enabled: 'Filler calendar',
  crew_locale: 'Language the crew reads',
  team_weekly_ask_ceiling: 'Most asks per person per week',
  join_ask_variants: 'Join-ask posts (your words)',
  join_ask_cadence_days: 'Join-ask cadence (days)',
  join_ask_platforms: 'Join-ask channels',
  join_ask_image_url: 'Join-ask image',
}

// The flat grid used to render keys in the order the server grew them, which
// is no order at all — a boolean sat beside a JSON blob beside a URL. The
// groups below are the questions an operator actually brings to the page.
// A key the server adds later lands in Advanced rather than rendering
// unlabelled or vanishing.
// Each group is one Settings section with its own Cancel / Save, and each
// Settings sub-page shows the groups that belong to it: identity on Profile,
// app switches on Brand and apps, crew on Team, the rest on Workspace.
export type WorkspaceGroupId = 'identity' | 'links' | 'apps' | 'growth' | 'social' | 'crew' | 'advanced'

const GROUPS: { id: WorkspaceGroupId; title: string; description: string; bandDescription?: string; keys: string[] }[] = [
  {
    id: 'identity',
    title: 'How letters describe you',
    description: 'The name, sound and home city outreach drafts and fan messages use. "I am writing from …" is built from these.',
    keys: ['brand_wordmark', 'act_style', 'act_home_city'],
  },
  {
    id: 'links',
    title: 'Member links',
    description: 'Where the member links in emails, Signal and QR codes point.',
    keys: ['member_site_base_url', 'member_area_path', 'live_page_path'],
  },
  {
    id: 'apps',
    title: 'App switches',
    description: 'Which parts of the platform this tenant runs.',
    bandDescription: 'Which parts of the platform your act runs.',
    keys: ['signal_enabled', 'synesthesia_enabled', 'synesthesia_campaign_slug', 'ticketing_enabled'],
  },
  {
    id: 'growth',
    title: 'Growth brain',
    description: 'What the planner optimises for and how much it schedules.',
    keys: ['north_star_metric', 'tenant_intent', 'growth_cadence_moments_per_month', 'growth_cadence_fillers_enabled'],
  },
  {
    id: 'social',
    title: 'Social & join-ask',
    description: 'Posting to your own channels, and the words the weekly ask carries. Channels connect under Audience → Sources.',
    bandDescription: 'Posting to your own channels, and the words the weekly ask carries. Channels connect under Audience → Sources.',
    keys: ['social_auto_post', 'social_autopost_platforms', 'join_ask_platforms', 'join_ask_cadence_days', 'join_ask_variants', 'join_ask_image_url'],
  },
  {
    id: 'crew',
    title: 'How the crew is asked',
    description: 'How the people doing the work are spoken to and how much they are asked.',
    bandDescription: 'How the people doing the work are spoken to and how much they are asked.',
    keys: ['crew_locale', 'team_weekly_ask_ceiling'],
  },
]

const BOOLEAN_KEYS = new Set(['signal_enabled', 'synesthesia_enabled', 'social_auto_post', 'growth_cadence_fillers_enabled', 'ticketing_enabled'])
const NUMBER_KEYS = new Set(['growth_cadence_moments_per_month', 'join_ask_cadence_days', 'team_weekly_ask_ceiling'])
const PLATFORM_OPTIONS = ['facebook', 'instagram', 'telegram', 'discord']
// The autopost lane is narrower than the join-ask channels: it lists only
// platforms with a working publish path — X's write API is paid-tier and
// Discord has no social executor, so neither can be offered.
const AUTOPOST_PLATFORM_OPTIONS = ['facebook', 'instagram', 'telegram']
const PLATFORM_PICKER_OPTIONS: Record<string, string[]> = {
  join_ask_platforms: PLATFORM_OPTIONS,
  social_autopost_platforms: AUTOPOST_PLATFORM_OPTIONS,
}
const JOIN_ASK_VARIANT_MAX_CHARS = 500
const JOIN_ASK_VARIANT_MAX_ROWS = 5

// A key name alone does not say what the value does or what shape it takes.
// Each row carries what the value drives, and an example of a valid one — the
// two questions an operator has in front of an empty text field.
// `band` is the tenant-operator phrasing of the same hint — the workspace tab
// shows this panel to the band, where "this tenant" is the wrong name for
// their own act.
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
  live_page_path: {
    hint: "Path on the member site where a show's page lives. The door check-in QR opens {site}/{path}/{show}/ — set it to your site's layout, or phones at the door land on a missing page.",
    band: "Where a show's page lives on your site. The door check-in QR opens {site}/{path}/{show}/ — set it to your site's layout, or phones at the door land on a missing page.",
    example: 'shows',
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
  act_style: {
    hint: 'A few words for what the act sounds like — the pairings and asks that need a voice read this. Free text, because a fixed list would be a guess about scenes nobody here belongs to. 120 characters at most.',
    band: 'A few words for what you sound like — the pairings and asks that need a voice read this. 120 characters at most.',
    example: 'metalcore',
  },
  act_home_city: {
    hint: "The city letters say the act is from — 'a modern metal act from Wrocław'. Declared, never measured: the shows calendar is a schedule, not a hometown. Empty means the letter names no city.",
    band: "The city your letters say you are from — 'a metalcore act from Wrocław'. It is what you declare, not what the calendar suggests — a show in another city stays a gig, not a hometown. Empty means no city in the letter.",
    example: 'Wrocław',
  },
  brand_wordmark: {
    hint: 'The name push titles, crew mail and invitations sign with ("{name} — new show"). Leave blank to use the workspace name; set it only when the act styles its name differently. One line, 40 characters at most.',
    band: 'The name your fans see on every message ("{name} — new show"). Leave blank to use your workspace name. 40 characters at most.',
    example: 'MGŁA',
  },
  crew_locale: {
    hint: 'Language for task emails and the staff panel. Briefings are written in English and translated for the crew; a language nobody has written wording for yet reads as English rather than as blanks. Two-letter code, optionally with a region.',
    example: 'pl',
  },
  team_weekly_ask_ceiling: {
    hint: 'The most work the brain hands one person in a week. Attention is the one quantity with a ceiling by default — raise it and the same people carry more.',
    band: 'The most work you hand one person in a week. Raise it and the same people carry more.',
    example: '4',
  },
  social_auto_post: {
    hint: 'When enabled, the social post executor publishes to Facebook Pages, Instagram and Telegram instead of drafting for manual review. X always drafts. The publish guard still runs — a held post lands in the operator queue with its reason. Instagram needs an image.',
    band: 'When on, posts publish straight to Facebook Pages, Instagram and Telegram instead of waiting as drafts for your review. X always drafts. The safety check still runs — a held post lands in Needs you with its reason. Instagram needs an image.',
    example: 'false',
  },
  growth_cadence_moments_per_month: {
    hint: 'Serious moments (release, video, or show) the tenant commits to each month — each gets its vertical, tier decision and spend. 1 is the default; a tenant who beats it moves their own number up. 1–4.',
    band: 'Serious moments (release, video, or show) you commit to each month — each gets its vertical, tier decision and spend. 1 is the default; beat it and your number moves up. 1–4.',
    example: '1',
  },
  ticketing_enabled: {
    hint: "Whether this tenant sells tickets through the member site's own checkout. Needs the Stripe keys in Access — turning it on without them fails closed at checkout, not silently.",
    band: "Whether you sell tickets through your site's own checkout. Needs the Stripe keys — turning it on without them fails closed at checkout, not silently.",
    example: 'false',
  },
  growth_cadence_fillers_enabled: {
    hint: 'Whether the machine schedules fillers between serious moments — demos, harvest output, catalogue rotation, show material, no spend and no gate. The quiet weeks fill themselves.',
    example: 'true',
  },
  join_ask_variants: {
    hint: "One to five short posts asking followers to join the fanbase, in the band's own words. The system rotates them onto the tenant's own channels and appends the tracked join link; it never rewrites them. Empty means the weekly ask is off.",
    band: 'One to five short posts asking your followers to join, in your own words. We rotate them onto your own channels and add the join link — we never rewrite them. Empty means the weekly ask is off.',
    example: 'Jesteśmy w Signal — koncerty w pobliżu i bilety pierwsi. Dołącz:',
  },
  join_ask_cadence_days: {
    hint: 'Minimum days between two join-asks on the same channel. One post per channel per ISO week at most, whatever this says. 3–30; absent means 7.',
    example: '7',
  },
  join_ask_platforms: {
    hint: 'Channels the join-ask goes to. Facebook, Instagram and Telegram publish today; discord is accepted but held until its executor is wired. Absent means facebook,instagram.',
    band: 'Channels the join-ask goes to. Facebook, Instagram and Telegram publish today; discord waits until its sender exists. Absent means facebook,instagram.',
    example: 'facebook,instagram,telegram',
  },
  social_autopost_platforms: {
    hint: "Which platforms auto-post when Social auto-posting is on — the rest queue for a person instead of publishing, so removing Meta moves those drafts to the human queue. X always queues: its write API is paid-tier. To stop all auto-posting, switch Social auto-posting off. Absent means facebook,instagram,telegram.",
    band: 'Which platforms post themselves when Social auto-posting is on — the rest wait as drafts for you to publish. X always waits: we cannot post to X for you. To stop all auto-posting, switch Social auto-posting off.',
    example: 'telegram',
  },
  join_ask_image_url: {
    hint: 'The picture every join-ask post carries — an app screenshot works best. Uploaded here, served from the tenant over https so Facebook, Instagram and Telegram can fetch it. Telegram needs it for a photo post; Instagram always needs an image.',
    band: 'The picture every join-ask post carries — an app screenshot works best. Uploaded here and served over https so Facebook, Instagram and Telegram can fetch it. Telegram needs it for a photo post; Instagram always needs an image.',
    example: '',
  },
}

// The variants field stores a JSON list; the editor is rows of text. Parse
// once per model — a stored value that is not a list reads as empty rows,
// which is the same state the evaluator acts on.
function parseVariants(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function WorkspaceSettingsPanel(props: { slug: string; groups?: WorkspaceGroupId[] }) {
  const showGroup = (id: WorkspaceGroupId) => !props.groups || props.groups.includes(id)
  const queryClient = useQueryClient()
  const model = useQuery(() => ({
    queryKey: ['tenant-settings', props.slug],
    queryFn: () => api.tenantSettings(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const settingsModel = () => model.data as PortfolioSettingsReadModel | undefined

  const [drafts, setDrafts] = createSignal<Record<string, string>>({})
  const [pendingGroup, setPendingGroup] = createSignal<string | null>(null)
  const [errorText, setErrorText] = createSignal<{ group: string; text: string } | null>(null)
  const [savedGroup, setSavedGroup] = createSignal<string | null>(null)
  const [uploadError, setUploadError] = createSignal<string | null>(null)
  const [uploading, setUploading] = createSignal(false)

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

  const keys = createMemo(() => settingsModel()?.editable_keys ?? [])
  // Keys the groups do not name land in Advanced — a new editable key is a
  // server change, and this tab should show it rather than pretend it is
  // not there.
  const groupedKeys = createMemo(() => new Set(GROUPS.flatMap(g => g.keys)))
  const advancedKeys = createMemo(() => keys().filter(k => !groupedKeys().has(k)))
  const value = (key: string) => drafts()[key] ?? settingsModel()?.settings[key] ?? ''
  const dirty = (key: string) =>
    drafts()[key] !== undefined && drafts()[key] !== settingsModel()?.settings[key]

  // A section's Save sends every changed key in it, one call per key — the
  // endpoint takes one key at a time. A failure stops there and keeps the
  // unsent drafts, so nothing the operator typed is lost.
  const save = useMutation(() => ({
    mutationFn: async ({ group, groupKeys }: { group: string; groupKeys: string[] }) => {
      setPendingGroup(group); setErrorText(null); setSavedGroup(null)
      for (const key of groupKeys.filter(dirty)) {
        await api.updatePortfolioSetting(props.slug, key, drafts()[key] ?? '')
        setDrafts(current => {
          const next = { ...current }
          delete next[key]
          return next
        })
      }
    },
    onSuccess: async (_result, { group }) => {
      setSavedGroup(group)
      setPendingGroup(null)
      await queryClient.invalidateQueries({ queryKey: ['tenant-settings', props.slug] })
    },
    onError: async (error, { group }) => {
      setPendingGroup(null)
      setErrorText({ group, text: failureLine("Couldn't save your changes", error) })
      await queryClient.invalidateQueries({ queryKey: ['tenant-settings', props.slug] })
    },
  }))
  const cancelGroup = (groupKeys: string[]) => {
    setDrafts(current => {
      const next = { ...current }
      for (const key of groupKeys) delete next[key]
      return next
    })
    setErrorText(null)
  }

  const uploadImage = async (file: File) => {
    setUploading(true); setUploadError(null)
    try {
      const uploaded = await api.uploadMedia(props.slug, file)
      setDrafts(current => ({ ...current, join_ask_image_url: uploaded.url }))
    } catch (error) {
      setUploadError(failureLine("Couldn't upload the file", error))
    } finally {
      setUploading(false)
    }
  }

  // What blocks Save for the structured editors — the check the server will
  // apply anyway, run early so the operator sees it on the row, not in a
  // refusal after the fact.
  const saveBlockedReason = (key: string): string | null => {
    if (!dirty(key)) return null
    const draft = drafts()[key] ?? ''
    if (key === 'join_ask_variants') {
      const rows = parseVariants(draft)
      if (rows.length === 0) return 'One post at least — an empty list turns the weekly ask off.'
      if (rows.length > JOIN_ASK_VARIANT_MAX_ROWS) return `Five posts at most — this list has ${rows.length}.`
      if (rows.some(r => !r.trim())) return 'A blank row cannot publish — fill it or remove it.'
      const long = rows.find(r => r.trim().length > JOIN_ASK_VARIANT_MAX_CHARS)
      if (long) return `Each post is ${JOIN_ASK_VARIANT_MAX_CHARS} characters at most.`
    }
    if (key === 'join_ask_platforms' && !draft.trim()) return 'Pick at least one channel, or the ask has nowhere to go.'
    if (key === 'social_autopost_platforms' && !draft.trim()) return 'Pick at least one platform — to stop all auto-posting, switch Social auto-posting off.'
    if (key === 'join_ask_cadence_days') {
      const n = Number(draft)
      if (!Number.isInteger(n) || n < 3 || n > 30) return 'Whole days between 3 and 30.'
    }
    if (key === 'join_ask_image_url' && draft.trim() && !/^https:\/\/.+/.test(draft.trim()))
      return 'The image must be an https:// URL — Meta and Telegram fetch it publicly.'
    if (key === 'member_site_base_url' && draft.trim() && !/^https:\/\/[^/]+$/.test(draft.trim().replace(/\/$/, '')))
      return 'An https:// origin with no path — https://your-band.example, not a page on it.'
    return null
  }

  const row = (key: string) => (
    <SettingsRow
      for={`setting-${key}`}
      label={<>
        {LABELS[key] ?? key}
        <Show when={settingsModel()?.overridden.includes(key)}>
          {' '}<Badge variant="warning">override</Badge>
        </Show>
      </>}
      hint={HINTS[key] ? <>{HINTS[key]!.band && !authState.isPlatformLevel() ? HINTS[key]!.band : HINTS[key]!.hint}<Show when={!BOOLEAN_KEYS.has(key) && !NUMBER_KEYS.has(key) && key !== 'north_star_metric' && key !== 'join_ask_image_url' && !PLATFORM_PICKER_OPTIONS[key] && HINTS[key]!.example}> Example: <code class="text-xs">{HINTS[key]!.example}</code></Show></> : undefined}
    >
    <div class="flex flex-col gap-1.5">
      <Show
        when={BOOLEAN_KEYS.has(key)}
        fallback={
          <Show
            when={enumOptions(key)}
            fallback={
              <Show
                when={key === 'join_ask_variants'}
                fallback={
                  <Show
                    when={PLATFORM_PICKER_OPTIONS[key]}
                    fallback={
                      <Show
                        when={key === 'join_ask_image_url'}
                        fallback={
                          <Input id={`setting-${key}`}
                            type={NUMBER_KEYS.has(key) ? 'number' : 'text'}
                            value={value(key)}
                            placeholder={HINTS[key]?.example}
                            onInput={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
                            {...writeGuard()}
                          />
                        }
                      >
                        {/* The image is a URL the platforms fetch — the picker
                            uploads the file and drafts the URL; Save then
                            stores it like every other setting. */}
                        <div class="flex flex-col gap-2">
                          <Show when={value('join_ask_image_url').trim()}>
                            <img
                              src={value('join_ask_image_url')}
                              alt="Join-ask image preview"
                              class="max-h-40 w-auto rounded-md object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                            />
                          </Show>
                          <div class="flex items-center gap-2">
                            {/* The FileInput primitive renders visually hidden
                                by contract; the label around it is the drawn
                                control. */}
                            <label class="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/60 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                              {uploading() ? 'Uploading…' : 'Choose image…'}
                              <FileInput
                                writes
                                accept="image/png,image/jpeg,image/webp"
                                disabled={uploading()}
                                onChange={e => {
                                  const file = e.currentTarget.files?.[0]
                                  if (file) void uploadImage(file)
                                  e.currentTarget.value = ''
                                }}
                              />
                            </label>
                            <Show when={value('join_ask_image_url').trim()}>
                              <Button variant="ghost" size="sm" writes
                                onClick={() => setDrafts(current => ({ ...current, join_ask_image_url: '' }))}>
                                Clear
                              </Button>
                            </Show>
                          </div>
                          <Show when={uploading()}><small class="text-xs text-muted-foreground">Uploading…</small></Show>
                          <Show when={uploadError()}><small class="text-xs text-destructive">{uploadError()}</small></Show>
                        </div>
                      </Show>
                    }
                  >
                    {/* One chip per channel the field accepts — the stored
                        value is the comma list the reader parses. */}
                    <div class="flex flex-wrap gap-1.5">
                      <For each={PLATFORM_PICKER_OPTIONS[key] ?? []}>{platform => {
                        // The server stores the comma list verbatim but
                        // validates case-insensitively — normalise here so a
                        // stored "Instagram" still reads selected and a
                        // toggle writes the canonical token, not a second one.
                        const selected = () => (value(key)).split(',').map(s => s.trim().toLowerCase()).includes(platform)
                        return <Button
                          variant={selected() ? 'secondary' : 'outline'}
                          size="sm"
                          writes
                          onClick={() => {
                            const current = value(key).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
                            const next = current.includes(platform)
                              ? current.filter(p => p !== platform)
                              : [...current, platform]
                            setDrafts(d => ({ ...d, [key]: next.join(',') }))
                          }}
                        >{platform}</Button>
                      }}</For>
                    </div>
                  </Show>
                }
              >
                <VariantListEditor
                  value={() => value('join_ask_variants')}
                  onChange={json => setDrafts(current => ({ ...current, join_ask_variants: json }))}
                  disabled={Boolean(writeGuard().disabled)}
                />
              </Show>
            }
          >
            {options => (
              <NativeSelect id={`setting-${key}`} value={value(key)}
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
        <NativeSelect id={`setting-${key}`} value={value(key) || 'false'}
          onChange={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
          {...writeGuard()}
        >
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </NativeSelect>
      </Show>
      <Show when={key === 'tenant_intent'}>
        {(() => {
          const current = () => value(key)
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
      {/* What the selected goal means, under the selector that chose it. */}
      <Show when={key === 'north_star_metric'}>
        {(() => {
          const current = () => value(key)
          const meaning = () => northStarMeaning(current())
          const technical = () => {
            const option = goals.data?.options.find(o => o.value === current())
            return option ? northStarTechnicalName(option) : undefined
          }
          return <>
            <Show when={meaning()}>
              <small class="text-xs leading-relaxed text-secondary-foreground">{meaning()}</small>
            </Show>
            <Show when={current()}>
              <small class="block text-xs leading-relaxed text-muted-foreground">Stored as <code class="text-xs">{current()}</code><Show when={technical()}>{t => ` — ${t()}`}</Show></small>
            </Show>
          </>
        })()}
      </Show>
      <Show when={saveBlockedReason(key)}>{reason =>
        <small class="text-xs text-warning-foreground">{reason()}</small>
      }</Show>
    </div>
    </SettingsRow>
  )

  const group = (id: string, title: string, description: string, bandDescription: string | undefined, groupKeys: string[]) => {
    const shown = () => groupKeys.filter(k => keys().includes(k))
    const groupDirty = () => shown().some(dirty)
    const blocked = () => shown().map(saveBlockedReason).find(Boolean) ?? null
    return <Show when={shown().length > 0}>
      <SettingsSection
        title={title}
        description={bandDescription && !authState.isPlatformLevel() ? bandDescription : description}
        actions={<SaveActions
          dirty={groupDirty()}
          pending={pendingGroup() === id}
          blocked={blocked() ? 'Fix the highlighted field first.' : null}
          saved={savedGroup() === id}
          onCancel={() => cancelGroup(shown())}
          onSave={() => save.mutate({ group: id, groupKeys: shown() })}
        />}
      >
        <For each={shown()}>{key => row(key)}</For>
        <Show when={errorText()?.group === id}>
          <div class="py-4"><ErrorCard>{errorText()!.text}</ErrorCard></div>
        </Show>
      </SettingsSection>
    </Show>
  }

  return <>
    <Show when={model.isPending}>
      <SkeletonRows count={4} />
    </Show>
    <Show when={model.error}>{error => <ErrorCard title="Couldn't load settings" error={error()} onRetry={() => void model.refetch()} />}</Show>
    <Show when={settingsModel()}>
      <For each={GROUPS.filter(g => showGroup(g.id))}>{g => group(g.id, g.title, g.description, g.bandDescription, g.keys)}</For>
      <Show when={showGroup('advanced')}>
        {group('advanced', 'Advanced', 'Editable keys the groups above do not name yet — new settings land here until they get a home and a label.', undefined, advancedKeys())}
      </Show>
    </Show>
  </>
}

// The join-ask posts as the band writes them: rows of text, not a JSON blob.
// The stored value is the JSON list the evaluator parses — this component is
// the only place the translation lives, so what the band edits and what the
// server stores can never drift apart.
function VariantListEditor(props: {
  value: () => string
  onChange: (json: string) => void
  disabled: boolean
}) {
  const rows = createMemo(() => parseVariants(props.value()))
  // Blanks are kept verbatim — a row emptied mid-edit must stay visible so
  // the blocked-save reason has something to point at; the server never sees
  // one because save refuses while a blank row exists.
  const setRows = (next: string[]) => props.onChange(JSON.stringify(next))

  return <div class="flex flex-col gap-2">
    {/* Index, not For: For reconciles by item identity, and every keystroke
        re-serializes to JSON — the edited row's string is a new identity, so
        its input element was destroyed and remounted each character and focus
        died after one keystroke. Index keys by position: the element persists
        and only its value accessor updates. */}
    <Index each={rows()}>{(text, index) => (
      <div class="flex items-start gap-2">
        <div class="flex-1">
          <Input
            value={text()}
            maxLength={JOIN_ASK_VARIANT_MAX_CHARS + 50}
            disabled={props.disabled}
            onInput={e => {
              const next = rows().slice()
              next[index] = e.currentTarget.value
              // Keep empty rows in the draft so deleting a row's text does not
              // collapse it out from under the cursor; the serializer drops
              // blanks at save, and the blocked reason names them first.
              props.onChange(JSON.stringify(next))
            }}
          />
          <small class="text-xs text-muted-foreground">{text().trim().length}/{JOIN_ASK_VARIANT_MAX_CHARS}</small>
        </div>
        <Button variant="ghost" size="sm" writes disabled={props.disabled}
          onClick={() => setRows(rows().filter((_, i) => i !== index))}
          aria-label="Remove this post">
          Remove
        </Button>
      </div>
    )}</Index>
    <Show when={rows().length < JOIN_ASK_VARIANT_MAX_ROWS}>
      <div>
        <Button variant="outline" size="sm" writes disabled={props.disabled}
          onClick={() => props.onChange(JSON.stringify([...rows(), '']))}>
          Add a post
        </Button>
      </div>
    </Show>
    <Show when={rows().length === 0}>
      <small class="text-xs text-muted-foreground">No posts yet — the weekly ask is off until the first one is written.</small>
    </Show>
  </div>
}
