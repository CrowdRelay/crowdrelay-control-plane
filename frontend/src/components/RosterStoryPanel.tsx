import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { Section, KpiStrip, KpiCard } from './layout'
import { SectionIcon } from './SectionIcon'
import { Button } from './app/button'
import { toast } from './app/toast'

// The roster's story for a partner conversation — one document a label can
// attach without touching a database. Proof for a label is the roster, not
// one act, so this renders only when the organisation has more than one act;
// counts only, never a list of anybody's fans.

type CaseStudy = {
  roster: { activeFans: number; fansLast30d: number; workspaceCount: number }
  amplification: { activeEdges: number; deliveriesLast30d: number }
}

export function RosterStoryPanel(props: { slug: string }) {
  const story = useQuery(() => ({
    queryKey: ['surface', props.slug, 'case-study'],
    queryFn: () => surface.read<CaseStudy>(props.slug, capability('case-study').read!.path),
    staleTime: 5 * 60_000,
    retry: 1,
  }))
  const copy = async () => {
    await navigator.clipboard?.writeText(JSON.stringify(story.data, null, 2))
    toast.success('Copied — paste it into the conversation')
  }
  return (
    <Show when={story.data && story.data.roster.workspaceCount > 1}>
      <Section
        title="The roster story"
        icon={<SectionIcon name="users" />}
        description="What the whole roster reaches, and how its acts carry each other — the numbers a label shows a partner."
        action={<Button size="sm" variant="outline" onClick={() => void copy()}>Copy the document</Button>}
      >
        <KpiStrip>
          <KpiCard label="Acts" value={story.data!.roster.workspaceCount} />
          <KpiCard label="Reachable fans" value={story.data!.roster.activeFans} />
          <KpiCard label="New fans" value={story.data!.roster.fansLast30d} sub="last 30 days" />
          <KpiCard label="Cross-promotions" value={story.data!.amplification.deliveriesLast30d} sub={`${story.data!.amplification.activeEdges} live agreements`} />
        </KpiStrip>
      </Section>
    </Show>
  )
}
