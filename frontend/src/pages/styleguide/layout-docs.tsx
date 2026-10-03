import { For, createSignal, type JSX } from 'solid-js'
import { Plus, Ticket, Users } from 'lucide-solid'
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar'
import { AppSidebar } from '~/components/shell/AppSidebar'
import { SiteHeader } from '~/components/shell/SiteHeader'
import { CommandTrigger } from '~/components/shell/CommandTrigger'
import { Button } from '~/components/app/button'
import { Input } from '~/components/ui/input'
import { NativeSelect } from '~/components/ui/native-select'
import { Card as DashCard, DashHeader, ItemRow, Pill, Split, StatRow, Tile, Tiles } from '~/components/ui/dash'
import { PageShell, Section, SectionTitle, TabBar } from '~/components/layout'
import { SaveActions, SettingsRow, SettingsSection } from '~/components/ui/settings'
import { tenantNavGroups } from '~/lib/nav'
import type { TenantSummary } from '~/lib/types'
import { cn } from '~/lib/cn'
import { Callout, DoDont, DocSection, Example, Guidance, PropTable } from './kit'
import type { DocEntry } from './types'

export const SAMPLE_SLUG = 'virya'

const SAMPLE_TENANTS = [
  { slug: 'virya', displayName: 'Virya', status: 'active', runtimeHealth: 'healthy' },
  { slug: 'nocny-tramwaj', displayName: 'Nocny Tramwaj', status: 'active', runtimeHealth: 'degraded' },
  { slug: 'kwiat-jabloni', displayName: 'Kwiat Jabłoni', status: 'parked', runtimeHealth: 'stale' },
] as unknown as TenantSummary[]

/**
 * A box the real shell can live in. The stock sidebar is `position: fixed`
 * and `h-svh`; a transformed ancestor becomes the containing block for fixed
 * children, and the two arbitrary variants swap viewport heights for the
 * frame's, so the sidebar, header and inset all fit inside the specimen.
 */
function ShellFrame(props: { open?: boolean; class?: string; children: JSX.Element }) {
  const [open, setOpen] = createSignal(props.open ?? true)
  return (
    <div class={cn('relative h-[560px] overflow-hidden [transform:translateZ(0)] [&_.h-svh]:h-full [&_.min-h-svh]:min-h-full', props.class)}>
      <SidebarProvider open={open()} onOpenChange={setOpen} class="h-full min-h-0 overflow-hidden">
        {props.children}
      </SidebarProvider>
    </div>
  )
}

function SampleSidebar() {
  return (
    <AppSidebar
      platformLevel
      canCreateTenant
      tenants={SAMPLE_TENANTS}
      navSlug={SAMPLE_SLUG}
      ownTenantSlug={undefined}
      groups={tenantNavGroups(true)}
      onSelectTenant={() => {}}
      badgeFor={item => (item.icon === 'attention' ? 4 : 0)}
      user={{ name: 'demo.admin', role: 'Platform admin' }}
      onLogout={() => {}}
    />
  )
}

/** The page template most tenant pages follow: header, numbers, two cards, a section. */
export function SamplePage() {
  return (
    <PageShell>
      <DashHeader
        title="Shows"
        subtitle="3 upcoming · next on Fri 3 Oct at Hydrozagadka"
        actions={<><Pill tone="good">On sale</Pill><Button size="sm"><Plus /> Add show</Button></>}
      />
      <Tiles>
        <Tile label="Tickets sold" value="214" sub="of 300 · 71%" />
        <Tile label="Fans on the list" value="1,284" sub="+62 this week" valueTone="good" />
        <Tile label="Unanswered" value="14" sub="oldest 2 days" valueTone="warn" />
        <Tile label="Failed sends" value="3" sub="last 24h" valueTone="bad" />
      </Tiles>
      <Split>
        <DashCard title="Needs you" icon={<Ticket />} aside="ranked by fans it can bring">
          <ItemRow pill={{ tone: 'warn', text: 'Today' }} title="Confirm the support act" sub="Nocny Tramwaj replied yes" action={<Button size="sm" variant="outline">Review</Button>} />
          <ItemRow pill={{ tone: 'accent', text: 'Draft' }} title="Poster post for Instagram" sub="Ready to approve" action={<Button size="sm" variant="outline">Open</Button>} />
        </DashCard>
        <DashCard title="Fri 3 Oct" icon={<Users />}>
          <StatRow label="Doors" value={<span class="tabular-nums">19:00</span>} />
          <StatRow label="Tracked ticket link" value={<Pill tone="good">done</Pill>} />
          <StatRow label="Press kit sent" value={<Pill tone="muted">not yet</Pill>} />
        </DashCard>
      </Split>
      <Section title="Past shows" description="Every show you played, newest first.">
        <p class="m-0 text-sm text-muted-foreground">A DataTable goes here — see Components → DataTable.</p>
      </Section>
    </PageShell>
  )
}

