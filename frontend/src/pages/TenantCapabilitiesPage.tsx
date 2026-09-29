import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { PageShell, Section } from '../components/layout'
import { Card, DashHeader, ItemRow, Tile, Tiles } from '../components/ui/dash'
import { Lock, Puzzle } from 'lucide-solid'
import { Input } from '../components/ui/input'
import { Badge } from '../components/app/badge'
import { EmptyState } from '../components/ui/empty-state'
import { authState } from '../lib/auth'
import { PAGE_CAPABILITIES, PILLARS, SURFACE_CAPABILITIES, type Pillar } from '../lib/capabilities'

/** `/tenants/$slug/capabilities` — the map of where every feature lives.
 *
 * An index, not a workplace. Every capability is used where its moment
 * already is — the show, the city, the queue, the settings of the act — and
 * this page only says where that is, with a link. It exists for the people
 * who shape the console (the designer first) and for operators learning the
 * system, so it is platform-level only and never in a band's sidebar or
 * palette. Capabilities that no screen can host honestly yet are listed with
 * the reason, because the gap is a finding, not a form. */
export function TenantCapabilitiesPage() {
  const params = useParams({ from: '/tenants/$slug/capabilities' })
  const [filter, setFilter] = createSignal('')
  const matches = (text: string) => text.toLowerCase().includes(filter().trim().toLowerCase())
  const href = (path: string) => {
    // `<show>` stands for any one night: the map links to the list it is
    // opened from.
    const concrete = path.startsWith('/shows/<show>') ? '/shows' : path
    return `/tenants/${params().slug}${concrete}`
  }
  const entries = (pillar: Pillar) => createMemo(() => [
    ...PAGE_CAPABILITIES.filter(c => c.pillar === pillar).map(c => ({ title: c.title, purpose: c.purpose, where: c.where, section: null as string | null, gap: null as string | null, platformOnly: false })),
    ...SURFACE_CAPABILITIES.filter(c => c.pillar === pillar).map(c => ({ title: c.title, purpose: c.purpose, where: c.home?.path ?? null, section: c.home?.section ?? null, gap: c.gap ?? null, platformOnly: c.platformOnly ?? false })),
  ].filter(e => matches(e.title) || matches(e.purpose) || matches(e.section ?? '')))

  // The page's question is "what has no home?" — the answer opens it. A gap
  // whose note starts "Deliberately" is a choice someone made, not a
  // missing read, and is tagged so.
  const all = [...PAGE_CAPABILITIES, ...SURFACE_CAPABILITIES]
  const gaps = SURFACE_CAPABILITIES.filter(c => c.gap)
  const inPillar = (pillar: Pillar) => all.filter(c => c.pillar === pillar)
  const gapsIn = (pillar: Pillar) => gaps.filter(c => c.pillar === pillar).length
  const byChoice = (gap: string) => gap.startsWith('Deliberately')

  return (
    <PageShell>
      <Show when={authState.isPlatformLevel()} fallback={<EmptyState icon={<Lock />} label="This map is for the people who run the console." />}>
        <DashHeader
          title="Capabilities"
          subtitle="Where every feature lives, and which have no home"
          pill={gaps.length > 0 ? { tone: 'warn', text: `${gaps.length} of ${all.length} have no screen yet` } : { tone: 'good', text: `All ${all.length} have a home` }}
        />
        <Tiles>
          <For each={PILLARS}>{pillar => (
            <Tile
              label={pillar.title}
              value={inPillar(pillar.id).length}
              sub={gapsIn(pillar.id) === 0 ? 'all placed' : `${gapsIn(pillar.id)} without a home`}
            />
          )}</For>
        </Tiles>
        <Show when={gaps.length > 0}>
          <Card title="No home yet" icon={<Puzzle />} aside="what blocks it" class="mb-3">
            <For each={gaps}>{gap => (
              <ItemRow
                pill={{ tone: byChoice(gap.gap!) ? 'muted' : 'bad', text: byChoice(gap.gap!) ? 'by choice' : 'no read' }}
                title={gap.title}
                sub={gap.gap}
              />
            )}</For>
          </Card>
        </Show>
        <div class="mt-6 flex items-center justify-between gap-3">
          <p class="text-sm text-muted-foreground">Find a feature — each links to the page and section where it is used.</p>
          <Input class="w-64" aria-label="Filter features" placeholder="Filter…" value={filter()} onInput={(event) => setFilter(event.currentTarget.value)} />
        </div>
        <For each={PILLARS}>{(pillar) => {
          const list = entries(pillar.id)
          return (
            <Show when={list().length > 0}>
              <Section title={pillar.title} description={pillar.question} count={list().length}>
                <ul class="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <For each={list()}>{(entry) => (
                    <li class="rounded-md border border-border p-3">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <Show when={entry.where} fallback={<span class="font-medium text-foreground">{entry.title}</span>}>
                          {where => <Link to={href(where())} class="font-medium text-foreground underline-offset-4 hover:underline">{entry.title}</Link>}
                        </Show>
                        <div class="flex gap-1">
                          <Show when={entry.platformOnly}><Badge variant="muted">platform only</Badge></Show>
                          <Show when={entry.gap}><Badge variant="warning">no home yet</Badge></Show>
                        </div>
                      </div>
                      <p class="mt-0.5 text-sm text-muted-foreground">{entry.purpose}</p>
                      <Show when={entry.where}>
                        <p class="mt-1 text-xs text-muted-foreground">{entry.where}{entry.section ? ` · ${entry.section}` : ''}</p>
                      </Show>
                      <Show when={entry.gap}><p class="mt-1 text-xs text-muted-foreground">{entry.gap}</p></Show>
                    </li>
                  )}</For>
                </ul>
              </Section>
            </Show>
          )
        }}</For>
      </Show>
    </PageShell>
  )
}
