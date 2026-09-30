import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Users } from 'lucide-solid'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import type { VideoScorecard } from '../lib/types'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { SkeletonRows } from './Skeleton'
import { EmptyState } from './ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './app/table'

const conversionBasisPoints = (card: VideoScorecard) =>
  card.fans_captured == null || card.tracked_clicks.total === 0
    ? null
    : Math.round((card.fans_captured * 10_000) / card.tracked_clicks.total)

const pct = (basisPoints: number | null) =>
  basisPoints == null ? '—' : `${(basisPoints / 100).toFixed(1)}%`

/**
 * The useful content scoreboard: not which video accumulated the largest
 * public counter, but which one converted tracked attention into people the
 * artist can reach again.
 */
export function VideoFanConversionPanel(props: { slug: string }) {
  const scorecards = useQuery(() => ({
    queryKey: ['video-fan-scorecards', props.slug],
    queryFn: () => surface.read<VideoScorecard[]>(props.slug, capability('video-scorecards').read!.path, { limit: '10' }),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const ranked = () => (scorecards.data ?? []).slice().sort((a, b) =>
    (b.fans_captured ?? -1) - (a.fans_captured ?? -1)
      || (conversionBasisPoints(b) ?? -1) - (conversionBasisPoints(a) ?? -1)
      || b.tracked_clicks.total - a.tracked_clicks.total
  )

  return <Section
    title="Videos that make fans"
    icon={<SectionIcon name="users" />}
    description="Tracked views and clicks are attention. This table ranks recent videos by the people who actually joined the owned fanbase after clicking through."
  >
    <Show when={scorecards.isPending}><SkeletonRows count={3} /></Show>

    <Show when={scorecards.error}>
      <p class="mt-3 text-sm text-muted-foreground">
        Fan conversion by video is not available on this CrowdRelay build yet.
      </p>
    </Show>

    <Show when={!scorecards.isPending && !scorecards.error}>
      <Show
        when={ranked().length > 0}
        fallback={<EmptyState icon={<Users />} label="No video conversion data yet" hint="Once a recent video carries tracked links, this shows which ones turn attention into owned fans." />}
      >
        <Table class="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Video</TableHead>
              <TableHead class="text-right">Owned fans</TableHead>
              <TableHead class="text-right">Tracked clicks</TableHead>
              <TableHead class="text-right">Fan conversion</TableHead>
              <TableHead class="text-right">Attributed views</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <For each={ranked()}>{card => (
              <TableRow>
                <TableCell class="whitespace-normal">
                  <Show when={card.url} fallback={<strong class="text-foreground">{card.title}</strong>}>
                    {url => <a class="font-semibold text-foreground hover:underline" href={url()} target="_blank" rel="noreferrer">{card.title}</a>}
                  </Show>
                  <small class="mt-0.5 block text-xs text-muted-foreground">
                    {card.age_days}d old · {card.pace.replace(/_/g, ' ')}
                  </small>
                </TableCell>
                <TableCell numeric class="font-semibold">{card.fans_captured == null ? '—' : card.fans_captured.toLocaleString()}</TableCell>
                <TableCell numeric>{card.tracked_clicks.total.toLocaleString()}</TableCell>
                <TableCell numeric>{pct(conversionBasisPoints(card))}</TableCell>
                <TableCell numeric>{card.attributed_views == null ? '—' : card.attributed_views.toLocaleString()}</TableCell>
              </TableRow>
            )}</For>
          </TableBody>
        </Table>
      </Show>
    </Show>
  </Section>
}
