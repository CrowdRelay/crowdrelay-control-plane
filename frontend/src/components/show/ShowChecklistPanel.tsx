import { For, Show, createMemo } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../../lib/capabilities'
import { fillPath, surface } from '../../lib/surface'
import { humanizeToken } from '../../lib/format'
import { Badge } from '../app/badge'
import { SurfaceAction } from '../capabilities/SurfaceAction'

// The night's operating checklist — the chores the timeline's ladder does not
// model (door list, merch float, stage call for the QR). Staff tick items from
// the door app; this is the same list from the console, so the person who
// planned the night can see what is left and mark it. Grouped by section in
// the order upstream sorts them.

type ChecklistItem = {
  item_key: string
  section: string
  sort_order: number
  status: 'pending' | 'done' | 'blocked' | 'skipped'
  note: string | null
}

const TONE: Record<ChecklistItem['status'], 'success' | 'destructive' | 'muted'> = {
  done: 'success',
  blocked: 'destructive',
  skipped: 'muted',
  pending: 'muted',
}

const words = (key: string) => key.replace(/[._-]+/g, ' ')

export function ShowChecklistPanel(props: { slug: string; eventSlug: string }) {
  const queryClient = useQueryClient()
  const list = useQuery(() => ({
    queryKey: ['surface', props.slug, 'show-checklist', props.eventSlug],
    queryFn: () => surface.read<{ items: ChecklistItem[] }>(props.slug, fillPath(capability('checklist').read!.path, { event_slug: props.eventSlug })!),
    staleTime: 30_000,
    retry: 1,
  }))
  const sections = createMemo(() => {
    const grouped = new Map<string, ChecklistItem[]>()
    for (const item of [...(list.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
      grouped.set(item.section, [...(grouped.get(item.section) ?? []), item])
    }
    return [...grouped.entries()]
  })
  const open = () => (list.data?.items ?? []).filter(item => item.status === 'pending' || item.status === 'blocked').length

  return (
    <Show when={list.error || (list.data && list.data.items.length > 0)}>
      <details class="rounded-lg border border-border bg-background px-4 py-3" open={open() > 0}>
        <summary class="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
          The night's checklist
          <Show when={list.data}>{` · ${open()} left`}</Show>
        </summary>
        <Show when={!list.error} fallback={<p class="mt-1 text-xs text-muted-foreground">Couldn't check the checklist.</p>}>
          <For each={sections()}>{([section, items]) => (
            <div class="mt-2">
              <p class="text-xs font-medium capitalize text-foreground">{words(section)}</p>
              <ul class="mt-1 space-y-1">
                <For each={items}>{item => (
                  <li class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={TONE[item.status]}>{humanizeToken(item.status)}</Badge>
                    <span class="capitalize text-foreground">{words(item.item_key)}</span>
                    <Show when={item.note}><span>— {item.note}</span></Show>
                    <SurfaceAction
                      slug={props.slug}
                      size="xs"
                      variant="ghost"
                      action={capabilityAction('checklist', 'Update item')}
                      label="Mark"
                      fixed={{ event_slug: props.eventSlug, item_key: item.item_key }}
                      initial={{ status: item.status, note: item.note ?? '' }}
                      onDone={() => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'show-checklist', props.eventSlug] })}
                    />
                  </li>
                )}</For>
              </ul>
            </div>
          )}</For>
        </Show>
      </details>
    </Show>
  )
}
