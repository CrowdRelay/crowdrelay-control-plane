import { For, Show } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { formatTimestamp } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { SurfaceAction } from './capabilities/SurfaceAction'

// Messages to a segment of the band's own fans — the segments above are who,
// this is what they are told and when. A draft does nothing; scheduling is the
// outward act, so it carries the confirm step. Counts come back from the
// sender once it ran: recipients, delivered, failed — absent until then, not 0.

type FanMessage = {
  id: string
  name: string
  channel: string
  segment_slug: string
  subject: string | null
  status: string
  scheduled_at: string | null
  recipient_count: number | null
  delivered_count: number | null
  failed_count: number | null
  completed_at: string | null
}

export function FanMessagesPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const messages = useQuery(() => ({
    queryKey: ['surface', props.slug, 'fan-messages'],
    queryFn: () => surface.read<FanMessage[]>(props.slug, capability('communications').read!.path),
    staleTime: 30_000,
    retry: 1,
  }))
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'fan-messages'] })
  const open = (m: FanMessage) => m.completed_at == null && m.status !== 'cancelled'

  return (
    <Section
      title="Messages to fans"
      icon={<SectionIcon name="mail" />}
      count={messages.data?.length}
      description="What a segment is told, on which channel, and when. Nothing leaves until a message is scheduled."
      action={<SurfaceAction slug={props.slug} action={capabilityAction('communications', 'Draft a campaign')} label="Draft a message" onDone={refresh} />}
    >
      <Show when={!messages.error} fallback={<p class="text-sm text-muted-foreground">Couldn't check the messages.</p>}>
        <Show when={messages.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
          <Show when={messages.data!.length > 0} fallback={<p class="text-sm text-muted-foreground">No message drafted yet.</p>}>
            <ul class="space-y-2">
              <For each={messages.data!}>{m => (
                <li class="rounded-md border border-border p-3 text-sm">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium text-foreground">{m.subject ?? m.name}</span>
                    <Badge variant="outline">{m.channel.replaceAll('_', ' ')}</Badge>
                    <Badge variant="muted">{m.status.replaceAll('_', ' ')}</Badge>
                    <span class="text-xs text-muted-foreground">to {m.segment_slug.replaceAll('-', ' ')}</span>
                    <Show when={m.scheduled_at}><span class="text-xs text-muted-foreground">· {formatTimestamp(m.scheduled_at)}</span></Show>
                  </div>
                  <Show when={m.recipient_count != null}>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {m.recipient_count} recipients · {m.delivered_count ?? '—'} delivered · {m.failed_count ?? '—'} failed
                    </p>
                  </Show>
                  <Show when={open(m)}>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <Show when={m.scheduled_at == null}>
                        <SurfaceAction slug={props.slug} size="xs" action={capabilityAction('communications', 'Schedule')} fixed={{ campaign_id: m.id }} onDone={refresh} />
                      </Show>
                      <SurfaceAction slug={props.slug} size="xs" variant="destructive-ghost" action={capabilityAction('communications', 'Cancel')} fixed={{ campaign_id: m.id }} onDone={refresh} />
                    </div>
                  </Show>
                </li>
              )}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </Section>
  )
}
