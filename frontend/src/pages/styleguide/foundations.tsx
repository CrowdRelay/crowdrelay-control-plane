import { For } from 'solid-js'
import {
  Activity, AlertTriangle, Award, Bell, Brain, CalendarDays, Check, ChevronRight, CircleCheck, CloudOff, FileText,
  Inbox, LayoutDashboard, LayoutGrid, MapPin, MapPinned, MoreHorizontal, Plug, Plus, RadioTower, Search, SearchX,
  Send, Settings, SlidersHorizontal, Sparkles, Ticket, TriangleAlert, Users, Waypoints, Workflow, X, Zap,
} from 'lucide-solid'
import type { Component } from 'solid-js'
import type { LucideProps } from 'lucide-solid'
import { cn } from '~/lib/cn'
import { Badge } from '~/components/app/badge'
import { Button } from '~/components/app/button'
import { Card } from '~/components/app/card'
import { Pill, Tile } from '~/components/ui/dash'
import { Callout, DoDont, DocSection, Example, Specimen, SpecimenGrid, Swatch } from './kit'
import type { DocEntry } from './types'

// Swatch classes are written out in full (not built from a name) so Tailwind
// sees them and emits the utilities.
const COLOR_GROUPS: { title: string; note: string; swatches: { name: string; class: string; usage?: string }[] }[] = [
  {
    title: 'Surfaces & text',
    note: 'Every page sits on background with foreground text. Card and popover equal background in both themes today; keep using the right name so a later tint lands everywhere at once.',
    swatches: [
      { name: 'background', class: 'bg-background', usage: 'Page canvas' },
      { name: 'foreground', class: 'bg-foreground', usage: 'Body text, headings' },
      { name: 'card', class: 'bg-card', usage: 'Bordered blocks' },
      { name: 'card-foreground', class: 'bg-card-foreground', usage: 'Text on card' },
      { name: 'popover', class: 'bg-popover', usage: 'Menus, popovers' },
      { name: 'popover-foreground', class: 'bg-popover-foreground', usage: 'Text in overlays' },
    ],
  },
  {
    title: 'Brand & neutrals',
    note: 'Primary is near-black in light and near-white in dark: the console is monochrome and lets status colour carry meaning. Muted is the quiet fill (tiles, hover); muted-foreground is all secondary text.',
    swatches: [
      { name: 'primary', class: 'bg-primary', usage: 'Main button, lit states' },
      { name: 'primary-foreground', class: 'bg-primary-foreground', usage: 'Label on primary' },
      { name: 'secondary', class: 'bg-secondary', usage: 'Secondary button' },
      { name: 'secondary-foreground', class: 'bg-secondary-foreground', usage: 'Label on secondary' },
      { name: 'muted', class: 'bg-muted', usage: 'Tiles, skeletons, chips' },
      { name: 'muted-foreground', class: 'bg-muted-foreground', usage: 'Hints, captions, meta' },
      { name: 'accent', class: 'bg-accent', usage: 'Hover / selected row' },
      { name: 'accent-foreground', class: 'bg-accent-foreground', usage: 'Text on accent' },
    ],
  },
  {
    title: 'Status',
    note: 'Inverted from what the names suggest: the plain name is the pale surface, -foreground is the strong colour. Text, icons, dots and bars use -foreground; tinted pills use -foreground/15.',
    swatches: [
      { name: 'success', class: 'bg-success', usage: 'Good surface' },
      { name: 'success-foreground', class: 'bg-success-foreground', usage: 'Good text / dot' },
      { name: 'warning', class: 'bg-warning', usage: 'Needs-attention surface' },
      { name: 'warning-foreground', class: 'bg-warning-foreground', usage: 'Warn text / dot' },
      { name: 'error', class: 'bg-error', usage: 'Failed surface' },
      { name: 'error-foreground', class: 'bg-error-foreground', usage: 'Bad text / dot' },
      { name: 'info', class: 'bg-info', usage: 'Neutral notice surface' },
      { name: 'info-foreground', class: 'bg-info-foreground', usage: 'Links in rows, accent' },
      { name: 'destructive', class: 'bg-destructive', usage: 'Delete button fill' },
      { name: 'destructive-foreground', class: 'bg-destructive-foreground', usage: 'Label on destructive' },
    ],
  },
  {
    title: 'Lines & focus',
    note: 'Borders separate; they are the main structural device in the console.',
    swatches: [
      { name: 'border', class: 'bg-border', usage: 'Every divider and outline' },
      { name: 'input', class: 'bg-input', usage: 'Control outlines' },
      { name: 'ring', class: 'bg-ring', usage: 'Focus ring' },
    ],
  },
  {
    title: 'Sidebar',
    note: 'The shell sidebar has its own set so it can sit a step off the page in both themes.',
    swatches: [
      { name: 'sidebar', class: 'bg-sidebar', usage: 'Sidebar fill' },
      { name: 'sidebar-foreground', class: 'bg-sidebar-foreground', usage: 'Nav text' },
      { name: 'sidebar-primary', class: 'bg-sidebar-primary', usage: 'Tenant mark' },
      { name: 'sidebar-accent', class: 'bg-sidebar-accent', usage: 'Lit nav row' },
      { name: 'sidebar-border', class: 'bg-sidebar-border', usage: 'Sidebar rules' },
      { name: 'sidebar-ring', class: 'bg-sidebar-ring', usage: 'Sidebar focus' },
    ],
  },
  {
    title: 'Chart series',
    note: 'Categorical series in order. Use status colours, not these, when a series means good / bad.',
    swatches: [
      { name: 'chart-1', class: 'bg-chart-1' },
      { name: 'chart-2', class: 'bg-chart-2' },
      { name: 'chart-3', class: 'bg-chart-3' },
      { name: 'chart-4', class: 'bg-chart-4' },
      { name: 'chart-5', class: 'bg-chart-5' },
    ],
  },
]

