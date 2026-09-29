import { For, Show } from 'solid-js'
import { useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { ContentMaterialView, ContentSourceKind } from '../lib/types'
import { ContentSourcesPanel } from '../components/ContentSourcesPanel'
import { PageShell } from '../components/layout'
import { Act, Bar, Card, DashHeader, MoreRow, Note, Pill, Row, Split, StatRow, Tile, Tiles, WorkAreaPanel, WorkAreas, useWorkAreas } from '../components/ui/dash'
import { ChartBar, Database, Layers } from 'lucide-solid'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonKpiStrip, SkeletonSection } from '../components/Skeleton'
import type { Tone as ViewTone } from '../components/ui/dash'
import { formatIsoAge, humanizeToken } from '../lib/format'

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

  const areas = useWorkAreas(['all'])

  return <PageShell>
    <DashHeader
      title="Material"
      subtitle="Everything the machine may talk about"
      pill={model() ? status() : null}
      back={{ label: 'Content', to: '/tenants/$slug/content', params: { slug: params().slug } }}
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
          <Tiles>
            <Tile label="Usable now" value={m().usable} sub={`of ${m().total} on record · ${m().total - m().usable} aged out`} />
            <Tile label="Used at least once" value={m().used} sub={`${m().uses_total.toLocaleString()} times in all`} />
            <Tile
              label="Never used"
              value={neverUsed()}
              valueTone={neverUsed() * 2 > m().total ? 'warn' : undefined}
              sub={kind('social_post') ? `${kind('social_post')!.total - kind('social_post')!.used} of them your own posts` : undefined}
            />
            <Tile
              label="Newest"
              value={m().newest ? formatIsoAge(m().newest!.occurred_at) : null}
              sub={m().newest ? [platformLabel(m().newest!.platform), shortDate(m().newest!.occurred_at)].filter(Boolean).join(' · ') : 'nothing on record'}
            />
          </Tiles>

          <Split>
            <Card title="Newest first" icon={<Layers />} aside="times used">
              <For each={m().recent}>{row => (
                <Row>
                  <Pill tone={row.usable ? 'muted' : 'warn'}>{row.usable ? (KIND_SINGULAR[row.kind] ?? row.kind) : 'aged out'}</Pill>
                  <div class="min-w-0 flex-1">
                    <p class="m-0 truncate text-sm text-foreground">{row.title}</p>
                    <p class="m-0 text-xs text-muted-foreground">
                      {[platformLabel(row.platform), shortDate(row.occurred_at), row.usable ? `good until ${shortDate(row.expires_at)}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span class="w-8 shrink-0 text-right text-sm tabular-nums text-foreground">{row.uses || '—'}</span>
                  <Act onClick={() => areas.open('all')}>Spread</Act>
                </Row>
              )}</For>
              <Show when={m().total > m().recent.length}>
                <MoreRow text={`${m().total - m().recent.length} more`} link={<Act onClick={() => areas.open('all')}>All material</Act>} />
              </Show>
            </Card>

            <Card title="What there is" icon={<Database />}>
              <For each={m().by_kind.slice().sort((a, b) => b.total - a.total)}>{row => (
                <Bar
                  label={KIND_LABEL[row.kind] ?? humanizeToken(row.kind)}
                  value={row.kind === 'release' ? row.distinct_titles : row.total}
                  display={row.kind === 'release' ? `~${row.distinct_titles}` : undefined}
                  max={largest()}
                />
              )}</For>
              <Show when={kind('release') && kind('release')!.total !== kind('release')!.distinct_titles}>
                <Note>Songs counted once each, not once per single, EP and album copy ({kind('release')!.total} releases on record).</Note>
              </Show>
            </Card>
          </Split>

          <Card title="Is it being used" icon={<ChartBar />} class="mb-3">
            <For each={m().by_kind.slice().sort((a, b) => (b.total - b.used) - (a.total - a.used))}>{row => {
              const unused = row.total - row.used
              return (
                <StatRow
                  label={`${KIND_LABEL[row.kind] ?? humanizeToken(row.kind)} · ${row.used} of ${row.total} used${row.uses > 0 ? `, ${row.uses} times` : ''}`}
                  value={<Pill tone={unused === 0 ? 'good' : unused * 2 > row.total ? 'warn' : 'muted'}>{unused === 0 ? 'all used' : `${unused} never used`}</Pill>}
                />
              )
            }}</For>
          </Card>
        </>
      )}
    </Show>

    <WorkAreas
      active={areas.active()}
      onToggle={areas.toggle}
      areas={[{ id: 'all', label: 'All material, stories and each source\'s spread', count: model()?.total ?? null }]}
    />
    <WorkAreaPanel id="all" active={areas.active()}>
      <ContentSourcesPanel slug={params().slug} />
    </WorkAreaPanel>
  </PageShell>
}
