import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import type { CommunityItem, CommunityObservationItem, CommunityEntityItem } from '../lib/types'
import { SkeletonRows } from '../components/Skeleton'
import { refreshTick } from '../lib/refresh'

/**
 * Community Intelligence page — observation layer for community surfaces.
 *
 * Shows tracked communities with their latest observations, and allows
 * drilling into observation time series and extracted entities.
 * No sentiment, no affinity — just structured facts the Brain can reason over.
 */
export function CommunityIntelligencePage() {
  const params = useParams({ from: '/tenants/$slug/communities' })
  const [selectedPlaceId, setSelectedPlaceId] = createSignal<string | null>(null)

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
          <span class="eyebrow">OBSERVATION LAYER</span>
          <h1>Community Intelligence</h1>
          <p>Structured observations from community surfaces — forums, subreddits, social platforms. No sentiment, no affinity scores. Just facts the Brain can reason over: who is active, what they talk about, which genres surface.</p>
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

      <Show when={communities.data}>
        <div class="community-intel-grid">
          {/* Community list */}
          <div class="community-list-panel">
            <h2>Tracked Communities</h2>
            <Show when={(communities.data?.items ?? []).length === 0}>
              <p class="empty-state">No communities tracked yet. Add discovery places with matching platform adapters.</p>
            </Show>
            <For each={communities.data?.items ?? []}>
              {(item: CommunityItem) => (
                <button
                  class="community-row"
                  classList={{ active: selectedPlaceId() === item.placeId }}
                  onClick={() => setSelectedPlaceId(item.placeId)}
                >
                  <div class="community-row-header">
                    <span class="community-name">{item.name}</span>
                    <span class="community-platform">{item.platform}</span>
                  </div>
                  <div class="community-row-meta">
                    <span class="community-kind">{item.placeKind}</span>
                    <Show when={item.memberCount}>
                      <span class="community-members">{item.memberCount} members</span>
                    </Show>
                    <Show when={item.latestObservation}>
                      <span class="community-quality" data-quality={qualityLabel(item.latestObservation!.quality)}>
                        {qualityLabel(item.latestObservation!.quality)}
                      </span>
                    </Show>
                  </div>
                  <Show when={item.genres.length > 0}>
                    <div class="community-genres">
                      <For each={item.genres.slice(0, 4)}>{(g) => <span class="genre-tag">{g}</span>}</For>
                    </div>
                  </Show>
                </button>
              )}
            </For>
          </div>

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
