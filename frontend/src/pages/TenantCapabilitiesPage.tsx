import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { PageShell, PageHeader, Section } from '../components/layout'
import { CapabilityCard } from '../components/capabilities/CapabilityCard'
import { Input } from '../components/ui/input'
import { Badge } from '../components/app/badge'
import { authState } from '../lib/auth'
import { PAGE_CAPABILITIES, PILLARS, SURFACE_CAPABILITIES, type Pillar } from '../lib/capabilities'

/** `/tenants/$slug/capabilities` — everything the system can do, on one page.
 *
 * Not a sidebar destination: the console's plan is fewer places to look, not
 * more (`scripts/destination_count_ratchet.json`). This is the inventory a
 * person new to the system — the designer first — reads to learn what exists:
 * each capability that already has a designed home is named with a link to
 * it, and each that does not yet is usable right here, in a plain generic
 * form, until it gets one. Reached from Settings and the command palette. */
export function TenantCapabilitiesPage() {
  const params = useParams({ from: '/tenants/$slug/capabilities' })
  const [filter, setFilter] = createSignal('')
  const matches = (text: string) => text.toLowerCase().includes(filter().trim().toLowerCase())
  const surfaceFor = (pillar: Pillar) => createMemo(() =>
    SURFACE_CAPABILITIES.filter(c => c.pillar === pillar && (matches(c.title) || matches(c.purpose))))
  const pagesFor = (pillar: Pillar) => createMemo(() =>
    PAGE_CAPABILITIES.filter(c => c.pillar === pillar && (matches(c.title) || matches(c.purpose))))
  const href = (where: string) => `/tenants/${params().slug}${where}`

  return (
    <PageShell>
      <PageHeader
        eyebrow="Everything in one place"
        title="Capabilities"
        description="Every feature the system has, grouped by what it does for the fans: find them, grow them, turn them into tickets and nights out, and the machinery that runs it all. Features with a page link to it; the rest work here until they get one."
        actions={<Input class="w-64" placeholder="Filter…" value={filter()} onInput={(event) => setFilter(event.currentTarget.value)} />}
      />
      <For each={PILLARS}>{(pillar) => {
        const live = surfaceFor(pillar.id)
        const pages = pagesFor(pillar.id)
        return (
          <Show when={live().length + pages().length > 0}>
            <Section title={pillar.title} description={pillar.question} count={live().length + pages().length}>
              <Show when={pages().length > 0}>
                <ul class="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <For each={pages()}>{(entry) => (
                    <li class="rounded-md border border-border p-3">
                      <div class="flex items-center justify-between gap-2">
                        <Link to={href(entry.where)} class="font-medium text-foreground underline-offset-4 hover:underline">{entry.title}</Link>
                        <Badge variant="muted">has a page</Badge>
                      </div>
                      <p class="mt-0.5 text-sm text-muted-foreground">{entry.purpose}</p>
                    </li>
                  )}</For>
                </ul>
              </Show>
              <div class="space-y-3">
                <For each={live()}>{(capability) => (
                  <CapabilityCard slug={params().slug} capability={capability} platformLevel={authState.isPlatformLevel()} />
                )}</For>
              </div>
            </Section>
          </Show>
        )
      }}</For>
    </PageShell>
  )
}