const TONES = [
  { tone: 'good', meaning: 'Healthy, done, connected, up', text: 'text-success-foreground', pill: 'bg-success-foreground/15 text-success-foreground', badge: 'success' },
  { tone: 'warn', meaning: 'Needs a look soon, stale, expiring', text: 'text-warning-foreground', pill: 'bg-warning-foreground/15 text-warning-foreground', badge: 'warning' },
  { tone: 'bad', meaning: 'Failed, stopped, blocked, down', text: 'text-error-foreground', pill: 'bg-error-foreground/15 text-error-foreground', badge: 'error' },
  { tone: 'accent', meaning: 'In progress, informational, a link in a row', text: 'text-info-foreground', pill: 'bg-info-foreground/15 text-info-foreground', badge: 'outline' },
  { tone: 'muted', meaning: 'Off, unknown, not reported', text: 'text-muted-foreground', pill: 'bg-muted text-muted-foreground', badge: 'secondary' },
] as const

const TYPE_SCALE = [
  { token: 'text-xs', size: '12 / 16', use: 'Captions, meta, pills, table meta, eyebrows' },
  { token: 'text-sm', size: '14 / 20', use: 'Body text — the console default' },
  { token: 'text-base', size: '16 / 24', use: 'Section headings' },
  { token: 'text-lg', size: '18 / 28', use: 'Lead section, doc headings' },
  { token: 'text-xl', size: '20 / 28', use: 'Page title (DashHeader)' },
  { token: 'text-2xl', size: '24 / 32', use: 'Metric values (Tile, Metric)' },
  { token: 'text-3xl', size: '30 / 36', use: 'Legacy PageHeader only' },
]
const SCALE_CLASS: Record<string, string> = {
  'text-xs': 'text-xs', 'text-sm': 'text-sm', 'text-base': 'text-base', 'text-lg': 'text-lg',
  'text-xl': 'text-xl', 'text-2xl': 'text-2xl', 'text-3xl': 'text-3xl',
}

const SPACING = [
  { token: '1', px: 4, use: 'Icon to label inside a pill' },
  { token: '1.5', px: 6, use: 'Label to control in a Field' },
  { token: '2', px: 8, use: 'Buttons in a group, gap in a toolbar' },
  { token: '2.5', px: 10, use: 'Tiles and cards in a grid (Tiles, Split)' },
  { token: '3', px: 12, use: 'Between blocks inside a card' },
  { token: '4', px: 16, use: 'Card padding (x), page gutter on phones' },
  { token: '5', px: 20, use: 'Between page sections (PageShell space-y-5)' },
  { token: '6', px: 24, use: 'Page gutter from md up, page top padding' },
  { token: '8', px: 32, use: 'Two-column gap in SettingsRow' },
]
const SPACE_W: Record<string, string> = {
  '1': 'w-1', '1.5': 'w-1.5', '2': 'w-2', '2.5': 'w-2.5', '3': 'w-3', '4': 'w-4', '5': 'w-5', '6': 'w-6', '8': 'w-8',
}