const ANATOMY = [
  ['1', 'Sidebar', 'AppSidebar — tenant switcher, nav groups, the account menu. Collapses to an icon rail (⌘B); a sheet on phones.'],
  ['2', 'Top bar', 'SiteHeader — sidebar toggle, breadcrumb (where you are), CommandTrigger on the right.'],
  ['3', 'Banner', 'Optional full-width strip under the top bar — today only the read-only session notice.'],
  ['4', 'Content pane', 'The only scroller. Holds the routed page inside an error boundary and a Suspense skeleton.'],
  ['5', 'Page', 'PageShell → DashHeader → Tiles → Split / Sections. Every page fills the pane the same way.'],
  ['6', 'Floating', 'Toasts (bottom right), the chat widget on tenant pages, the command palette, confirm dialogs.'],
] as const

export const layoutEntries: DocEntry[] = [
  {
    id: 'app-shell', tab: 'layout', group: 'Shell', title: 'App shell',
    summary: 'The frame every signed-in page renders in: sidebar, top bar, one scrolling content pane.',
    sources: ['components/Shell.tsx', 'components/ErrorBoundaryPanel.tsx'], keywords: 'layout frame chrome container website',
    render: () => (
      <>
        <DocSection title="Live shell" description="The real AppSidebar and SiteHeader over sample data. Click the nav — it navigates a private in-memory router, so links light up as they do in the app. Press the toggle to collapse to the icon rail.">
          <Example stage="flush">
            <ShellFrame>
              <SampleSidebar />
              <SidebarInset class="h-full min-h-0 overflow-hidden">
                <SiteHeader section={{ label: 'Virya' }} page="Shows" actions={<CommandTrigger />} />
                <div class="flex-1 overflow-auto"><SamplePage /></div>
              </SidebarInset>
            </ShellFrame>
          </Example>
        </DocSection>
        <DocSection title="Anatomy">
          <ol class="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            <For each={ANATOMY}>{([n, name, text]) => (
              <li class="flex gap-3 rounded-lg border border-border p-4">
                <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background">{n}</span>
                <div><p class="m-0 text-sm font-medium">{name}</p><p class="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</p></div>
              </li>
            )}</For>
          </ol>
        </DocSection>
        <DocSection title="Rules">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li><strong class="text-foreground">One scroller.</strong> The document never scrolls; the content pane does. Don’t add <code>overflow-auto</code> wrappers inside a page except for wide tables and code.</li>
            <li><strong class="text-foreground">The shell owns chrome.</strong> A page never draws its own top bar, breadcrumb or toast host. It starts at <code>PageShell</code>.</li>
            <li><strong class="text-foreground">Skip link and landmarks.</strong> “Skip to content” jumps to <code>#main-content</code>; the sidebar is <code>nav[aria-label=Main]</code>.</li>
            <li><strong class="text-foreground">Errors stay inside a page.</strong> The pane’s ErrorBoundary is keyed on the route, so navigating away recovers.</li>
          </ul>
        </DocSection>
        <DocSection title="Structure">
          <Example code={`<SidebarProvider>
  <AppSidebar … />
  <SidebarInset id="main-content">
    <SiteHeader section={…} page={…} actions={<CommandTrigger />} />
    <ReadOnlyBanner />             {/* only for viewers */}
    <div class="flex-1 overflow-auto">
      <ErrorBoundaryPanel><Suspense fallback={…}><Outlet /></Suspense></ErrorBoundaryPanel>
    </div>
    <ToastContainer /> <ConfirmHost />
  </SidebarInset>
  <ChatWidget />                   {/* tenant pages */}
</SidebarProvider>`} stage="muted">
            <p class="m-0 text-sm text-muted-foreground">Source: <code>components/Shell.tsx</code>. You never build this — every route renders inside it.</p>
          </Example>
        </DocSection>
      </>
    ),
  },
  {
    id: 'sidebar', tab: 'layout', group: 'Shell', title: 'Sidebar',
    summary: 'shadcn sidebar-07: tenant switcher, nav groups that never fold, sub-pages inline under the section you are in.',
    sources: ['components/ui/sidebar.tsx', 'components/shell/AppSidebar.tsx', 'components/shell/NavMain.tsx', 'components/shell/NavUser.tsx', 'components/TenantSwitcher.tsx', 'lib/nav.ts'],
    keywords: 'navigation nav menu rail sub-pages',
    render: () => (
      <>
        <DocSection title="Expanded and collapsed">
          <div class="grid gap-4 lg:grid-cols-2">
            <Example title="Expanded" description="Today is open, so its sub-pages list under it." stage="flush">
              <ShellFrame class="h-[520px]">
                <SampleSidebar />
                <SidebarInset class="h-full min-h-0 bg-muted/30" />
              </ShellFrame>
            </Example>
            <Example title="Icon rail" description="⌘B or the toggle. Labels move to tooltips." stage="flush">
              <ShellFrame open={false} class="h-[520px]">
                <SampleSidebar />
                <SidebarInset class="h-full min-h-0 bg-muted/30" />
              </ShellFrame>
            </Example>
          </div>
        </DocSection>
        <DocSection title="Anatomy">
          <PropTable rows={[
            ['SidebarHeader', 'TenantSwitcher | TenantBadge', '—', 'Platform users pick a tenant (typeahead); a tenant operator sees their own tenant, no menu.'],
            ['SidebarGroup', 'NavGroup', '—', 'One per group in lib/nav.ts (“Every day”, “Your audience”, “The rest”, “Operator”). Always open — no fold chevrons.'],
            ['NavLink', 'NavItem', '—', 'Icon + label. Lit on its overview; on a sub-page the section reads bold and the sub-page row is lit.'],
            ['SidebarMenuSub', 'NavSubItem[]', '—', 'A section’s sub-pages, indented, shown only while you are inside that section.'],
            ['SidebarMenuBadge', 'number', '0', 'Quiet count pill, capped at 99+. Only on the attention item.'],
            ['SidebarFooter', 'NavUser', '—', 'Avatar, name, role; menu with theme (light / dark / system) and Log out.'],
          ]} />
        </DocSection>
        <DocSection title="Adding a destination">
          <Example code={`// lib/nav.ts — add the item to BAND_NAV_GROUPS and TENANT_NAV_GROUPS
{ path: '/tenants/$slug/merch', label: 'Merch', exact: false, icon: 'shows',
  children: [{ segment: 'stock', label: 'Stock' }, { segment: 'orders', label: 'Orders' }] }

// AuthenticatedApp.tsx — one route per sub-page
// The page: section prop + useSubPage() + <SubPagePanel when={…}>`} stage="muted">
            <p class="m-0 text-sm text-muted-foreground">A sub-page is a real route, never a <code>?tab=</code>. Keep both nav arrays literal — the destination-count ratchet parses them.</p>
          </Example>
          <Guidance
            use={['Real, URL-addressable areas of a section (Settings → Profile, Destinations…).', 'A new top-level destination people visit on their own.']}
            avoid={['Filters or views of one list — use DataTable filter chips.', 'Actions (“New tenant”) — they belong on the page they act on.']}
          />
        </DocSection>
      </>
    ),
  },
  {
    id: 'top-bar', tab: 'layout', group: 'Shell', title: 'Top bar',
    summary: 'SiteHeader: sidebar toggle, a breadcrumb that names the place, CommandTrigger on the right.',
    sources: ['components/shell/SiteHeader.tsx', 'components/shell/CommandTrigger.tsx', 'components/ui/breadcrumb.tsx', 'components/CommandPalette.tsx', 'components/command-palette-state.ts'],
    keywords: 'header topbar breadcrumb search command palette',
    render: () => (
      <>
        <DocSection title="Live">
          <Example stage="flush">
            <ShellFrame class="h-16">
              <SidebarInset class="h-full min-h-0">
                <SiteHeader section={{ label: 'Virya' }} page="Settings" actions={<CommandTrigger />} />
              </SidebarInset>
            </ShellFrame>
          </Example>
          <Example title="Platform level" description="Outside a tenant the first crumb is “Platform”." stage="flush">
            <ShellFrame class="h-16">
              <SidebarInset class="h-full min-h-0">
                <SiteHeader section={{ label: 'Platform' }} page="Tenants" actions={<CommandTrigger />} />
              </SidebarInset>
            </ShellFrame>
          </Example>
        </DocSection>
        <DocSection title="Rules">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>64px tall (48px when the sidebar is a rail), bottom border, no shadow.</li>
            <li>The breadcrumb names where you are; it doesn’t repeat the page heading’s sentence. The first crumb hides below md.</li>
            <li>Right side is for global tools only (command palette). Page actions live in the page header.</li>
            <li>CommandTrigger is a button dressed as a search field with ⌘K; below sm it folds to an icon.</li>
          </ul>
        </DocSection>
      </>
    ),
  },
  {
    id: 'page-container', tab: 'layout', group: 'Page', title: 'Page container',
    summary: 'PageShell: the gutter, the top and bottom padding and the vertical rhythm every page shares.',
    sources: ['components/layout.tsx'], keywords: 'container wrapper padding gutter PageShell',
    render: () => (
      <>
        <DocSection title="Live" description="The tinted band shows PageShell’s padding: 16px on phones, 24px from md; 24px top, 80px bottom so content clears the chat button.">
          <Example stage="flush">
            <div class="bg-info-solid/10">
              <PageShell class="pb-6">
                <div class="rounded-md border border-dashed border-info-solid/60 bg-background p-4 text-sm text-muted-foreground">DashHeader</div>
                <div class="rounded-md border border-dashed border-info-solid/60 bg-background p-4 text-sm text-muted-foreground">Tiles</div>
                <div class="rounded-md border border-dashed border-info-solid/60 bg-background p-4 text-sm text-muted-foreground">Section · space-y-5 between children</div>
              </PageShell>
            </div>
          </Example>
        </DocSection>
        <DocSection title="Usage">
          <Example code={`export default function TenantMerchPage() {
  return (
    <PageShell>
      <DashHeader title="Merch" subtitle="…" actions={…} />
      <Tiles>…</Tiles>
      <Section title="Stock">…</Section>
    </PageShell>
  )
}`} stage="muted"><p class="m-0 text-sm text-muted-foreground">Full width of the pane — no max-width on dashboards. Settings pages read better narrower and cap their rows at <code>max-w-xl</code> per control.</p></Example>
          <PropTable rows={[['children', 'JSX.Element', '—', 'The page.'], ['class', 'string', '—', 'Rarely needed; prefer the default rhythm.']]} />
        </DocSection>
      </>
    ),
  },
  {
    id: 'page-header', tab: 'layout', group: 'Page', title: 'Page header',
    summary: 'DashHeader: title, one line under it, status and actions on the right. One per page.',
    sources: ['components/ui/dash.tsx'], keywords: 'title heading DashHeader back',
    render: () => (
      <>
        <DocSection title="DashHeader" description="The page title the console uses on 24 pages.">
          <Example code={`<DashHeader
  title="Shows"
  subtitle="3 upcoming · next on Fri 3 Oct"
  actions={<><Pill tone="good">On sale</Pill><Button size="sm"><Plus /> Add show</Button></>}
/>`}>
            <DashHeader title="Shows" subtitle="3 upcoming · next on Fri 3 Oct" actions={<><Pill tone="good">On sale</Pill><Button size="sm"><Plus /> Add show</Button></>} />
          </Example>
          <Example title="With a back link" description="Sub-views reached from a list name where they came from." code={`<DashHeader back={{ label: 'Places', to: '/tenants/$slug/places', params: { slug } }} title="Warszawa" />`}>
            <DashHeader back={{ label: 'Places', to: '/tenants/$slug/places', params: { slug: SAMPLE_SLUG } }} title="Warszawa" subtitle="412 fans · 3 venues" />
          </Example>
          <PropTable rows={[
            ['title', 'JSX.Element', '—', 'Page or sub-page label — the same words as the sidebar row.'],
            ['subtitle', 'JSX.Element', '—', 'One line of context: counts, the next date, freshness.'],
            ['back', '{ label, to, params?, search? }', '—', '“← Places” above the title.'],
            ['actions', 'JSX.Element', '—', 'Status pill first, then at most one primary button.'],
          ]} />
        </DocSection>
        <DocSection title="Do and don’t">
          <DoDont
            do={{ children: <div class="w-full"><DashHeader title="Settings" subtitle="Profile" actions={<Button size="sm">Save</Button>} /></div>, caption: 'One header, one primary action.' }}
            dont={{ children: <div class="w-full"><DashHeader title="Settings" actions={<><Button size="sm">Save</Button><Button size="sm">Publish</Button><Button size="sm">Sync</Button></>} /></div>, caption: 'Several filled buttons competing — demote all but one to outline or a menu.' }}
          />
        </DocSection>
      </>
    ),
  },
  {
    id: 'grids', tab: 'layout', group: 'Page', title: 'Grids: Tiles & Split',
    summary: 'The two grids pages are built on: a row of numbers, and two cards side by side.',
    sources: ['components/ui/dash.tsx'], keywords: 'grid columns responsive tiles split',
    render: () => (
      <>
        <DocSection title="Tiles" description="2 columns on phones, 4 from lg (cols 2–6 available). Each child is a Tile.">
          <Example code={`<Tiles cols={4}>
  <Tile label="Tickets sold" value="214" sub="of 300" />
  …
</Tiles>`}>
            <Tiles class="mb-0">
              <Tile label="Tickets sold" value="214" sub="of 300" />
              <Tile label="Fans" value="1,284" sub="+62 this week" valueTone="good" />
              <Tile label="Unanswered" value="14" valueTone="warn" />
              <Tile label="Not reported" value={null} sub="Inbox not connected" />
            </Tiles>
          </Example>
        </DocSection>
        <DocSection title="Split" description="Wide + narrow (1.6 : 1) by default — the work list and the one object the page is about. mid is 1.3 : 1, even is halves. Stacks below lg.">
          <For each={[['default', {}], ['mid', { mid: true }], ['even', { even: true }]] as const}>{([name, p]) => (
            <Example title={name} code={`<Split${name === 'default' ? '' : ' ' + name}>…</Split>`}>
              <Split {...p} class="mb-0">
                <div class="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">main</div>
                <div class="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">aside</div>
              </Split>
            </Example>
          )}</For>
        </DocSection>
      </>
    ),
  },
  {
    id: 'sections', tab: 'layout', group: 'Page', title: 'Sections',
    summary: 'Section: a titled block divided from the one above by a rule. One lead section per page.',
    sources: ['components/layout.tsx'], keywords: 'section heading rule lead panel',
    render: () => (
      <>
        <DocSection title="Section">
          <Example code={`<Section title="Needs you today" count={3} lead description="…" action={<Button size="sm" variant="outline">Clear all</Button>}>
  …
</Section>`}>
            <div class="space-y-5">
              <Section title="Needs you today" count={3} lead description="Ranked by what it costs to leave." action={<Button size="sm" variant="outline">Clear all</Button>}>
                <p class="m-0 text-sm text-muted-foreground">Lead: larger heading, primary-tinted rule. One per page.</p>
              </Section>
              <Section title="Where your fans come from" description="Last 30 days">
                <p class="m-0 text-sm text-muted-foreground">Every other section: base heading and a hairline rule.</p>
              </Section>
            </div>
          </Example>
          <PropTable rows={[
            ['title', 'string', '—', 'Sentence case.'],
            ['description', 'JSX.Element', '—', 'One sentence, max-w-3xl.'],
            ['count', 'number', '—', 'Pill after the title; spoken as “, 3 items”.'],
            ['action', 'JSX.Element', '—', 'Controls that act on the whole section.'],
            ['lead', 'boolean', 'false', 'The section that answers the page’s question.'],
            ['flush', 'boolean', 'false', 'No top rule — first section under something else.'],
          ]} />
        </DocSection>
        <DocSection title="SectionTitle" description="A heading row without the section wrapper — for headings inside a card.">
          <Example><SectionTitle eyebrow="Audience" title="Where your fans come from" description="Last 30 days" action={<Button size="sm" variant="ghost">View all</Button>} /></Example>
        </DocSection>
      </>
    ),
  },
  {
    id: 'settings-layout', tab: 'layout', group: 'Page', title: 'Settings layout',
    summary: 'Untitled UI pattern: a section header with Cancel / Save, then two-column rows. Save per section.',
    sources: ['components/ui/settings.tsx'], keywords: 'settings form two column save cancel danger',
    render: () => {
      const [name, setName] = createSignal('Virya')
      const [saved, setSaved] = createSignal('Virya')
      return (
        <>
          <DocSection title="Live" description="Edit the name: Cancel and Save wake up only when something changed.">
            <Example code={`<SettingsSection title="Profile" description="…" actions={<SaveActions dirty={dirty()} onCancel={reset} onSave={save} />}>
  <SettingsRow label="Band name" hint="Shown to fans on every page." for="band-name">
    <Input id="band-name" value={name()} onInput={…} />
  </SettingsRow>
</SettingsSection>`}>
              <div class="flex flex-col gap-8">
                <SettingsSection title="Profile" description="How the band appears to fans and promoters."
                  actions={<SaveActions dirty={name() !== saved()} onCancel={() => setName(saved())} onSave={() => setSaved(name())} saved={name() === saved() && saved() !== 'Virya'} />}>
                  <SettingsRow label="Band name" hint="Shown to fans on every page." for="sg-band-name">
                    <Input id="sg-band-name" value={name()} onInput={e => setName(e.currentTarget.value)} />
                  </SettingsRow>
                  <SettingsRow label="Home city" hint="Used to rank venues near you.">
                    <NativeSelect><option>Warszawa</option><option>Kraków</option></NativeSelect>
                  </SettingsRow>
                </SettingsSection>
                <SettingsSection title="Danger zone" tone="danger" description="Parking stops every automation until you resume.">
                  <SettingsRow label="Park this workspace" hint="Nothing is deleted.">
                    <Button variant="destructive" size="sm">Park workspace</Button>
                  </SettingsRow>
                </SettingsSection>
              </div>
            </Example>
          </DocSection>
          <DocSection title="Pieces">
            <PropTable rows={[
              ['SettingsSection', 'title, description, actions, tone?, plain?', '—', 'Heading + rule. plain for a table; tone="danger" boxes it in destructive.'],
              ['SettingsRow', 'label, hint?, for?, children', '—', 'Two columns from md (1 : 2), stacked below. Control capped at max-w-xl.'],
              ['SaveActions', 'dirty, pending?, blocked?, saved?, onCancel, onSave', '—', 'Cancel / Save, disabled until dirty. blocked says why Save is held.'],
            ]} />
            <Callout>Lists inside settings use DataTable; adding to them opens FormDrawer. The Danger zone sits at the foot of Profile.</Callout>
          </DocSection>
        </>
      )
    },
  },
  {
    id: 'sub-pages', tab: 'layout', group: 'Page', title: 'Sub-pages & tabs',
    summary: 'Areas of a section are real routes listed in the sidebar. In-page tab strips are legacy.',
    sources: ['components/ui/dash.tsx', 'components/layout.tsx', 'lib/roving-tabs.ts'], keywords: 'tabs tabbar work areas sub page routes',
    render: () => {
      const [tab, setTab] = createSignal('stock')
      return (
        <>
          <DocSection title="Sub-pages (current)" description="Each area is /tenants/$slug/<section>/<area>, listed under its section in the sidebar while you’re in it. The page renders one SubPagePanel per area.">
            <Example code={`const sub = useSubPage(() => props.section, '/tenants/$slug/settings')
<DashHeader title={LABELS[props.section]} />
<SubPagePanel when={props.section === 'overview'}>…</SubPagePanel>
<SubPagePanel when={props.section === 'profile'}>…</SubPagePanel>`} stage="muted">
              <p class="m-0 text-sm text-muted-foreground">Old <code>?tab=</code> links redirect through <code>subPageTabs()</code> in AuthenticatedApp.</p>
            </Example>
          </DocSection>
          <DocSection title="TabBar / WorkAreas (legacy)" description="Still on a handful of panels. Don’t add new ones: tabs hide related rows from each other and aren’t linkable.">
            <Example>
              <TabBar tabs={[{ id: 'stock', label: 'Stock' }, { id: 'orders', label: 'Orders', count: () => 12 }, { id: 'returns', label: 'Returns' }]} active={tab()} onChange={setTab} />
            </Example>
            <Guidance
              use={['Nothing new. Migrate a TabBar to sub-pages (separate areas) or DataTable chips (one list, several kinds).']}
              avoid={['Splitting one kind of list by status — use DataTable filter chips.', 'Separate areas of a section — use sub-pages.']}
            />
          </DocSection>
        </>
      )
    },
  },
]

