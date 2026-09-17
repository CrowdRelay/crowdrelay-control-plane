import { For, Show, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import type { AudienceSegment } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { Section } from './layout'
import { SkeletonBlock } from './Skeleton'
import { Badge } from './app/badge'
import { Button } from './app/button'

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
      const msg = err instanceof Error ? err.message : 'Failed to load segment preview'
      setError(msg.includes('unavailable') || msg.includes('503') ? 'Segment preview is not available — the audience backend may not support this segment.' : msg)
    } finally {
      setLoading(false)
    }
  }

  return <Section title="Segments" count={props.segments.length} description="Segments group fans by behaviour, source or lifecycle stage. Click one to preview its size.">
    {/* The panel's own description already says what a segment is. Repeating
        it here — in the other spelling, and promising a "define segments"
        control this panel does not have — read as two different screens
        arguing. The empty state says the one thing the description cannot:
        why there is nothing here yet. */}
    <Show when={props.segments.length > 0} fallback={<EmptyState label="No segments yet" hint="The audience model derives segments once fans are landing. Connect a source and they appear on the next ingestion." />}>
      <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        <For each={props.segments}>{(segment) => (
          <Button
            type="button"
            variant="outline"
            class={cn(
              'h-auto w-full flex-col items-stretch justify-start gap-1.5 whitespace-normal bg-background px-3 py-2.5 text-left font-normal hover:border-primary hover:bg-card',
              previewSlug() === segment.slug && 'border-primary bg-card',
            )}
            onClick={() => previewSegment(segment.slug)}
          >
            <div class="flex justify-between items-center gap-2">
              <strong>{segment.name}</strong>
              <Show when={!segment.active}><Badge variant="muted">inactive</Badge></Show>
            </div>
            <Show when={segment.description}><p class="text-muted-foreground mt-1 text-sm leading-snug">{segment.description}</p></Show>
            <Show when={previewSlug() === segment.slug}>
              <div class="mt-2.5 pt-2.5 border-t border-border text-sm">
                <Show when={loading}><SkeletonBlock height="18px" width="120px" /></Show>
                <Show when={error}><span class="text-sm text-destructive">{error()}</span></Show>
                <Show when={!loading && !error && previewCount() != null}>
                  <span class="text-muted-foreground">~{previewCount()} fans in this segment</span>
                </Show>
              </div>
            </Show>
          </Button>
        )}</For>
      </div>
    </Show>
  </Section>
}