const NAV_ICONS: [string, Component<LucideProps>][] = [
  ['overview', LayoutDashboard], ['operations', Activity], ['intelligence', Brain], ['attention', TriangleAlert],
  ['portfolio', LayoutGrid], ['notifiers', Bell], ['area', MapPin], ['places', MapPinned], ['shows', Ticket],
  ['fan-intel', Users], ['content', FileText], ['integrations', Plug], ['automation', Zap], ['flow', Waypoints],
  ['motion', Workflow], ['beacons', RadioTower], ['proof', Award], ['sliders', SlidersHorizontal], ['settings', Settings],
]
const UI_ICONS: [string, Component<LucideProps>, string][] = [
  ['Plus', Plus, 'Add …'], ['Search', Search, 'Search fields'], ['Check', Check, 'Done, selected'],
  ['CircleCheck', CircleCheck, 'All-clear empty state'], ['SearchX', SearchX, 'No search results'],
  ['Inbox', Inbox, 'Empty queue'], ['CloudOff', CloudOff, 'Unreachable / offline'],
  ['AlertTriangle', AlertTriangle, 'Warning'], ['X', X, 'Close, remove'], ['ChevronRight', ChevronRight, 'Next, drill in'],
  ['MoreHorizontal', MoreHorizontal, 'Row menu'], ['Send', Send, 'Send, publish'], ['Sparkles', Sparkles, 'AI-made'],
  ['CalendarDays', CalendarDays, 'Dates, shows'], ['Users', Users, 'Fans, people'],
]

