import { For, Show, createSignal } from 'solid-js'
import { useNavigate, useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { ContentMaterialView, ContentSourceKind } from '../lib/types'
import { ContentSourcesPanel } from '../components/ContentSourcesPanel'
import { PageShell, PageHeader, TabBar, KpiStrip, KpiCard, Section } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { Button } from '../components/app/button'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonKpiStrip, SkeletonSection } from '../components/Skeleton'
import { BarRow, OutcomeRow, RowTag, StatusPill, WorkRow, type ViewTone } from '../components/ViewBlocks'
import { formatIsoAge } from '../lib/format'
import { CONTENT_TABS } from '../lib/nav'

/// Everything the system may say publicly comes from this material — videos
/// the watcher picked up, releases, events, and the stories the band writes
/// itself. The page answers "what can the machine talk about, and is any of
/// it being used?" (approved mockup `console-mockups/content-material.html`).
///
/// The first screen is one read, `views/content-material`, one SQL statement
/// upstream. The full list — every source with its send trail, the story
/// editor, each source's spread — is the heavy read, and it loads only when
/// "All material" is opened (or a deep link names a source).

const KIND_LABEL: Record<ContentSourceKind, string> = {
  social_post: 'Posts',
  video: 'Videos',
  event: 'Show dates',
  release: 'Songs',
  show_completed: 'Shows played',
  story: 'Stories',
}

const KIND_SINGULAR: Record<ContentSourceKind, string> = {
  social_post: 'Post',
  video: 'Video',
  event: 'Show date',
  release: 'Release',
  show_completed: 'Show played',
  story: 'Story',
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))

