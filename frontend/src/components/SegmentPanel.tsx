import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Send, Users } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { AudienceSegment } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { Pill } from './ui/dash'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { SkeletonBlock } from './Skeleton'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'

/// How many fans a segment holds right now. Each row asks for its own count,
/// so the table reads as numbers instead of cards that had to be clicked
/// one at a time to find out. Shared key with the message drawer.
export const segmentSizeQuery = (slug: string, segment: string) => ({
  queryKey: ['tenant', slug, 'segment-size', segment],
  queryFn: () => api.audienceSegmentPreview(slug, segment).then(result => result.total),
  staleTime: 5 * 60_000,
  retry: 1,
})

export function SegmentSize(props: { slug: string; segment: string }) {
  const size = useQuery(() => segmentSizeQuery(props.slug, props.segment))
  return (
    <Show when={!size.isPending} fallback={<span class="inline-block" aria-label="Counting fans"><SkeletonBlock height="16px" width="40px" /></span>}>
      <Show when={size.data != null} fallback={<span class="text-muted-foreground" title="This segment's size couldn't be checked">—</span>}>
        {size.data!.toLocaleString()}
      </Show>
    </Show>
  )
}

// Segments are who a message can go to. One table: what each segment is, how
// many fans it holds, whether it is live, and a way to message it from here.
// They used to be cards that looked like buttons, and clicking one opened a
// preview that never finished loading.
export function SegmentPanel(props: {
  slug: string
  segments: AudienceSegment[]
  /** Opens the message drawer with this segment chosen. */
  onMessage?: (segment: string) => void
}) {
  const columns: ColumnDef<AudienceSegment, any>[] = [
    {
      id: 'segment', header: 'Segment', accessorFn: s => s.name, meta: { class: 'min-w-64' },
      cell: c => <div class="max-w-lg">
        <span class="font-medium text-foreground">{c.row.original.name}</span>
        <Show when={c.row.original.description}>
          <span class="block text-xs text-muted-foreground text-pretty">{c.row.original.description}</span>
        </Show>
      </div>,
    },
    {
      id: 'fans', header: 'Fans', accessorFn: s => s.name, enableSorting: false, meta: { numeric: true },
      cell: c => <SegmentSize slug={props.slug} segment={c.row.original.slug} />,
    },
    {
      id: 'status', header: 'Status', accessorFn: s => s.active ? 'Active' : 'Inactive', meta: { class: 'whitespace-nowrap' },
      cell: c => <Pill tone={c.row.original.active ? 'good' : 'muted'}>{c.row.original.active ? 'Active' : 'Inactive'}</Pill>,
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false, meta: { class: 'w-px whitespace-nowrap text-right' },
      // An inactive segment can't be messaged (upstream refuses it), and its
      // status already says why — no button rather than a disabled one.
      cell: c => <Show when={c.row.original.active && props.onMessage}>
        <Button variant="ghost" size="sm" writes onClick={() => props.onMessage!(c.row.original.slug)}>
          <Send aria-hidden="true" /> Message<span class="sr-only"> {c.row.original.name}</span>
        </Button>
      </Show>,
    },
  ]

  return <Section title="Segments" icon={<SectionIcon name="target" />} count={props.segments.length} description="Groups of fans by behaviour, source or stage. A message goes to one segment.">
    <DataTable
      data={props.segments}
      columns={columns}
      getRowId={s => s.id}
      pageSize={8}
      initialSorting={[{ id: 'status', desc: false }]}
      searchText={s => [s.name, s.description, s.slug].filter(Boolean).join(' ')}
      searchPlaceholder="Search segments"
      empty={<EmptyState icon={<Users />} label="No segments yet" hint={authState.isPlatformLevel() ? 'The audience model derives segments once fans are landing. Connect a source and they appear on the next ingestion.' : 'Segments appear once fans are landing. Connect a source and they show up on the next import.'} />}
    />
  </Section>
}