export const foundationEntries: DocEntry[] = [
  {
    id: 'colors', tab: 'foundations', group: 'Foundations', title: 'Colour',
    summary: 'Semantic tokens from styles/tailwind.css. Use the name for the job, never a raw hex or a Tailwind palette colour.',
    sources: ['styles/tailwind.css'], keywords: 'tokens palette theme dark light hex',
    render: () => (
      <>
        <DocSection title="Principles">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li><strong class="text-foreground">Monochrome first.</strong> Structure is black, white and greys. Colour is reserved for state, so a red dot means something.</li>
            <li><strong class="text-foreground">Semantic names only.</strong> <code>text-muted-foreground</code>, not <code>text-zinc-500</code>; <code>bg-success-foreground/15</code>, not <code>bg-green-100</code>. The token ratchet counts hex literals.</li>
            <li><strong class="text-foreground">Both themes, always.</strong> Toggle the theme at the top right; every swatch re-reads its value. If something only looks right in one theme, it is using the wrong token.</li>
            <li><strong class="text-foreground">Contrast is measured.</strong> Every -foreground clears 4.5:1 as 12px text on its own tint and on muted. Do not lighten them.</li>
          </ul>
        </DocSection>
        <For each={COLOR_GROUPS}>{group => (
          <DocSection title={group.title} description={group.note}>
            <SpecimenGrid>
              <For each={group.swatches}>{s => <Swatch name={s.name} class={s.class} usage={s.usage} />}</For>
            </SpecimenGrid>
          </DocSection>
        )}</For>
        <DocSection title="Tone vocabulary" description="Components that show state take a tone, not a colour. The same five words everywhere — Pill, Tile valueTone, StatusBadge, Metric, Bar, Steps, Ring.">
          <div class="overflow-x-auto rounded-lg border border-border">
            <table class="w-full text-left text-sm">
              <thead class="bg-muted/55 text-xs text-muted-foreground">
                <tr><th class="px-4 py-2 font-medium">tone</th><th class="px-4 py-2 font-medium">Means</th><th class="px-4 py-2 font-medium">Text</th><th class="px-4 py-2 font-medium">Pill</th><th class="px-4 py-2 font-medium">Badge</th></tr>
              </thead>
              <tbody>
                <For each={TONES}>{t => (
                  <tr class="border-t border-border">
                    <td class="px-4 py-2.5"><code class="text-xs">{t.tone}</code></td>
                    <td class="px-4 py-2.5 text-xs text-muted-foreground">{t.meaning}</td>
                    <td class={cn('px-4 py-2.5 text-sm', t.text)}>Delivered</td>
                    <td class="px-4 py-2.5"><Pill tone={t.tone}>{t.tone}</Pill></td>
                    <td class="px-4 py-2.5"><Badge variant={t.badge}>{t.badge}</Badge></td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
          <DoDont
            do={{ children: <Pill tone="bad">3 failed</Pill>, caption: 'Use the tone for state, with words that say what happened.' }}
            dont={{ children: <span class="rounded-full bg-chart-1 px-2 py-0.5 text-xs text-background">3 failed</span>, caption: 'Borrow a chart or palette colour to make something stand out.' }}
          />
        </DocSection>
      </>
    ),
  },
  {
    id: 'typography', tab: 'foundations', group: 'Foundations', title: 'Typography',
    summary: 'System font stack, Tailwind’s scale, four weights. Text styles belong to components — use the component, not the class string.',
    history: ['styles/tailwind.css', 'components/layout.tsx', 'components/ui/dash.tsx'],
    keywords: 'font type scale headings weight text',
    render: () => (
      <>
        <DocSection title="Typeface" description="The system UI stack (Tailwind’s font-sans) — no web font to load, native rendering on every OS. Code, IDs and tokens use font-mono. All numbers in tables and metrics are tabular-nums so columns line up.">
          <div class="grid gap-4 md:grid-cols-2">
            <Card class="p-5"><p class="m-0 text-xs text-muted-foreground">font-sans</p><p class="m-0 mt-2 text-2xl font-semibold">Fans who came to Friday’s show</p><p class="m-0 mt-1 text-sm text-muted-foreground">Aa Bb Cc 0123456789</p></Card>
            <Card class="p-5"><p class="m-0 text-xs text-muted-foreground">font-mono · tabular-nums</p><p class="m-0 mt-2 font-mono text-2xl tabular-nums">1,284 · 918 · 71%</p><p class="m-0 mt-1 font-mono text-sm text-muted-foreground">tenant_id=virya</p></Card>
          </div>
        </DocSection>
        <DocSection title="Scale" description="Seven steps in use. text-sm is the body size; most of the console is text-sm and text-xs.">
          <div>
            <For each={TYPE_SCALE}>{t => (
              <Specimen label={`${t.token} · ${t.size}`} note={t.use}>
                {/* Not `cn`: tailwind-merge can read a size as a colour and drop it. */}
                <span class={`${SCALE_CLASS[t.token]} text-foreground`}>Fans who came to Friday’s show</span>
              </Specimen>
            )}</For>
          </div>
        </DocSection>
        <DocSection title="Weights">
          <div>
            <Specimen label="font-normal · 400" note="Body"><span class="text-base font-normal">Three bands share the bill</span></Specimen>
            <Specimen label="font-medium · 500" note="Card titles, labels, metric values"><span class="text-base font-medium">Three bands share the bill</span></Specimen>
            <Specimen label="font-semibold · 600" note="Page and section headings"><span class="text-base font-semibold">Three bands share the bill</span></Specimen>
            <Specimen label="font-bold · 700" note="Rare — count pills, legacy headers"><span class="text-base font-bold">Three bands share the bill</span></Specimen>
          </div>
        </DocSection>
        <DocSection title="Text roles" description="Which component owns each style. If you need one of these, use that component.">
          <div>
            <Specimen label="Page title" note="DashHeader · text-xl semibold"><span class="text-xl font-semibold tracking-tight">Tonight at Hydrozagadka</span></Specimen>
            <Specimen label="Page subtitle" note="DashHeader subtitle · text-xs muted"><span class="text-xs text-muted-foreground">Fri 3 Oct · doors 19:00 · 214 of 300 sold</span></Specimen>
            <Specimen label="Lead section" note="Section lead · text-lg semibold"><span class="text-lg font-semibold">Needs you today</span></Specimen>
            <Specimen label="Section heading" note="Section, SettingsSection · text-base semibold"><span class="text-base font-semibold">Where your fans come from</span></Specimen>
            <Specimen label="Card title" note="dash Card, CardTitle · text-sm medium"><span class="text-sm font-medium">Reply triage</span></Specimen>
            <Specimen label="Body" note="text-sm foreground"><span class="text-sm">Two of the three bands have posted about the show.</span></Specimen>
            <Specimen label="Secondary" note="text-sm muted-foreground, leading-relaxed"><span class="text-sm leading-relaxed text-muted-foreground">Descriptions under a heading, hints beside a field.</span></Specimen>
            <Specimen label="Caption / meta" note="text-xs muted-foreground"><span class="text-xs text-muted-foreground">Updated 14:02 · from the tenant read model</span></Specimen>
            <Specimen label="Eyebrow" note="Eyebrow · text-xs uppercase tracking-wider"><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Growth · last 30 days</span></Specimen>
            <Specimen label="Metric value" note="Tile · text-2xl medium tabular-nums"><span class="text-2xl font-medium tabular-nums">1,284</span></Specimen>
            <Specimen label="Link in a row" note="text-info-foreground, underline on hover"><a href="#foundations/typography" class="text-sm text-info-foreground underline-offset-4 hover:underline">Open the gig page</a></Specimen>
            <Specimen label="Code / ID" note="code · font-mono text-xs"><code class="text-xs text-muted-foreground">req 3f1c9a52-7d0e-4b8e</code></Specimen>
          </div>
        </DocSection>
        <DocSection title="Rules">
          <DoDont
            do={{ children: <span class="text-sm font-medium">Couldn’t load growth trends</span>, caption: 'Sentence case for every heading, button and label.' }}
            dont={{ children: <span class="text-sm font-medium">Couldn’t Load Growth Trends</span>, caption: 'Title Case, or ALL CAPS outside the Eyebrow.' }}
          />
          <DoDont
            do={{ children: <span class="text-2xl font-medium tabular-nums">1,284</span>, caption: 'Format numbers with toLocaleString and tabular figures; a missing value is “—”.' }}
            dont={{ children: <span class="text-2xl font-medium">1284.0</span>, caption: 'Raw numbers, NaN, null or 0 standing in for “not reported”.' }}
          />
        </DocSection>
      </>
    ),
  },
  {
    id: 'spacing', tab: 'foundations', group: 'Foundations', title: 'Spacing',
    summary: 'Tailwind’s 4px scale. No arbitrary [Npx] values outside skeletons — the token ratchet fails the build.',
    history: ['styles/tailwind.css', 'components/layout.tsx', 'components/ui/dash.tsx'],
    keywords: 'gap padding margin rhythm scale grid',
    render: () => (
      <>
        <DocSection title="Scale in use" description="These nine steps cover the console. Reach for the same step for the same job.">
          <div>
            <For each={SPACING}>{s => (
              <Specimen label={`${s.token} · ${s.px}px`} note={s.use}>
                <div class={cn('h-4 rounded-sm bg-info-foreground/60', SPACE_W[s.token])} />
              </Specimen>
            )}</For>
          </div>
        </DocSection>
        <DocSection title="Page rhythm">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Page gutter: <code>px-4</code> on phones, <code>md:px-6</code> from tablet up; <code>py-6 pb-20</code> so the last block clears the chat button. <code>PageShell</code> owns this.</li>
            <li>Sections: <code>space-y-5</code> between PageShell children; each <code>Section</code> after the first has a top rule and <code>pt-6</code>.</li>
            <li>Grids of tiles and cards: <code>gap-2.5</code> (Tiles, Split). Inside a card: <code>gap-3</code>.</li>
            <li>Settings rows: <code>py-5</code>, <code>md:gap-8</code> between label and control.</li>
          </ul>
        </DocSection>
      </>
    ),
  },
  {
    id: 'radius-elevation', tab: 'foundations', group: 'Foundations', title: 'Radius & elevation',
    summary: 'Three radii. Borders separate, shadows float — only overlays cast a shadow.',
    history: ['styles/tailwind.css', 'components/ui/card.tsx', 'components/ui/dialog.tsx'],
    keywords: 'rounded corner shadow border depth',
    render: () => (
      <>
        <DocSection title="Radius" description="--radius is 0.5rem; the others derive from it. Three are in the rules: md for controls, lg for containers, full for pills and avatars.">
          <SpecimenGrid cols="md">
            <For each={[
              ['rounded-md · 6px', 'rounded-md', 'Buttons, inputs, menu items'],
              ['rounded-lg · 8px', 'rounded-lg', 'Cards, tiles, frames, dialogs'],
              ['rounded-full', 'rounded-full', 'Pills, badges, avatars, dots'],
              ['rounded-xl · 12px', 'rounded-xl', 'Drift: dash Card only — fold into lg'],
            ] as const}>{([name, cls, use]) => (
              <div class="flex flex-col gap-2">
                <div class={cn('h-16 border border-input bg-muted', cls)} />
                <code class="text-xs text-foreground">{name}</code>
                <span class="text-xs text-muted-foreground">{use}</span>
              </div>
            )}</For>
          </SpecimenGrid>
        </DocSection>
        <DocSection title="Elevation" description="The console is flat. A block on the page is separated by a 1px border; only things that float above the page — dropdowns, popovers, dialogs, sheets, toasts — get shadow-overlay.">
          <div class="grid gap-6 rounded-lg bg-muted/40 p-6 sm:grid-cols-3">
            <div class="flex flex-col gap-2">
              <div class="h-20 rounded-lg border border-border bg-card" />
              <code class="text-xs">Level 0 · border</code>
              <span class="text-xs text-muted-foreground">Cards, tiles, tables, sections</span>
            </div>
            <div class="flex flex-col gap-2">
              <div class="h-20 rounded-lg bg-popover shadow-overlay" />
              <code class="text-xs">Level 1 · shadow-overlay</code>
              <span class="text-xs text-muted-foreground">Menus, popovers, tooltips, toasts</span>
            </div>
            <div class="flex flex-col gap-2">
              <div class="h-20 rounded-lg bg-popover shadow-lg ring-1 ring-border" />
              <code class="text-xs">Level 2 · modal</code>
              <span class="text-xs text-muted-foreground">Dialog, sheet — over a dimmed page</span>
            </div>
          </div>
          <DoDont
            do={{ children: <div class="h-16 w-40 rounded-lg border border-border bg-card" />, caption: 'A card is a border on the page.' }}
            dont={{ children: <div class="h-16 w-40 rounded-lg bg-card shadow-md" />, caption: 'Give a card, tile or panel a shadow. The ratchet counts shadows outside overlays.' }}
          />
        </DocSection>
      </>
    ),
  },
  {
    id: 'iconography', tab: 'foundations', group: 'Foundations', title: 'Iconography',
    summary: 'Lucide (lucide-solid) only. 16px in controls, 18px in the sidebar, one icon per meaning.',
    sources: ['components/NavIcon.tsx', 'components/SectionIcon.tsx', 'components/ProviderIcon.tsx', 'components/provider-icons.tsx', 'components/chat-icons.tsx'], keywords: 'icons lucide svg',
    render: () => (
      <>
        <DocSection title="Rules">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Import from <code>lucide-solid</code>. No hand-drawn SVGs for UI glyphs; provider logos live in <code>ProviderIcon.tsx</code>.</li>
            <li>Size 16 (<code>size-4</code>) inside buttons and rows — the stock Button sizes its svg children for you. Sidebar uses <code>NavIcon</code> at 18.</li>
            <li>Decorative icons get <code>aria-hidden="true"</code>. An icon-only button needs an <code>aria-label</code>.</li>
            <li>Icons are muted-foreground unless they carry state, then they take the tone colour.</li>
          </ul>
        </DocSection>
        <DocSection title="Navigation icons" description="NavIcon name → glyph. One per destination; the command palette uses the same set.">
          <SpecimenGrid>
            <For each={NAV_ICONS}>{([name, Icon]) => (
              <div class="flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5">
                <Icon class="size-[18px] text-muted-foreground" aria-hidden="true" />
                <code class="truncate text-xs">{name}</code>
              </div>
            )}</For>
          </SpecimenGrid>
        </DocSection>
        <DocSection title="Common UI icons" description="Keep the meaning stable: the same glyph always means the same thing.">
          <SpecimenGrid cols="md">
            <For each={UI_ICONS}>{([name, Icon, use]) => (
              <div class="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
                <Icon class="size-4 shrink-0 text-foreground" aria-hidden="true" />
                <div class="min-w-0"><code class="block truncate text-xs">{name}</code><span class="text-xs text-muted-foreground">{use}</span></div>
              </div>
            )}</For>
          </SpecimenGrid>
        </DocSection>
      </>
    ),
  },
  {
    id: 'motion', tab: 'foundations', group: 'Foundations', title: 'Motion',
    summary: 'Short, functional, and off under prefers-reduced-motion.',
    history: ['styles/tailwind.css'],
    keywords: 'animation transition duration reduced',
    render: () => (
      <DocSection title="Durations">
        <div>
          <Specimen label="transition-colors · 150ms" note="Hover and focus on rows, buttons, links">
            <Button variant="outline">Hover me</Button>
          </Specimen>
          <Specimen label="content-show / hide · 200ms" note="Dialogs, popovers, menus open and close" ><span class="text-sm text-muted-foreground">scale 0.96 → 1, fade</span></Specimen>
          <Specimen label="sidebar · 200ms linear" note="Expand / collapse to the icon rail"><span class="text-sm text-muted-foreground">width transition</span></Specimen>
          <Specimen label="animate-pulse" note="Skeletons only"><div class="h-4 w-48 animate-pulse rounded-md bg-muted" /></Specimen>
          <Specimen label="prefers-reduced-motion" note="styles/tailwind.css cuts every animation to 0.01ms"><span class="text-sm text-muted-foreground">Nothing moves; open / close events still fire.</span></Specimen>
        </div>
        <Callout title="No drag and drop">Pipelines are boards with a button per card. A drop would skip the confirmation a move needs — see Patterns → Status board.</Callout>
      </DocSection>
    ),
  },
  {
    id: 'breakpoints', tab: 'foundations', group: 'Foundations', title: 'Breakpoints',
    summary: 'Tailwind defaults, mobile first. The sidebar becomes a sheet below md.',
    history: ['styles/tailwind.css', 'components/ui/sidebar.tsx'],
    keywords: 'responsive mobile tablet desktop sm md lg xl',
    render: () => (
      <DocSection title="Breakpoints">
        <div>
          <Specimen label="base · < 640px" note="Phone"><span class="text-sm text-muted-foreground">One column. Tiles two-up. Sidebar is a sheet. CommandTrigger folds to an icon.</span></Specimen>
          <Specimen label="sm · 640px" note="Large phone"><span class="text-sm text-muted-foreground">Headers put actions beside the title.</span></Specimen>
          <Specimen label="md · 768px" note="Tablet"><span class="text-sm text-muted-foreground">Sidebar docks. SettingsRow goes two-column. Page gutter 24px.</span></Specimen>
          <Specimen label="lg · 1024px" note="Laptop"><span class="text-sm text-muted-foreground">Tiles four-up, Split goes side by side.</span></Specimen>
          <Specimen label="xl · 1280px" note="Desktop"><span class="text-sm text-muted-foreground">Six-up tiles where asked for.</span></Specimen>
        </div>
        <Callout>Check every page at 375px. No horizontal page scroll — wide tables scroll inside their own frame.</Callout>
      </DocSection>
    ),
  },
  {
    id: 'writing', tab: 'foundations', group: 'Foundations', title: 'Voice & writing',
    summary: 'Plain words for a musician, not a sysadmin. Say what happened and what to do next.',
    history: ['lib/errors.ts', 'lib/format.ts', 'components/alert-guide.ts'],
    keywords: 'copy content tone microcopy errors labels',
    render: () => (
      <>
        <DocSection title="Principles">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li><strong class="text-foreground">Say the words, never the token.</strong> “Awaiting approval”, not <code>AWAITING_APPROVAL</code> — StatusBadge humanizes for you.</li>
            <li><strong class="text-foreground">Buttons are verbs.</strong> “Add show”, “Approve”, “Copy and open” — not “OK”, “Submit”, “Yes”.</li>
            <li><strong class="text-foreground">Errors name what failed.</strong> Title “Couldn’t load …” / “Couldn’t &lt;verb&gt; …”; the error supplies why and what next. Pass the error, not its message.</li>
            <li><strong class="text-foreground">Empty states point forward.</strong> What is missing, and the one action that fills it.</li>
            <li><strong class="text-foreground">Honest absence.</strong> Not reported is “—”, never 0.</li>
          </ul>
        </DocSection>
        <DocSection title="Examples">
          <DoDont
            do={{ children: <Button>Add show</Button>, caption: 'A verb and the thing it acts on.' }}
            dont={{ children: <Button>Submit</Button>, caption: 'A generic verb that makes the reader guess.' }}
          />
          <DoDont
            do={{ children: <Tile label="Unanswered replies" value="—" sub="Inbox not connected" />, caption: '“—” plus the reason when a section did not answer.' }}
            dont={{ children: <Tile label="Unanswered replies" value="0" />, caption: 'A zero that hides a broken connection.' }}
          />
        </DocSection>
        <DocSection title="Reference">
          <Example title="Where the console’s words come from" stage="muted">
            <p class="m-0 text-sm text-muted-foreground">Errors: <code>lib/errors.ts</code> · status words: <code>humanizeToken</code> in <code>lib/format.ts</code> · alert copy: <code>components/alert-guide.ts</code>.</p>
          </Example>
        </DocSection>
      </>
    ),
  },
]
