import { CommunityHouseRulesPanel } from '../components/CommunityHouseRulesPanel'
import { ReplyQueuePanel } from '../components/ReplyQueuePanel'
import { For, Show, createSignal, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { CommunityItem, CommunityObservationItem, CommunityEntityItem, AudiencePlaceInput } from '../lib/types'
import { SkeletonRows } from '../components/Skeleton'
import { TabBar, TabPanel, useTabPanels, SectionTitle, ErrorCard } from '../components/layout'
import { toast } from '../components/app/toast'
import { errorMessage, humanizeToken, httpUrl } from '../lib/format'
import { cn } from '../lib/cn'
import { Button } from '../components/app/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { NativeSelect } from '../components/ui/native-select'
import { Field } from '../components/ui/field'
import { writeGuard } from '../lib/read-only'
import { ArrowUpRight, ChevronRight } from 'lucide-solid'

/**
 * Community Intelligence content — the Communities tab inside the Audience page.
 *
 * Combines:
 * - CRUD: add a community, import a list (previously only in Portfolio)
 * - Intelligence: observations, entities, membership tracking, draft intros
 *
 * Communities are grouped by platform with collapsible sections and
 * per-group "show more" pagination, so a long roster does not become
 * an endless scroll.
 */

/// Ordered so the queue reads as work: what to do, then what is in flight,
/// then what is settled.
const MEMBERSHIP_ORDER = ['not_joined', 'joining', 'joined', 'rejected', 'not_a_fit'] as const

const MEMBERSHIP_LABEL: Record<string, string> = {
  not_joined: 'To join',
  joining: 'Asked to join',
  joined: 'Joined',
  rejected: 'They said no',
  not_a_fit: 'Not a fit',
}

const PLACE_KINDS = [
  'subreddit',
  'discord',
  'telegram',
  'lemmy',
  'forum',
  'facebook_group',
  'instagram',
  'tiktok',
  'youtube',
  'playlist',
  'zine',
  'festival',
  'other',
] as const

const PLATFORM_FOR_KIND: Record<string, string> = {
  subreddit: 'reddit',
  discord: 'discord',
  telegram: 'telegram',
  lemmy: 'lemmy',
  forum: 'forum',
  facebook_group: 'facebook',
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  playlist: 'spotify',
  zine: 'web',
  festival: 'web',
  other: 'web',
}

/// Platforms are sorted by community count descending, then alphabetically.
/// Unknown platforms sort after known ones.
const PLATFORM_ORDER = [
  'reddit', 'discord', 'telegram', 'facebook', 'instagram',
  'tiktok', 'youtube', 'spotify', 'lemmy', 'forum', 'web',
]

const PLATFORM_LABEL: Record<string, string> = {
  reddit: 'Reddit',
  discord: 'Discord',
  telegram: 'Telegram',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  spotify: 'Spotify',
  lemmy: 'Lemmy',
  forum: 'Forums',
  web: 'Web / Other',
}

const GROUP_PAGE_SIZE = 6

const countBy = (items: CommunityItem[], state: string) =>
  items.filter((i) => i.membershipState === state).length

function qualityLabel(quality: number): string {
  if (quality >= 8000) return 'high'
  if (quality >= 4000) return 'medium'
  if (quality > 0) return 'low'
  return 'none'
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}

export function CommunityIntelligenceContent(props: { slug: string }) {
  // Tab ids carry the `ci-` prefix: this content now mounts inside the
  // Audience page's own 'communities' TabPanel, and a bare 'communities'
  // would emit `tab-communities`/`tabpanel-communities` twice on one page —
  // duplicate ids cross-wire the aria-controls/labelledby pairs. Its URL
  // param is `subtab` for the same reason: writing `?tab=ci-intelligence`
  // would evict the host page's own `?tab=communities`.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('ci-communities', ['ci-communities', 'ci-intelligence'], 'subtab')
  const [selectedPlaceId, setSelectedPlaceId] = createSignal<string | null>(null)
  const [draftFor, setDraftFor] = createSignal<string | null>(null)
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())
  const [groupPageSize, setGroupPageSize] = createSignal<Record<string, number>>({})

  // ── Add / Import state ──
  const [adding, setAdding] = createSignal(false)
  const [importing, setImporting] = createSignal(false)
  const [importText, setImportText] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [notice, setNotice] = createSignal<{ tone: 'good' | 'bad'; message: string } | null>(null)
  const [kind, setKind] = createSignal<string>('subreddit')
  const [name, setName] = createSignal('')
  const [url, setUrl] = createSignal('')

  // The draft is fetched on demand, not for every card: it reads the
  // community's observations and there is no reason to do that 66 times for a
  // page the operator scans.
  const draft = useQuery(() => ({
    queryKey: ['community-intro-draft', props.slug, draftFor()],
    queryFn: () => api.communityIntroDraft(props.slug, draftFor()!),
    enabled: draftFor() !== null,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const loadDraft = (placeId: string) =>
    setDraftFor((current) => (current === placeId ? null : placeId))

  const setMembership = async (placeId: string, state: string) => {
    try {
      await api.setCommunityMembership(props.slug, placeId, state)
      toast.success(`Marked ${MEMBERSHIP_LABEL[state] ?? state}.`)
      await communities.refetch()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not record that'))
    }
  }

  const communities = useQuery(() => ({
    queryKey: ['community-intelligence', props.slug],
    queryFn: () => api.communityIntelligenceCommunities(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  // Consolidated community detail — observations + entities in one
  // round-trip. Each section degrades independently.
  const detail = useQuery(() => ({
    queryKey: ['community-detail', props.slug, selectedPlaceId()],
    queryFn: () => api.communityDetail(props.slug, selectedPlaceId()!),
    enabled: !!selectedPlaceId(),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  // Derive observations and entities from the consolidated response.
  const observations = () => {
    const d = detail.data?.observations
    return d && !('__error' in d) ? d.items : []
  }
  const entities = () => {
    const d = detail.data?.entities
    return d && !('__error' in d) ? d.items : []
  }

  // ── Add / Import handlers (ported from CommunitiesPanel) ──
  const submit = async (event: Event) => {
    event.preventDefault()
    if (saving()) return
    setSaving(true)
    setNotice(null)
    try {
      await api.upsertAudiencePlace(props.slug, {
        placeKind: kind(),
        platform: PLATFORM_FOR_KIND[kind()] ?? 'web',
        name: name().trim(),
        url: url().trim(),
      })
      setNotice({ tone: 'good', message: `Registered ${name().trim()}.` })
      setName(''); setUrl(''); setAdding(false)
      await communities.refetch()
    } catch (error) {
      setNotice({ tone: 'bad', message: errorMessage(error, 'Could not register the community') })
    } finally {
      setSaving(false)
    }
  }

  const runImport = async (event: Event) => {
    event.preventDefault()
    if (saving()) return
    let parsed: unknown
    try {
      parsed = JSON.parse(importText())
    } catch {
      setNotice({ tone: 'bad', message: 'That is not valid JSON.' })
      return
    }
    let importPlaces: unknown
    if (Array.isArray(parsed)) {
      importPlaces = parsed
    } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Record<string, unknown>).places)) {
      importPlaces = (parsed as Record<string, unknown>).places
    } else {
      setNotice({ tone: 'bad', message: 'Expected an array of places, or { "places": [...] }.' })
      return
    }
    if (!Array.isArray(importPlaces) || importPlaces.length === 0) {
      setNotice({ tone: 'bad', message: 'Expected an array of places, or { "places": [...] }.' })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const result = await api.importAudiencePlaces(props.slug, importPlaces as AudiencePlaceInput[])
      setNotice({ tone: 'good', message: `Imported ${result.imported ?? importPlaces.length}.` })
      setImportText(''); setImporting(false)
      await communities.refetch()
    } catch (error) {
      setNotice({ tone: 'bad', message: errorMessage(error, 'Import failed') })
    } finally {
      setSaving(false)
    }
  }

  // ── Platform grouping ──
  const groupedByPlatform = createMemo(() => {
    const items = communities.data?.items ?? []
    const groups = new Map<string, CommunityItem[]>()
    for (const item of items) {
      const platform = item.platform || 'web'
      if (!groups.has(platform)) groups.set(platform, [])
      groups.get(platform)!.push(item)
    }
    // Sort platforms: known order first, then by count desc, then alpha
    return [...groups.entries()].sort((a, b) => {
      const ai = PLATFORM_ORDER.indexOf(a[0])
      const bi = PLATFORM_ORDER.indexOf(b[0])
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      if (b[1].length !== a[1].length) return b[1].length - a[1].length
      return a[0].localeCompare(b[0])
    })
  })

  const toggleCollapse = (platform: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(platform)) next.delete(platform)
      else next.add(platform)
      return next
    })
  }

  const groupLimit = (platform: string) => groupPageSize()[platform] ?? GROUP_PAGE_SIZE
  const showMore = (platform: string) => {
    setGroupPageSize((current) => ({
      ...current,
      [platform]: (current[platform] ?? GROUP_PAGE_SIZE) + GROUP_PAGE_SIZE,
    }))
  }

  const viewObservations = (placeId: string) => {
    setSelectedPlaceId(placeId)
    switchTab('ci-intelligence')
  }

  const selectedCommunity = () =>
    communities.data?.items?.find((c) => c.placeId === selectedPlaceId())

  return (
    <div class="space-y-4">
      <p class="text-sm text-muted-foreground">Places your listeners already gather: subreddits, forums, Discord servers. The brain observes them; joining is a person's job, and this is the queue for it.</p>

      <ReplyQueuePanel slug={props.slug} />

      <TabBar
        class="mb-0"
        active={activeTab()}
        onChange={switchTab}
      onPrefetch={prefetch}
        tabs={[
          { id: 'ci-communities', label: 'Directory' },
          { id: 'ci-intelligence', label: 'Observations' },
        ]}
      />

      {/* ─── Communities Tab ────────────────────────────────────── */}
      <TabPanel active={activeTab()} id="ci-communities" visited={isVisited('ci-communities')}>
        {/* ── Add form ── */}
        <Show when={adding()}>
          <form class="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={submit}>
            <Field label="Kind"><NativeSelect value={kind()} onChange={event => setKind(event.currentTarget.value)}><For each={PLACE_KINDS}>{value => <option value={value}>{value.replaceAll('_', ' ')}</option>}</For></NativeSelect></Field>
            <Field label="Name" hint="as people refer to it, e.g. r/progmetal"><Input value={name()} onInput={event => setName(event.currentTarget.value)} required maxlength={200} /></Field>
            <Field label="URL" hint="identity is the platform and URL together"><Input value={url()} onInput={event => setUrl(event.currentTarget.value)} required type="url" maxlength={512} /></Field>
            <div class="flex justify-end mt-4">
              <Button writes size="sm" type="submit" disabled={saving() || !name().trim() || !url().trim()}>
                {saving() ? 'Registering…' : 'Register'}
              </Button>
            </div>
          </form>
        </Show>

        {/* ── Import form ── */}
        <Show when={importing()}>
          <form onSubmit={runImport}>
            <Field label="Paste a scan" hint="A JSON array of { placeKind, platform, name, url } — genres, memberCount, notes and country optional. Re-importing the same platform and URL refreshes it rather than duplicating it.">
              <Textarea
                class="font-mono p-3"
                rows={8}
                spellcheck={false}
                value={importText()}
                onInput={event => setImportText(event.currentTarget.value)}
                placeholder='[{"placeKind":"subreddit","platform":"reddit","name":"r/progmetal","url":"https://reddit.com/r/progmetal"}]'
              />
            </Field>
            <div class="flex justify-end mt-4">
              <Button writes size="sm" type="submit" disabled={saving() || !importText().trim()}>
                {saving() ? 'Importing…' : 'Import'}
              </Button>
            </div>
          </form>
        </Show>

        <Show when={notice()}>
          {value => <p class={`p-3 rounded-md text-sm ${value().tone === 'good' ? 'bg-success-foreground/10 text-success-foreground' : 'bg-destructive/10 text-destructive'}`}>{value().message}</p>}
        </Show>

        {/* ── Community intelligence ── */}
        <div class="flex items-center gap-2 mt-4 mb-4">
          <Button writes variant="outline" size="sm" onClick={() => { setImporting(false); setAdding(value => !value) }}>
            {adding() ? 'Cancel' : 'Add a community'}
          </Button>
          <Button writes variant="outline" size="sm" onClick={() => { setAdding(false); setImporting(value => !value) }}>
            {importing() ? 'Cancel' : 'Import a list'}
          </Button>
        </div>

        <Show when={communities.error}>
          <ErrorCard>
            {communities.error instanceof Error ? communities.error.message : 'Community intelligence channel unavailable'}
          </ErrorCard>
        </Show>

        <Show when={!communities.error && communities.isPending}>
          <SkeletonRows />
        </Show>

        <Show when={communities.data}>
          <div class="flex flex-wrap items-center gap-3 mt-3 mb-4">
            <For each={MEMBERSHIP_ORDER}>
              {(state) => (
                <Show when={countBy(communities.data?.items ?? [], state) > 0}>
                  <span class="inline-flex items-center gap-1 text-sm text-muted-foreground" data-state={state}>
                    <strong class="font-bold text-foreground">{countBy(communities.data?.items ?? [], state)}</strong> {MEMBERSHIP_LABEL[state]}
                  </span>
                </Show>
              )}
            </For>
          </div>

          <Show when={(communities.data?.items ?? []).length === 0}>
            <p class="p-4 text-sm text-muted-foreground">
              {authState.isPlatformLevel()
                ? 'Nothing tracked yet. The reddit-scanner and audience-research agents add communities as they find them; give them a cycle. Or use '
                : 'Nothing tracked yet. The brain adds communities as its scans find them; give it a cycle. Or use '}
              <strong>Add a community</strong>{' '}
              above to register one manually.
            </p>
          </Show>

          {/* ── Platform-grouped community cards ── */}
          <For each={groupedByPlatform()}>
            {([platform, items]) => {
              const isCollapsed = () => collapsed().has(platform)
              const visible = () => items.slice(0, groupLimit(platform))
              const hasMore = () => items.length > visible().length

              return (
                <div class="mb-4" data-platform={platform}>
                  <Button
                    variant="ghost"
                    class="h-auto w-full justify-start gap-2 whitespace-normal px-3 py-2 text-left font-normal"
                    onClick={() => toggleCollapse(platform)}
                    aria-expanded={!isCollapsed()}
                  >
                    <ChevronRight class={cn('size-3.5 text-muted-foreground transition-transform', !isCollapsed() && 'rotate-90')} aria-hidden="true" />
                    <span class="text-sm font-semibold text-foreground" data-platform={platform}>
                      {PLATFORM_LABEL[platform] ?? platform}
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {items.length} {items.length === 1 ? 'community' : 'communities'}
                    </span>
                    <Show when={countBy(items, 'not_joined') > 0}>
                      <span class="text-xs text-warning-foreground font-medium">
                        {countBy(items, 'not_joined')} to join
                      </span>
                    </Show>
                  </Button>

                  <Show when={!isCollapsed()}>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      <For each={visible()}>
                        {(item: CommunityItem) => (
                          <article class="flex flex-col gap-2 p-4 rounded-lg border border-border bg-card" data-state={item.membershipState}>
                            <header class="flex items-start justify-between gap-2">
                              <div>
                                <Show when={httpUrl(item.url)} fallback={<span class="text-sm font-semibold text-foreground">{item.name}</span>}>
                                  {url => <a class="text-sm font-semibold text-foreground hover:text-primary transition-colors" href={url()} target="_blank" rel="noreferrer noopener">{item.name}</a>}
                                </Show>
                                <div class="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <span class="text-xs text-muted-foreground uppercase tracking-wider" data-platform={item.platform}>{item.placeKind.replaceAll('_', ' ')}</span>
                                  <Show when={item.memberCount}>
                                    <span><span class="font-medium text-foreground tabular-nums">{item.memberCount!.toLocaleString()}</span> members</span>
                                  </Show>
                                  <Show when={item.countryCode}><span>· {item.countryCode}</span></Show>
                                </div>
                              </div>
                              <span class={cn('text-xs font-medium px-2 py-0.5 rounded-full', item.membershipState === 'not_joined' ? 'bg-warning-foreground/10 text-warning-foreground' : item.membershipState === 'joining' ? 'bg-primary/10 text-primary' : item.membershipState === 'joined' ? 'bg-success-foreground/10 text-success-foreground' : item.membershipState === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')} data-state={item.membershipState}>
                                {MEMBERSHIP_LABEL[item.membershipState] ?? humanizeToken(item.membershipState)}
                              </span>
                            </header>

                            <Show when={item.genres.length > 0}>
                              <div class="flex flex-wrap gap-1.5 mt-1">
                                <For each={item.genres.slice(0, 5)}>{(g) => <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">{g}</span>}</For>
                              </div>
                            </Show>

                            <Show when={item.membershipNote}>
                              <p class="text-xs text-muted-foreground italic mt-1">{item.membershipNote}</p>
                            </Show>

                            <footer class="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border">
                              <Show when={httpUrl(item.url)}>
                                {url => <a class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors" href={url()} target="_blank" rel="noreferrer noopener">Open<ArrowUpRight class="size-3.5" aria-hidden="true" /></a>}
                              </Show>
                              <Button variant="ghost" size="sm" onClick={() => loadDraft(item.placeId)}>Draft intro</Button>
                              <NativeSelect size="sm" class="w-auto"
                                value={item.membershipState}
                                onChange={(e) => setMembership(item.placeId, e.currentTarget.value)}
                                {...writeGuard()}
                              >
                                <For each={MEMBERSHIP_ORDER}>
                                  {(s) => <option value={s}>{MEMBERSHIP_LABEL[s]}</option>}
                                </For>
                              </NativeSelect>
                              <Button variant="ghost" size="sm" onClick={() => viewObservations(item.placeId)}>Observations</Button>
                            </footer>

                            <Show when={draftFor() === item.placeId}>
                              <div class="mt-3 p-3 rounded-lg border border-border bg-background">
                                <Show when={draft.isFetching && !draft.data}><p class="text-muted-foreground">Reading what was observed here…</p></Show>
                                <Show when={draft.data}>
                                  <Show when={!draft.data!.grounded}>
                                    <p class="p-3 rounded-md text-sm bg-warning-foreground/10 text-warning-foreground">
                                      Nothing observed here yet, so this is a blank rather than a draft.
                                    </p>
                                  </Show>
                                  <Show when={draft.data!.sharedGenres.length > 0}>
                                    <p class="text-muted-foreground">
                                      Overlaps on {draft.data!.sharedGenres.join(', ')}.
                                    </p>
                                  </Show>
                                  <Textarea class="font-mono p-2" rows={10} readonly>{draft.data!.draft}</Textarea>
                                  <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(draft.data!.draft)}>
                                    Copy
                                  </Button>
                                </Show>
                              </div>
                            </Show>
                          </article>
                        )}
                      </For>
                    </div>

                    <Show when={hasMore()}>
                      <Button variant="ghost" size="sm" onClick={() => showMore(platform)}>
                        Show {Math.min(GROUP_PAGE_SIZE, items.length - visible().length)} more
                      </Button>
                    </Show>
                  </Show>
                </div>
              )
            }}
          </For>
        </Show>
      </TabPanel>

      {/* ─── Intelligence Tab ────────────────────────────────────── */}
      <TabPanel active={activeTab()} id="ci-intelligence" visited={isVisited('ci-intelligence')}>
        <Show when={!selectedPlaceId()}>
          <p class="p-4 text-sm text-muted-foreground">Select a community from the Directory tab to view its observation history{authState.isPlatformLevel() ? ' and extracted entities' : ' and what was found there'}.</p>
        </Show>

        <Show when={selectedPlaceId()}>
          <SectionTitle eyebrow={authState.isPlatformLevel() ? 'COMMUNITY' : undefined} title={selectedCommunity()?.name ?? 'Community'} action={<Button variant="ghost" size="sm" onClick={() => { setSelectedPlaceId(null); switchTab('ci-communities') }}>Back to directory</Button>} />

          <CommunityHouseRulesPanel slug={props.slug} placeId={selectedPlaceId()!} />

          <h3>Observations</h3>
          <Show when={detail.isPending}><SkeletonRows /></Show>
          <Show when={detail.data?.observations && '__error' in detail.data!.observations}>
            <ErrorCard>Failed to load observations</ErrorCard>
          </Show>
          <Show when={detail.data}>
            <Show when={observations().length === 0}>
              <p class="p-4 text-sm text-muted-foreground">{authState.isPlatformLevel() ? 'No observations recorded yet. The worker will fetch on the next sweep.' : 'Nothing observed yet — the next sweep fetches it.'}</p>
            </Show>
            <div class="flex flex-col gap-2 mt-3">
              <For each={observations()}>
                {(obs: CommunityObservationItem) => (
                  <div class="p-3 rounded-lg border border-border bg-background">
                    <div class="flex items-center gap-2 text-xs">
                      <span class="font-medium text-foreground">{obs.source}</span>
                      <span class="text-xs font-medium px-2 py-0.5 rounded-full {(() => { const q = qualityLabel(obs.observationQuality); return q === 'high' ? 'bg-success-foreground/10 text-success-foreground' : q === 'medium' ? 'bg-warning-foreground/10 text-warning-foreground' : 'bg-muted text-muted-foreground'; })()}" data-quality={qualityLabel(obs.observationQuality)}>
                        {qualityLabel(obs.observationQuality)}
                      </span>
                      <time class="text-muted-foreground ml-auto">{formatTime(obs.observedAt)}</time>
                    </div>
                    <Show when={authState.isPlatformLevel()}>
                      <div class="text-xs text-muted-foreground mt-1">
                        <span>collector: {obs.collectorVersion}</span>
                      </div>
                      <Show when={obs.rawActivityMetrics}>
                        <pre class="text-xs text-muted-foreground whitespace-pre-wrap font-mono mt-2 p-2 rounded-md bg-background border border-border">{JSON.stringify(obs.rawActivityMetrics, null, 2)}</pre>
                      </Show>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <h3>{authState.isPlatformLevel() ? 'Extracted Entities (Latest)' : 'What it found (latest)'}</h3>
          <Show when={detail.isPending}><SkeletonRows /></Show>
          <Show when={detail.data?.entities && '__error' in detail.data!.entities}>
            <ErrorCard>{authState.isPlatformLevel() ? 'Failed to load entities' : 'Failed to load what it found'}</ErrorCard>
          </Show>
          <Show when={detail.data}>
            <Show when={entities().length === 0}>
              <p class="p-4 text-sm text-muted-foreground">{authState.isPlatformLevel() ? 'No entities extracted from the latest observation.' : 'Nothing was picked out of the latest observation.'}</p>
            </Show>
            <div class="flex flex-col gap-2 mt-3">
              <For each={entities()}>
                {(entity: CommunityEntityItem) => (
                  <div class="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
                    <span class="text-xs font-medium text-foreground">{entity.entityType}</span>
                    <span class="text-sm text-muted-foreground flex-1 min-w-0">{entity.entityRef}</span>
                    <div class="flex-1 h-1.5 rounded-full bg-border overflow-hidden max-w-32">
                      <div class="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(entity.strength / 10000) * 100}%` }} />
                    </div>
                    <span class="text-xs text-muted-foreground tabular-nums">{entity.strength}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </TabPanel>
    </div>
  )
}
