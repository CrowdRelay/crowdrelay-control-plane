import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { PageShell, PageHeader, Section, KpiStrip, KpiCard } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { RowTag, StatusPill, WorkRow } from '../components/ViewBlocks'
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
      <Show when={authState.isPlatformLevel()} fallback={<EmptyState label="This map is for the people who run the console." />}>
        <PageHeader
          eyebrow="Where things live"
          title="Capabilities"
          description="Every feature, grouped by what it does for the fans, with the page and section where it is used. Nothing is operated from here."
          actions={<StatusPill tone={gaps.length > 0 ? 'warn' : 'good'}>{gaps.length > 0 ? `${gaps.length} of ${all.length} have no screen yet` : `All ${all.length} have a home`}</StatusPill>}
        />
        <KpiStrip>
          <For each={PILLARS}>{pillar => (
            <KpiCard
              label={pillar.title}
              value={inPillar(pillar.id).length}
              sub={gapsIn(pillar.id) === 0 ? 'all placed' : `${gapsIn(pillar.id)} without a home`}
              tone={gapsIn(pillar.id) > 0 ? 'warn' : undefined}
            />
          )}</For>
        </KpiStrip>
        <Show when={gaps.length > 0}>
          <Section title="No home yet" icon={<SectionIcon name="alert-triangle" />} description="What blocks each one from a screen — the gap is a finding, not a form.">
            <div class="flex flex-col">
              <For each={gaps}>{gap => (
                <WorkRow
                  tag={<RowTag tone={byChoice(gap.gap!) ? 'muted' : 'bad'}>{byChoice(gap.gap!) ? 'by choice' : 'no read'}</RowTag>}
                  title={gap.title}
                  why={gap.gap}
                />
              )}</For>
            </div>
          </Section>
        </Show>
        <div class="mt-6 flex items-center justify-between gap-3">
          <p class="text-sm text-muted-foreground">Find a feature — each links to the page and section where it is used.</p>
          <Input class="w-64" placeholder="Filter…" value={filter()} onInput={(event) => setFilter(event.currentTarget.value)} />
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
