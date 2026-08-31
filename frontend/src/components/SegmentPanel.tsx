import { For, Show, createSignal } from 'solid-js'
import { api } from '../lib/api'
import type { AudienceSegment } from '../lib/types'
import { EmptyState } from './EmptyState'
import { SkeletonBlock } from './Skeleton'

export function SegmentPanel(props: {
  slug: string
  segments: AudienceSegment[]
}) {
  const [previewSlug, setPreviewSlug] = createSignal<string | null>(null)
  const [previewCount, setPreviewCount] = createSignal<number | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const previewSegment = async (slug: string) => {
    if (previewSlug() === slug) {
      setPreviewSlug(null)
      setPreviewCount(null)
      return
    }
    setPreviewSlug(slug)
    setPreviewCount(null)
    setError(null)
    setLoading(true)
    try {
      const result = await api.audienceSegmentPreview(props.slug, slug)
      setPreviewCount(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load segment preview')
    } finally {
      setLoading(false)
    }
  }

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Segments</h3>
      <span class="muted">{props.segments.length} segments</span>
    </div>
    <p class="agent-section-intro">Audience segments group fans by behaviour, source, or lifecycle stage. Click a segment to preview its size.</p>
    <Show when={props.segments.length > 0} fallback={<EmptyState label="No segments defined" hint="Segments group fans by behavior, source, or engagement level. Define segments to target outreach effectively." />}>
      <div class="segment-list">
        <For each={props.segments}>{(segment) => (
          <button
            class={`segment-card ${previewSlug() === segment.slug ? 'expanded' : ''}`}
            onClick={() => previewSegment(segment.slug)}
          >
            <div class="segment-card-head">
              <strong>{segment.name}</strong>
              <Show when={!segment.active}><span class="badge tone-muted">inactive</span></Show>
            </div>
            <Show when={segment.description}><p class="muted segment-desc">{segment.description}</p></Show>
            <Show when={previewSlug() === segment.slug}>
              <div class="segment-preview">
                <Show when={loading}><SkeletonBlock height="18px" width="120px" /></Show>
                <Show when={error}><span class="agent-error">{error()}</span></Show>
                <Show when={!loading && !error && previewCount() != null}>
                  <span class="muted">~{previewCount()} fans in this segment</span>
                </Show>
              </div>
            </Show>
          </button>
        )}</For>
      </div>
    </Show>
  </div>
}
