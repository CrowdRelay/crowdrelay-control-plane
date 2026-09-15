import { For, Show, createMemo } from 'solid-js'
import { useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { TenantShow } from '../lib/types'
import { PageShell, PageHeader } from '../components/layout'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection } from '../components/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { formatTimestamp } from '../lib/format'

/** "in 3d" / "in 5h" countdown for an upcoming start time — no shared
 * future-direction formatter exists; the lib helpers all render past-tense. */
const untilLabel = (iso: string) => {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const hours = Math.round((ms - Date.now()) / 3_600_000)
  if (hours <= 0) return 'now'
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

/** `/tenants/$slug/shows` — the gig list: next up first, then past shows,
 * newest first. The noun every show-day capability hangs off; the night
 * itself opens at `/tenants/$slug/shows/$id` (UX-2.2). */
export function TenantShowsPage() {
  const params = useParams({ from: '/tenants/$slug/shows' })
  const model = useQuery(() => ({
    queryKey: ['tenant-shows', params().slug],
    queryFn: () => api.shows(params().slug),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  }))

  const upcoming = createMemo(() => (model.data?.events ?? []).filter(event => event.upcoming))
  const past = createMemo(() => (model.data?.events ?? []).filter(event => !event.upcoming))

  return (
    <PageShell>
      <PageHeader
        eyebrow="TENANT"
        title="Shows"
        description="Every gig in one place — what's next, what happened, and what the room scanned."
      />

      <Show when={model.error}>
        <SectionFailureCard
          error={model.error}
          fallback="Shows unavailable"
          onRetry={() => void model.refetch()}
        />
      </Show>

      <Show when={!model.error && !model.data}>
        <SkeletonSection titleWidth="140px" lines={3} minHeight="120px" />
        <SkeletonSection titleWidth="120px" lines={4} minHeight="180px" />
      </Show>

      <Show when={model.data}>
        {data => (
          <>
            <Show
              when={data().events.length > 0}
              fallback={
                <EmptyState
                  label="No shows yet"
                  hint="Publish a gig in CrowdRelay and it lands here — announced, played, and everything the room scanned."
                />
              }
            >
              <section class="mb-6">
                <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Next up</h2>
                <Show
                  when={upcoming().length > 0}
                  fallback={<p class="text-sm text-muted-foreground px-1 py-2">Nothing announced.</p>}
                >
                  <div class="flex flex-col gap-2">
                    <For each={upcoming()}>{show => <ShowRow show={show} />}</For>
                  </div>
                </Show>
              </section>

              <section>
                <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Past</h2>
                <Show
                  when={past().length > 0}
                  fallback={<p class="text-sm text-muted-foreground px-1 py-2">No played shows in the last ninety days.</p>}
                >
                  <div class="flex flex-col gap-2">
                    <For each={past()}>{show => <ShowRow show={show} />}</For>
                  </div>
                </Show>
              </section>
            </Show>
          </>
        )}
      </Show>
    </PageShell>
  )
}

function ShowRow(props: { show: TenantShow }) {
  return (
    <div class="flex items-center gap-4 rounded-lg border border-border bg-surface-1 px-4 py-3">
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium text-foreground truncate">{props.show.title}</div>
        <div class="text-xs text-muted-foreground mt-0.5">
          {formatTimestamp(props.show.starts_at)}
          {props.show.venue ? ` · ${props.show.venue}` : ''}
        </div>
      </div>
      <div class="text-right shrink-0">
        <Show
          when={!props.show.upcoming}
          fallback={<div class="text-sm font-medium text-foreground">{untilLabel(props.show.starts_at)}</div>}
        >
          <div class="text-sm font-medium text-foreground tabular-nums">{props.show.scan_count}</div>
          <div class="text-xs text-muted-foreground">scans</div>
        </Show>
      </div>
    </div>
  )
}
