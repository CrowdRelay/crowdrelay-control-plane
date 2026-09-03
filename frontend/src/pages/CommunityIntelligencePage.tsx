import { For, Show, Suspense, createSignal, createResource } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import type { CommunityItem, CommunityObservationItem, CommunityEntityItem } from '../lib/types'
import { SkeletonRows } from '../components/Skeleton'
import { refreshTick } from '../lib/refresh'
import { toast } from '../lib/toast'
import { errorMessage } from '../lib/format'

/**
 * Community Intelligence page — observation layer for community surfaces.
 *
 * Shows tracked communities with their latest observations, and allows
 * drilling into observation time series and extracted entities.
 * No sentiment, no affinity — just structured facts the Brain can reason over.
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

const countBy = (items: CommunityItem[], state: string) =>
  items.filter((i) => i.membershipState === state).length

export function CommunityIntelligencePage() {
  const params = useParams({ from: '/tenants/$slug/communities' })
  const [selectedPlaceId, setSelectedPlaceId] = createSignal<string | null>(null)
  const [draftFor, setDraftFor] = createSignal<string | null>(null)

  // The draft is fetched on demand, not for every card: it reads the
  // community's observations and there is no reason to do that 66 times for a
  // page the operator scans.
  const [draft] = createResource(draftFor, (placeId: string) =>
    api.communityIntroDraft(params().slug, placeId),
  )
  const loadDraft = (placeId: string) =>
    setDraftFor((current) => (current === placeId ? null : placeId))

  const setMembership = async (placeId: string, state: string) => {
    try {
      await api.setCommunityMembership(params().slug, placeId, state)
      toast.success(`Marked ${MEMBERSHIP_LABEL[state] ?? state}.`)
      await communities.refetch()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not record that'))
    }
  }

  const communities = useQuery(() => ({
    queryKey: ['community-intelligence', params().slug, refreshTick()],
    queryFn: () => api.communityIntelligenceCommunities(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const observations = useQuery(() => ({
    queryKey: ['community-observations', params().slug, selectedPlaceId(), refreshTick()],
    queryFn: () => api.communityIntelligenceObservations(params().slug, selectedPlaceId()!),
    enabled: !!selectedPlaceId(),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const entities = useQuery(() => ({
    queryKey: ['community-entities', params().slug, selectedPlaceId(), refreshTick()],
    queryFn: () => api.communityIntelligenceEntities(params().slug, selectedPlaceId()!),
    enabled: !!selectedPlaceId(),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  return (
    <section class="page">
      <div class="page-head">
        <div>
          <span class="eyebrow">AUDIENCE</span>
          <h1>Communities</h1>
          <p>
            Places your listeners already gather — subreddits, forums, Discord servers. The
            brain observes them; joining them is a person's job, and this page is the queue
            for it.
          </p>
          <p class="muted">
            Work it top down: each card says how big the community is and what it actually
            discusses. Open it, read the rules and the last week of posts, then join under the
            band's own name. <strong>Draft intro</strong> writes a starting point from what was
            observed there — edit it into your own words. Mark the outcome so the next person
            does not repeat the work.
          </p>
        </div>
      </div>

      <Show when={communities.error}>
        <div class="error-card" role="alert">
          {communities.error instanceof Error ? communities.error.message : 'Community intelligence channel unavailable'}
        </div>
      </Show>

      <Show when={!communities.error && communities.isPending}>
        <SkeletonRows />
      </Show>

      <Suspense fallback={<SkeletonRows />}>
      <Show when={communities.data}>
        <div class="community-queue-summary">
          <For each={MEMBERSHIP_ORDER}>
            {(state) => (
              <Show when={countBy(communities.data?.items ?? [], state) > 0}>
                <span class="community-count" data-state={state}>
                  <strong>{countBy(communities.data?.items ?? [], state)}</strong> {MEMBERSHIP_LABEL[state]}
                </span>
              </Show>
            )}
          </For>
        </div>

        <div class="community-card-grid">
          <Show when={(communities.data?.items ?? []).length === 0}>
            <p class="empty-state">
              Nothing tracked yet. The reddit-scanner and audience-research agents add
              communities as they find them; give them a cycle.
            </p>
          </Show>
          <For each={communities.data?.items ?? []}>
            {(item: CommunityItem) => (
              <article class="community-card" data-state={item.membershipState}>
                <header class="community-card-head">
                  <div>
                    <a class="community-card-name" href={item.url} target="_blank" rel="noreferrer noopener">
                      {item.name}
                    </a>
                    <div class="community-card-sub">
                      <span class="community-platform" data-platform={item.platform}>{item.platform}</span>
                      <Show when={item.memberCount}>
                        <span><span class="community-card-members">{item.memberCount!.toLocaleString()}</span> members</span>
                      </Show>
                      <Show when={item.countryCode}><span>· {item.countryCode}</span></Show>
                    </div>
                  </div>
                  <span class="community-state-badge" data-state={item.membershipState}>
                    {MEMBERSHIP_LABEL[item.membershipState] ?? item.membershipState}
                  </span>
                </header>

                <Show when={item.genres.length > 0}>
                  <div class="community-genres">
                    <For each={item.genres.slice(0, 5)}>{(g) => <span class="genre-tag">{g}</span>}</For>
                  </div>
                </Show>

                <Show when={item.membershipNote}>
                  <p class="community-card-note">{item.membershipNote}</p>
                </Show>

                <footer class="community-card-actions">
                  <a class="ghost" href={item.url} target="_blank" rel="noreferrer noopener">
                    Open<span class="external-mark" aria-hidden="true">↗</span>
                  </a>
                  <button class="ghost draft-intro" onClick={() => loadDraft(item.placeId)}>Draft intro</button>
                  <select
                    class="community-state-select"
                    value={item.membershipState}
                    onChange={(e) => setMembership(item.placeId, e.currentTarget.value)}
                  >
                    <For each={MEMBERSHIP_ORDER}>
                      {(s) => <option value={s}>{MEMBERSHIP_LABEL[s]}</option>}
                    </For>
                  </select>
                  <button class="ghost" onClick={() => setSelectedPlaceId(item.placeId)}>Observations</button>
                </footer>

                <Show when={draftFor() === item.placeId}>
                  <div class="community-draft">
                    <Show when={draft.loading}><p class="muted">Reading what was observed here…</p></Show>
                    <Show when={draft()}>
                      <Show when={!draft()!.grounded}>
                        <p class="notice warn">
                          Nothing observed here yet, so this is a blank rather than a draft.
                        </p>
                      </Show>
                      <Show when={draft()!.sharedGenres.length > 0}>
                        <p class="muted">
                          Overlaps on {draft()!.sharedGenres.join(', ')}.
                        </p>
                      </Show>
                      <textarea class="community-draft-text" rows={10} readonly>{draft()!.draft}</textarea>
                      <button class="ghost" onClick={() => navigator.clipboard?.writeText(draft()!.draft)}>
                        Copy
                      </button>
                    </Show>
                  </div>
                </Show>
              </article>
            )}
          </For>
        </div>

        <div class="community-intel-grid">
          {/* Detail panel */}
          <div class="community-detail-panel">
            <Show when={!selectedPlaceId()}>
              <p class="empty-state">Select a community to view its observation history and extracted entities.</p>
            </Show>

            <Show when={selectedPlaceId()}>
              <h2>Observations</h2>
              <Show when={observations.isPending}><SkeletonRows /></Show>
              <Show when={observations.error}>
                <div class="error-card" role="alert">Failed to load observations</div>
              </Show>
              <Show when={observations.data}>
                <Show when={(observations.data?.items ?? []).length === 0}>
                  <p class="empty-state">No observations recorded yet. The worker will fetch on the next sweep.</p>
                </Show>
                <div class="observation-list">
                  <For each={observations.data?.items ?? []}>
                    {(obs: CommunityObservationItem) => (
                      <div class="observation-row">
                        <div class="observation-header">
                          <span class="observation-source">{obs.source}</span>
                          <span class="observation-quality" data-quality={qualityLabel(obs.observationQuality)}>
                            {qualityLabel(obs.observationQuality)}
                          </span>
                          <time class="observation-time">{formatTime(obs.observedAt)}</time>
                        </div>
                        <div class="observation-meta">
                          <span>collector: {obs.collectorVersion}</span>
                        </div>
                        <Show when={obs.rawActivityMetrics}>
                          <pre class="observation-raw">{JSON.stringify(obs.rawActivityMetrics, null, 2)}</pre>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <h2>Extracted Entities (Latest)</h2>
              <Show when={entities.isPending}><SkeletonRows /></Show>
              <Show when={entities.error}>
                <div class="error-card" role="alert">Failed to load entities</div>
              </Show>
              <Show when={entities.data}>
                <Show when={(entities.data?.items ?? []).length === 0}>
                  <p class="empty-state">No entities extracted from the latest observation.</p>
                </Show>
                <div class="entity-list">
                  <For each={entities.data?.items ?? []}>
                    {(entity: CommunityEntityItem) => (
                      <div class="entity-row">
                        <span class="entity-type">{entity.entityType}</span>
                        <span class="entity-ref">{entity.entityRef}</span>
                        <div class="entity-strength-bar">
                          <div class="entity-strength-fill" style={{ width: `${(entity.strength / 10000) * 100}%` }} />
                        </div>
                        <span class="entity-strength-value">{entity.strength}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </Show>
      </Suspense>
    </section>
  )
}

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
