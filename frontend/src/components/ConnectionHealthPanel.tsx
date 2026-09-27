import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { formatTimestamp, humanizeToken } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'

// Connected is not the same as working. Each connection's health comes from
// what its sync actually did — synced and not failing, failing with the
// error, or never run — beside the stored credential status, so a feed that
// reads "connected" while every sync fails is visible as exactly that.

type ConnectionHealth = {
  platform: string
  label: string
  status: string
  health: 'working' | 'failing' | 'unverified'
  last_sync_at: string | null
  last_sync_failed_at: string | null
  last_error: string | null
}

const TONE = { working: 'success', failing: 'destructive', unverified: 'muted' } as const

export function ConnectionHealthPanel(props: { slug: string }) {
  const rows = useQuery(() => ({
    queryKey: ['surface', props.slug, 'connection-health'],
    queryFn: () => surface.read<ConnectionHealth[]>(props.slug, capability('connections').read!.path),
    staleTime: 60_000,
    retry: 1,
  }))
  return (
    <Show when={rows.error || (rows.data ?? []).length > 0}>
      <Section title="Which connections work" icon={<SectionIcon name="heartbeat" />} description="What each connection's last sync actually did — not what it said when it was connected.">
        <Show when={!rows.error} fallback={<p class="text-sm text-muted-foreground">Couldn't check the connections.</p>}>
          <ul class="space-y-1.5 text-sm">
            <For each={rows.data!}>{row => (
              <li class="flex flex-wrap items-center gap-2">
                <Badge variant={TONE[row.health] ?? 'muted'}>{row.health === 'unverified' ? 'never synced' : row.health}</Badge>
                <span class="text-foreground">{row.label}</span>
                <span class="text-xs text-muted-foreground">{row.platform}</span>
                <Show when={row.health === 'failing' && row.last_error}>
                  <span class="text-xs text-destructive">{row.last_error}</span>
                </Show>
                <Show when={row.health === 'working' && row.last_sync_at}>
                  <span class="text-xs text-muted-foreground">synced {formatTimestamp(row.last_sync_at)}</span>
                </Show>
                <Show when={row.status !== 'connected' && row.health !== 'failing'}>
                  <span class="text-xs text-muted-foreground">· credential {humanizeToken(row.status)}</span>
                </Show>
              </li>
            )}</For>
          </ul>
        </Show>
      </Section>
    </Show>
  )
}
