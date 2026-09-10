import { For, Show, createSignal, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { CommunityItem, CommunityObservationItem, CommunityEntityItem, AudiencePlaceInput } from '../lib/types'
import { SkeletonRows } from '../components/Skeleton'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader, SectionTitle, ErrorCard } from '../components/layout'
import { toast } from '../components/ui/toast'
import { errorMessage } from '../lib/format'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { NativeSelect } from '../components/ui/native-select'

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
  const { activeTab, switchTab, isVisited } = useTabPanels('communities')
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
    switchTab('intelligence')
  }

  const selectedCommunity = () =>
    communities.data?.items?.find((c) => c.placeId === selectedPlaceId())

  return (
    <PageShell>
      <PageHeader eyebrow="AUDIENCE" title="Communities" description="Places your listeners already gather — subreddits, forums, Discord servers. The brain observes them; joining them is a person's job, and this page is the queue for it." />

      <TabBar
        active={activeTab()}
        onChange={switchTab}
        tabs={[
          { id: 'communities', label: 'Communities' },
          { id: 'intelligence', label: 'Intelligence' },
        ]}
      />

      {/* ─── Communities Tab ────────────────────────────────────── */}
      <TabPanel active={activeTab()} id="communities" visited={isVisited('communities')}>
        {/* ── Add form ── */}
        <Show when={adding()}>
          <form class="grid grid-cols-1 md:grid-cols-2 gap-3.5" onSubmit={submit}>
            <label>
              Kind
              <NativeSelect value={kind()} onChange={event => setKind(event.currentTarget.value)}>
                <For each={PLACE_KINDS}>{value => <option value={value}>{value.replaceAll('_', ' ')}</option>}</For>
              </NativeSelect>
            </label>
            <label>
              Name <small>as people refer to it, e.g. r/progmetal</small>
              <Input value={name()} onInput={event => setName(event.currentTarget.value)} required maxlength={200} />
            </label>
            <label>
              URL <small>identity is the platform and URL together</small>
              <Input value={url()} onInput={event => setUrl(event.currentTarget.value)} required type="url" maxlength={512} />
            </label>
            <div class="form-actions right">
              <Button size="sm" type="submit" disabled={saving() || !name().trim() || !url().trim()}>
                {saving() ? 'Registering…' : 'Register'}
              </Button>
            </div>
          </form>
        </Show>

        {/* ── Import form ── */}
        <Show when={importing()}>
          <form onSubmit={runImport}>
            <label class="flex flex-col gap-1 text-sm text-muted-foreground">
              Paste a scan
              <small>
                A JSON array of {'{ placeKind, platform, name, url }'} — genres, memberCount, notes and
                country optional. Re-importing the same platform and URL refreshes it rather than
                duplicating it.
              </small>
              <Textarea
                class="font-mono p-3"
                rows={8}
                spellcheck={false}
                value={importText()}
                onInput={event => setImportText(event.currentTarget.value)}
                placeholder='[{"placeKind":"subreddit","platform":"reddit","name":"r/progmetal","url":"https://reddit.com/r/progmetal"}]'
              />
            </label>
            <div class="form-actions right">
              <Button size="sm" type="submit" disabled={saving() || !importText().trim()}>
                {saving() ? 'Importing…' : 'Import'}
              </Button>
            </div>
          </form>
        </Show>

        <Show when={notice()}>
          {value => <p class={`p-3 rounded-md text-sm ${value().tone === 'good' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{value().message}</p>}
        </Show>

        {/* ── Community intelligence ── */}
        <div class="flex items-center gap-2 mt-4 mb-4">
          <Button variant="ghost" size="sm" onClick={() => { setImporting(false); setAdding(value => !value) }}>
            {adding() ? 'Cancel' : 'Add a community'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setImporting(value => !value) }}>
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
              Nothing tracked yet. The reddit-scanner and audience-research agents add
              communities as they find them; give them a cycle. Or use <strong>Add a community</strong>
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
                  <button
                    class="flex items-center gap-2 w-full text-left cursor-pointer py-2 px-3 rounded-lg hover:bg-surface-1 transition-colors"
                    onClick={() => toggleCollapse(platform)}
                    aria-expanded={!isCollapsed()}
                  >
                    <span class="text-muted-foreground text-xs" aria-hidden="true">
                      {isCollapsed() ? '▸' : '▾'}
                    </span>
                    <span class="text-sm font-semibold text-foreground" data-platform={platform}>
                      {PLATFORM_LABEL[platform] ?? platform}
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {items.length} {items.length === 1 ? 'community' : 'communities'}
                    </span>
                    <Show when={countBy(items, 'not_joined') > 0}>
                      <span class="text-xs text-warning font-medium">
                        {countBy(items, 'not_joined')} to join
                      </span>
                    </Show>
                  </button>

                  <Show when={!isCollapsed()}>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      <For each={visible()}>
                        {(item: CommunityItem) => (
                          <article class="flex flex-col gap-2 p-4 rounded-lg border border-border bg-card" data-state={item.membershipState}>
                            <header class="flex items-start justify-between gap-2">
                              <div>
                                <a class="text-sm font-semibold text-foreground hover:text-primary transition-colors" href={item.url} target="_blank" rel="noreferrer noopener">
                                  {item.name}
                                </a>
                                <div class="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <span class="text-xs text-muted-foreground uppercase tracking-wider" data-platform={item.platform}>{item.placeKind.replaceAll('_', ' ')}</span>
                                  <Show when={item.memberCount}>
                                    <span><span class="font-medium text-foreground tabular-nums">{item.memberCount!.toLocaleString()}</span> members</span>
                                  </Show>
                                  <Show when={item.countryCode}><span>· {item.countryCode}</span></Show>
                                </div>
                              </div>
                              <span class="text-xs font-medium px-2 py-0.5 rounded-full {item.membershipState === 'not_joined' ? 'bg-warning/10 text-warning' : item.membershipState === 'joining' ? 'bg-primary/10 text-primary' : item.membershipState === 'joined' ? 'bg-success/10 text-success' : item.membershipState === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}" data-state={item.membershipState}>
                                {MEMBERSHIP_LABEL[item.membershipState] ?? item.membershipState}
                              </span>
                            </header>

                            <Show when={item.genres.length > 0}>
                              <div class="flex flex-wrap gap-1.5 mt-1">
                                <For each={item.genres.slice(0, 5)}>{(g) => <span class="text-xs px-2 py-0.5 rounded-full bg-surface-3 text-muted-foreground border border-border">{g}</span>}</For>
                              </div>
                            </Show>

                            <Show when={item.membershipNote}>
                              <p class="text-xs text-muted-foreground italic mt-1">{item.membershipNote}</p>
                            </Show>

                            <footer class="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border">
                              <a class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors" href={item.url} target="_blank" rel="noreferrer noopener">
                                Open<span class="text-xs" aria-hidden="true">↗</span>
                              </a>
                              <Button variant="ghost" size="sm" onClick={() => loadDraft(item.placeId)}>Draft intro</Button>
                              <NativeSelect size="sm" class="w-auto"
                                value={item.membershipState}
                                onChange={(e) => setMembership(item.placeId, e.currentTarget.value)}
                              >
                                <For each={MEMBERSHIP_ORDER}>
                                  {(s) => <option value={s}>{MEMBERSHIP_LABEL[s]}</option>}
                                </For>
                              </NativeSelect>
                              <Button variant="ghost" size="sm" onClick={() => viewObservations(item.placeId)}>Observations</Button>
                            </footer>

                            <Show when={draftFor() === item.placeId}>
                              <div class="mt-3 p-3 rounded-lg border border-border bg-surface-1">
                                <Show when={draft.isFetching && !draft.data}><p class="text-muted-foreground">Reading what was observed here…</p></Show>
                                <Show when={draft.data}>
                                  <Show when={!draft.data!.grounded}>
                                    <p class="p-3 rounded-md text-sm bg-warning/10 text-warning">
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
      <TabPanel active={activeTab()} id="intelligence" visited={isVisited('intelligence')}>
        <Show when={!selectedPlaceId()}>
          <p class="p-4 text-sm text-muted-foreground">Select a community from the Communities tab to view its observation history and extracted entities.</p>
        </Show>

        <Show when={selectedPlaceId()}>
          <SectionTitle eyebrow="COMMUNITY" title={selectedCommunity()?.name ?? 'Community'} action={<Button variant="ghost" size="sm" onClick={() => { setSelectedPlaceId(null); switchTab('communities') }}>Back to communities</Button>} />

          <h3>Observations</h3>
          <Show when={detail.isPending}><SkeletonRows /></Show>
          <Show when={detail.data?.observations && '__error' in detail.data!.observations}>
            <ErrorCard>Failed to load observations</ErrorCard>
          </Show>
          <Show when={detail.data}>
            <Show when={observations().length === 0}>
              <p class="p-4 text-sm text-muted-foreground">No observations recorded yet. The worker will fetch on the next sweep.</p>
            </Show>
            <div class="flex flex-col gap-2 mt-3">
              <For each={observations()}>
                {(obs: CommunityObservationItem) => (
                  <div class="p-3 rounded-lg border border-border bg-surface-1">
                    <div class="flex items-center gap-2 text-xs">
                      <span class="font-medium text-foreground">{obs.source}</span>
                      <span class="text-xs font-medium px-2 py-0.5 rounded-full {(() => { const q = qualityLabel(obs.observationQuality); return q === 'high' ? 'bg-success/10 text-success' : q === 'medium' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'; })()}" data-quality={qualityLabel(obs.observationQuality)}>
                        {qualityLabel(obs.observationQuality)}
                      </span>
                      <time class="text-muted-foreground ml-auto">{formatTime(obs.observedAt)}</time>
                    </div>
                    <div class="text-xs text-muted-foreground mt-1">
                      <span>collector: {obs.collectorVersion}</span>
                    </div>
                    <Show when={obs.rawActivityMetrics}>
                      <pre class="text-xs text-muted-foreground whitespace-pre-wrap font-mono mt-2 p-2 rounded-md bg-background border border-border">{JSON.stringify(obs.rawActivityMetrics, null, 2)}</pre>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <h3>Extracted Entities (Latest)</h3>
          <Show when={detail.isPending}><SkeletonRows /></Show>
          <Show when={detail.data?.entities && '__error' in detail.data!.entities}>
            <ErrorCard>Failed to load entities</ErrorCard>
          </Show>
          <Show when={detail.data}>
            <Show when={entities().length === 0}>
              <p class="p-4 text-sm text-muted-foreground">No entities extracted from the latest observation.</p>
            </Show>
            <div class="flex flex-col gap-2 mt-3">
              <For each={entities()}>
                {(entity: CommunityEntityItem) => (
                  <div class="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-1">
                    <span class="text-xs font-medium text-foreground">{entity.entityType}</span>
                    <span class="text-sm text-muted-foreground flex-1 min-w-0">{entity.entityRef}</span>
                    <div class="flex-1 h-1.5 rounded-full bg-border overflow-hidden max-w-32">
                      <div class="h-full rounded-full bg-primary transition-all" style={{ width: `${(entity.strength / 10000) * 100}%` }} />
                    </div>
                    <span class="text-xs text-muted-foreground tabular-nums">{entity.strength}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </TabPanel>
    </PageShell>
  )
}
