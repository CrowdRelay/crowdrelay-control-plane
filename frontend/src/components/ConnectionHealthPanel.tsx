import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { formatTimestamp, tokenLabel } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { SectionFailureCard } from './SectionFailureCard'
import { SkeletonRows } from './Skeleton'
import { DataTable, type ColumnDef } from './app/data-table'
import { Pill, type Tone } from './ui/dash'

// Connected is not the same as working. Each connection's health comes from
// what its sync actually did — synced and not failing, failing with the
// error, or never run — beside the stored credential status, so a feed that
// reads "connected" while every sync fails is visible as exactly that.
//
// It used to be a run of badges and lower-case tokens ("failing", "tiktok",
// "· credential done"). Now each row answers in words: is it bringing data
// in, when did it last, and what to do if not.

type ConnectionHealth = {
  platform: string
  label: string
  status: string
  health: 'working' | 'failing' | 'unverified'
  last_sync_at: string | null
  last_sync_failed_at: string | null
  last_error: string | null
}

const HEALTH: Record<ConnectionHealth['health'], { label: string; tone: Tone; order: number }> = {
  failing: { label: 'Not syncing', tone: 'bad', order: 0 },
  unverified: { label: 'Not synced yet', tone: 'muted', order: 1 },
  working: { label: 'Working', tone: 'good', order: 2 },
}

/// Platform names as the platforms write them.
const BRANDS: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', spotify: 'Spotify', bandcamp: 'Bandcamp', soundcloud: 'SoundCloud', lastfm: 'Last.fm', deezer: 'Deezer', discogs: 'Discogs', bluesky: 'Bluesky', reddit: 'Reddit', discord: 'Discord', telegram: 'Telegram' }
const platformName = (raw: string) => BRANDS[raw.toLowerCase()] ?? tokenLabel(raw)

/// What to do, in words — the stored credential status was printed raw.
const nextStep = (row: ConnectionHealth): string | null => {
  if (row.status === 'expired') return 'Signed out. Reconnect it above.'
  if (row.status === 'invalid') return 'The platform rejected the sign-in. Reconnect it above.'
  if (row.status === 'disconnected') return 'Disconnected. Connect it again above to resume.'
  if (row.health === 'unverified') return 'Waiting for its first sync.'
  return null
}

export function ConnectionHealthPanel(props: { slug: string }) {
  const rows = useQuery(() => ({
    queryKey: ['surface', props.slug, 'connection-health'],
    queryFn: () => surface.read<ConnectionHealth[]>(props.slug, capability('connections').read!.path),
    staleTime: 60_000,
    retry: 1,
  }))
  const working = () => (rows.data ?? []).filter(r => r.health === 'working').length

  const columns: ColumnDef<ConnectionHealth, any>[] = [
    {
      id: 'connection', header: 'Connection', accessorFn: r => `${platformName(r.platform)} ${r.label}`, meta: { class: 'min-w-44' },
      cell: c => <>
        <span class="font-medium text-foreground">{platformName(c.row.original.platform)}</span>
        <span class="block text-xs text-muted-foreground">{c.row.original.label}</span>
      </>,
    },
    {
      id: 'health', header: 'Status', accessorFn: r => HEALTH[r.health]?.order ?? 9, meta: { class: 'whitespace-nowrap' },
      cell: c => <Pill tone={HEALTH[c.row.original.health]?.tone ?? 'muted'}>{HEALTH[c.row.original.health]?.label ?? c.row.original.health}</Pill>,
    },
    {
      id: 'synced', header: 'Last synced', accessorFn: r => r.last_sync_at ?? '', meta: { class: 'whitespace-nowrap' },
      cell: c => <Show when={c.row.original.last_sync_at} fallback={<span class="text-muted-foreground">Never</span>}>
        {formatTimestamp(c.row.original.last_sync_at)}
      </Show>,
    },
    {
      id: 'next', header: 'What to do', enableSorting: false, meta: { class: 'min-w-56 whitespace-normal' },
      cell: c => {
        const row = c.row.original
        return <Show when={row.health === 'failing'} fallback={
          <span class="text-muted-foreground">{nextStep(row) ?? 'Nothing. It’s bringing data in.'}</span>
        }>
          {/* The provider's own words name the fix (a wrong page id, a
              missing key), so they stay — under a plain first line. */}
          <span class="text-foreground">{nextStep(row) ?? 'Its last sync failed. Check the connection above.'}</span>
          <Show when={row.last_error}>
            <span class="block max-w-md text-xs text-muted-foreground [overflow-wrap:anywhere]">The platform said: {row.last_error}</span>
          </Show>
        </Show>
      },
    },
  ]

  return (
    <Show when={rows.error || (rows.data ?? []).length > 0}>
      <Section
        title="Which connections work"
        icon={<SectionIcon name="heartbeat" />}
        count={rows.data?.length}
        description={rows.data
          ? `${working()} of ${rows.data.length} are bringing data in. This is what each one's last sync did, not what it said when it was connected.`
          : 'What each connection’s last sync did, not what it said when it was connected.'}
      >
        <Show when={!rows.error} fallback={
          <SectionFailureCard error={rows.error} title="Couldn't check your connections" onRetry={() => void rows.refetch()} />
        }>
          <Show when={rows.data} fallback={<SkeletonRows count={3} />}>
            <DataTable
              data={rows.data!}
              columns={columns}
              pageSize={8}
              initialSorting={[{ id: 'health', desc: false }]}
              searchText={r => [platformName(r.platform), r.label, HEALTH[r.health]?.label].filter(Boolean).join(' ')}
              searchPlaceholder="Search connections"
            />
          </Show>
        </Show>
      </Section>
    </Show>
  )
}