const platformLabel = (platform: string) =>
  ({ instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', spotify: 'Spotify' } as Record<string, string>)[platform] ?? null

export function TenantContentMaterialPage() {
  const params = useParams({ from: '/tenants/$slug/content/material' })
  const navigate = useNavigate()
  // A deep link into one source (`#…`) needs the full list mounted.
  const [showAll, setShowAll] = createSignal(window.location.hash.length > 1)

  const view = useQuery(() => ({
    queryKey: ['content-material-view', params().slug],
    queryFn: () => api.contentMaterialView(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const model = (): ContentMaterialView | undefined => view.data
  const neverUsed = () => (model() ? model()!.total - model()!.used : 0)
  const kind = (key: ContentSourceKind) => model()?.by_kind.find(row => row.kind === key)
  const largest = () => Math.max(1, ...(model()?.by_kind ?? []).map(row => row.total))

  const status = (): { tone: ViewTone; text: string } => {
    const m = model()
    if (!m || m.total === 0) return { tone: 'muted', text: 'No material yet' }
    if (m.usable === 0) return { tone: 'bad', text: 'Nothing usable — every source has aged out' }
    const fresh = m.newest != null && Date.now() - new Date(m.newest.occurred_at).getTime() < 7 * 86_400_000
    if (neverUsed() * 2 > m.total) {
      return { tone: 'warn', text: `${fresh ? 'Fresh' : 'Nothing new this week'}, but ${neverUsed()} of ${m.total} never used` }
    }
    return { tone: fresh ? 'good' : 'warn', text: `${m.usable} usable · ${fresh ? 'newest this week' : 'nothing new this week'}` }
  }

  return <PageShell>
    <PageHeader
      eyebrow={authState.isPlatformLevel() ? 'CONTENT' : undefined}
      title="Material"
      description="Everything the machine may talk about — nothing else. Videos and releases land here on their own; add stories yourself."
      actions={<Show when={model()}><StatusPill tone={status().tone}>{status().text}</StatusPill></Show>}
    />

    <TabBar
      tabs={CONTENT_TABS}
      active="material"
      onChange={(id) => {
        if (id === 'pipeline') void navigate({ to: '/tenants/$slug/content', params: { slug: params().slug } })
      }}
    />

    <Show when={view.error}>
      <SectionFailureCard error={view.error} fallback="Material unavailable" onRetry={() => void view.refetch()} />
    </Show>
    <Show when={!view.error && !model()}>
      <SkeletonKpiStrip count={4} />
      <SkeletonSection titleWidth="160px" lines={4} minHeight="200px" />
    </Show>

    <Show when={model()}>
      {m => (
        <>
          <KpiStrip>
            <KpiCard label="Usable now" value={m().usable.toLocaleString()} sub={`of ${m().total} on record · ${m().total - m().usable} aged out`} />
            <KpiCard label="Used at least once" value={m().used.toLocaleString()} sub={`${m().uses_total.toLocaleString()} times in all`} />
            <KpiCard
              label="Never used"
              value={neverUsed().toLocaleString()}
              sub={kind('social_post') ? `${kind('social_post')!.total - kind('social_post')!.used} of them your own posts` : undefined}
              tone={neverUsed() * 2 > m().total ? 'warn' : undefined}
            />
            <KpiCard
              label="Newest"
              value={m().newest ? formatIsoAge(m().newest!.occurred_at) : '—'}
              sub={m().newest ? [platformLabel(m().newest!.platform), shortDate(m().newest!.occurred_at)].filter(Boolean).join(' · ') : 'nothing on record'}
            />
          </KpiStrip>

          <div class="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Section title="Newest first" icon={<SectionIcon name="list-checks" />} description="The five most recent sources and how often the machine used each.">
              <div class="flex flex-col">
                <For each={m().recent}>{row => (
                  <WorkRow
                    tag={<RowTag tone={row.usable ? 'muted' : 'warn'}>{row.usable ? KIND_SINGULAR[row.kind] ?? row.kind : 'aged out'}</RowTag>}
                    title={row.title}
                    why={[platformLabel(row.platform), shortDate(row.occurred_at), row.usable ? `good until ${shortDate(row.expires_at)}` : null].filter(Boolean).join(' · ')}
                    action={row.uses === 0 ? 'never used' : `used ${row.uses}×`}
                  />
                )}</For>
                <Show when={m().total > m().recent.length}>
                  <Button variant="link" size="sm" class="h-auto px-0 mt-2 self-start text-xs" onClick={() => setShowAll(true)}>
                    {m().total - m().recent.length} more — all material →
                  </Button>
                </Show>
              </div>
            </Section>

            <Section title="What there is" icon={<SectionIcon name="database" />}>
              <div class="flex flex-col">
                <For each={m().by_kind.slice().sort((a, b) => b.total - a.total)}>{row => (
                  <BarRow
                    label={KIND_LABEL[row.kind] ?? row.kind}
                    value={row.kind === 'release' ? row.distinct_titles : row.total}
                    display={row.kind === 'release' ? `~${row.distinct_titles}` : undefined}
                    max={largest()}
                  />
                )}</For>
              </div>
              <Show when={kind('release') && kind('release')!.total !== kind('release')!.distinct_titles}>
                <p class="mt-2 text-xs text-muted-foreground">
                  Songs counted once each, not once per single, EP and album copy ({kind('release')!.total} releases on record).
                </p>
              </Show>
            </Section>
          </div>

          <Section title="Is it being used" icon={<SectionIcon name="trending-up" />} description="Per kind: how much of it the machine has ever drawn on.">
            <div class="flex flex-col">
              <For each={m().by_kind.slice().sort((a, b) => (b.total - b.used) - (a.total - a.used))}>{row => {
                const unused = row.total - row.used
                return (
                  <OutcomeRow
                    label={`${KIND_LABEL[row.kind] ?? row.kind} · ${row.used} of ${row.total} used${row.uses > 0 ? `, ${row.uses} times` : ''}`}
                    result={unused === 0 ? 'all used' : `${unused} never used${row.newest_unused_at ? ` · newest ${shortDate(row.newest_unused_at)}` : ''}`}
                    tone={unused === 0 ? 'good' : unused * 2 > row.total ? 'warn' : 'muted'}
                  />
                )
              }}</For>
            </div>
          </Section>
        </>
      )}
    </Show>

    <Section title="All material" icon={<SectionIcon name="book-open" />} description="Every source, its send trail and spread; add a story or a link here.">
      <Show when={showAll()} fallback={
        <Button variant="link" size="sm" class="h-auto px-0 text-sm" onClick={() => setShowAll(true)}>
          Open all {model()?.total ?? ''} sources
        </Button>
      }>
        <ContentSourcesPanel slug={params().slug} />
      </Show>
    </Section>
  </PageShell>
}
