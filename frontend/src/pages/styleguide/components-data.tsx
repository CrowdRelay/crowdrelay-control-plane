import { For, createSignal, type JSX } from 'solid-js'
import { ChevronDown, Plus, Upload } from 'lucide-solid'
import { Button, buttonVariants } from '~/components/app/button'
import { Checkbox } from '~/components/app/checkbox'
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '~/components/app/radio-group'
import { Switch } from '~/components/app/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/app/table'
import { DataTable, type ColumnDef } from '~/components/app/data-table'
import { FormDrawer } from '~/components/app/form-drawer'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '~/components/app/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '~/components/app/alert-dialog'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '~/components/app/popover'
import { toast } from '~/components/app/toast'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { NativeSelect } from '~/components/ui/native-select'
import { RangeInput } from '~/components/ui/range-input'
import { ColorInput } from '~/components/ui/color-input'
import { FileInput } from '~/components/ui/file-input'
import { Field, FieldGrid, ReadField, Unset } from '~/components/ui/field'
import { AuthorityScale } from '~/components/ui/authority-scale'
import { Metric, MetricRow } from '~/components/ui/metric'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Bar, ItemRow, MoreRow, Pill, Ring as DashRing, RowButton, StatRow, Steps, Tile } from '~/components/ui/dash'
import { CommandBlock, DataRow, ShowMore } from '~/components/layout'
import { StatusBadge } from '~/components/StatusBadge'
import { Sparkline } from '~/components/Sparkline'
import { ProgressRing } from '~/components/ProgressRing'
import { FunnelChart } from '~/components/FunnelChart'
import { BarList, Donut, Legend, Ring, StackBar } from '~/components/charts'
import { JourneyCard, JourneySteps } from '~/components/Journey'
import { confirmAction, ConfirmHost } from '~/components/Dialog'
import { Callout, DoDont, DocSection, Example, Guidance, PropTable } from './kit'
import type { DocEntry } from './types'

const RUNGS = [
  { value: 'observe', label: 'Only watch', detail: 'Records what it sees and does nothing else.' },
  { value: 'recommend', label: 'Suggest it', detail: 'Proposes the action for you to take.' },
  { value: 'approval', label: 'Ask me first', detail: 'Prepares the action and waits for your approval.' },
  { value: 'bounded', label: 'Do it alone', detail: 'Acts inside the limits you set.' },
] as const

type ShowRow = { id: string; venue: string; city: string; date: string; sold: number; state: 'on_sale' | 'sold_out' | 'draft' }
const SHOWS: ShowRow[] = [
  { id: '1', venue: 'Hydrozagadka', city: 'Warszawa', date: '2026-10-03', sold: 214, state: 'on_sale' },
  { id: '2', venue: 'Klub Re', city: 'Kraków', date: '2026-10-11', sold: 180, state: 'sold_out' },
  { id: '3', venue: 'B90', city: 'Gdańsk', date: '2026-10-24', sold: 96, state: 'on_sale' },
  { id: '4', venue: 'Klub Wydział', city: 'Wrocław', date: '2026-11-07', sold: 0, state: 'draft' },
  { id: '5', venue: 'Pogłos', city: 'Warszawa', date: '2026-11-21', sold: 41, state: 'on_sale' },
  { id: '6', venue: 'Stary Klasztor', city: 'Wrocław', date: '2026-12-05', sold: 12, state: 'on_sale' },
]
const SEG_FILL = [
  { key: 'ig', label: 'Instagram', value: 612, class: 'bg-chart-1' },
  { key: 'qr', label: 'Ticket QR', value: 401, class: 'bg-chart-2' },
  { key: 'tt', label: 'TikTok', value: 198, class: 'bg-chart-3' },
]
// Written out, not derived: Tailwind only emits classes it can read in source.
const SEG_STROKE = [
  { key: 'ig', label: 'Instagram', value: 612, class: 'stroke-chart-1' },
  { key: 'qr', label: 'Ticket QR', value: 401, class: 'stroke-chart-2' },
  { key: 'tt', label: 'TikTok', value: 198, class: 'stroke-chart-3' },
]
const STATE_TONE = { on_sale: 'good', sold_out: 'muted', draft: 'warn' } as const

const SHOW_COLUMNS: ColumnDef<ShowRow, any>[] = [
  { accessorKey: 'venue', header: 'Venue', cell: info => <span class="font-medium">{info.getValue() as string}</span> },
  { accessorKey: 'city', header: 'City' },
  { accessorKey: 'date', header: 'Date', cell: info => new Date(info.getValue() as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
  { accessorKey: 'sold', header: 'Sold', meta: { numeric: true } },
  { accessorKey: 'state', header: 'Status', cell: info => <StatusBadge status={info.getValue() as string} tone={STATE_TONE[info.getValue() as ShowRow['state']]} /> },
  { id: 'actions', header: '', enableSorting: false, enableHiding: false, cell: () => <Button variant="ghost" size="sm">Open</Button> },
]

/** DataTable with filter chips and counts — the list pattern. */
export function ShowsTable() {
  const [filter, setFilter] = createSignal<'all' | ShowRow['state']>('all')
  const count = (s: ShowRow['state']) => SHOWS.filter(r => r.state === s).length
  const rows = () => (filter() === 'all' ? SHOWS : SHOWS.filter(r => r.state === filter()))
  const chip = (id: 'all' | ShowRow['state'], label: string, n: number) => (
    <Button size="sm" variant={filter() === id ? 'default' : 'outline'} aria-pressed={filter() === id} onClick={() => setFilter(id)}>
      {label} <span class="tabular-nums opacity-70">{n}</span>
    </Button>
  )
  return (
    <DataTable
      data={rows()}
      columns={SHOW_COLUMNS}
      searchText={r => `${r.venue} ${r.city}`}
      searchPlaceholder="Search venues or cities…"
      pageSize={5}
      bordered
      getRowId={r => r.id}
      actions={<Button size="sm"><Plus /> Add show</Button>}
      toolbar={<div class="flex flex-wrap gap-2">{chip('all', 'All', SHOWS.length)}{chip('on_sale', 'On sale', count('on_sale'))}{chip('sold_out', 'Sold out', count('sold_out'))}{chip('draft', 'Draft', count('draft'))}</div>}
    />
  )
}

function Planned(props: { what: JSX.Element; recipe: string; until: JSX.Element }) {
  return (
    <>
      <DocSection title="What it will be"><p class="m-0 max-w-3xl text-sm leading-relaxed text-muted-foreground">{props.what}</p></DocSection>
      <DocSection title="How to add it">
        <Callout title="Build it the same way as the rest">
          Add the stock file with <code>npx solidui-cli@latest add {props.recipe}</code> into <code>components/ui/</code> (never edit it there), wrap behaviour in <code>components/app/</code> if needed, then give it a page here: add an entry with <code>status: 'stable'</code> and its <code>sources</code>, and delete this planned one.
        </Callout>
      </DocSection>
      <DocSection title="Until then"><p class="m-0 max-w-3xl text-sm leading-relaxed text-muted-foreground">{props.until}</p></DocSection>
    </>
  )
}

export const dataEntries: DocEntry[] = [
  // ── Forms ─────────────────────────────────────────────────────────────
  {
    id: 'field', tab: 'components', group: 'Forms', title: 'Field', status: 'stable',
    summary: 'Wraps any control with its label, hint, note and error. Every form control goes in one.',
    sources: ['components/ui/field.tsx', 'components/app/label.tsx', 'components/ui/label.tsx'], keywords: 'form label hint error validation',
    render: () => (
      <>
        <DocSection title="Field">
          <Example code={`<Field label="Band name" hint="Shown to fans on every page.">
  <Input placeholder="Virya" />
</Field>
<Field label="Country code" note="optional" error="Use a two-letter ISO code.">
  <Input value="POL" />
</Field>`}>
            <FieldGrid min="240px">
              <Field label="Band name" hint="Shown to fans on every page."><Input placeholder="Virya" /></Field>
              <Field label="Country code" note="optional" error="Use a two-letter ISO code."><Input value="POL" /></Field>
              <Field label="Disabled"><Input disabled value="Locked" /></Field>
            </FieldGrid>
          </Example>
          <PropTable rows={[
            ['label', 'string', '—', 'Sentence case, no colon.'],
            ['hint', 'JSX.Element', '—', 'What to enter or why it matters. Under the control.'],
            ['note', 'string', '—', '“optional” beside the label. Required is the default; mark the exceptions.'],
            ['error', 'string', '—', 'What is wrong and how to fix it. Replaces the hint.'],
          ]} />
        </DocSection>
        <DocSection title="ReadField & Unset" description="The display half of a form — a value with its label.">
          <Example code={`<ReadField label="Spotify"><Unset /></ReadField>`}>
            <FieldGrid>
              <ReadField label="Band name">Virya</ReadField>
              <ReadField label="Home city" hint="Used to rank venues.">Warszawa</ReadField>
              <ReadField label="Spotify"><Unset /></ReadField>
            </FieldGrid>
          </Example>
        </DocSection>
        <DocSection title="Validation">
          <Callout>Validate on submit with native <code>required</code> / <code>pattern</code> / <code>type</code>, not by disabling the button. Cross-field rules go in FormDrawer’s <code>validate</code>.</Callout>
        </DocSection>
      </>
    ),
  },
  {
    id: 'text-inputs', tab: 'components', group: 'Forms', title: 'Input, Textarea, Select', status: 'stable',
    summary: 'Text and choice-from-a-list controls. Native elements, styled — no raw <input> outside components/ui.',
    sources: ['components/ui/input.tsx', 'components/ui/textarea.tsx', 'components/ui/native-select.tsx', 'components/ui/select.tsx', 'components/ui/text-field.tsx'], keywords: 'input text select dropdown textarea listbox combobox',
    render: () => (
      <>
        <DocSection title="Input">
          <Example code={`<Input type="email" placeholder="booking@band.pl" />`}>
            <FieldGrid min="220px">
              <Field label="Text"><Input placeholder="Live in Warszawa" /></Field>
              <Field label="Email"><Input type="email" placeholder="booking@band.pl" /></Field>
              <Field label="Date and time"><Input type="datetime-local" /></Field>
              <Field label="Number"><Input type="number" value="300" /></Field>
            </FieldGrid>
          </Example>
        </DocSection>
        <DocSection title="Textarea">
          <Example code={`<Textarea rows={3} />`}>
            <Field label="Note for the other bands" hint="Resizes vertically."><Textarea rows={3} placeholder="Load-in is at 17:00…" /></Field>
          </Example>
        </DocSection>
        <DocSection title="Select" description="shadcn's Select on Kobalte: a trigger that reads like an input, a popup the trigger's width, a check on the chosen item, typeahead and full keyboard support. Write it like a native select — option children, value, onChange reading event.currentTarget.value, required — because a real <select> stays underneath for forms and validation. size=&quot;sm&quot; for toolbar filters; <optgroup> becomes a labelled group.">
          <Example code={`<Field label="Channel">
  <NativeSelect value={channel()} onChange={e => setChannel(e.currentTarget.value)}>
    <option value="instagram">Instagram</option>
    …
  </NativeSelect>
</Field>`}>
            <FieldGrid min="220px">
              <Field label="Channel"><NativeSelect><option>Instagram</option><option>TikTok</option><option>Reddit</option></NativeSelect></Field>
              <Field label="Filter (sm)"><NativeSelect size="sm"><option>All tenants</option><option>Active</option><option>Parked</option></NativeSelect></Field>
              <Field label="Grouped"><NativeSelect><option value="" disabled selected>Choose a city…</option><optgroup label="Poland"><option>Warszawa</option><option>Kraków</option></optgroup><optgroup label="Germany"><option>Berlin</option><option>Leipzig</option></optgroup></NativeSelect></Field>
              <Field label="Disabled"><NativeSelect disabled><option>Locked</option></NativeSelect></Field>
            </FieldGrid>
          </Example>
          <p class="m-0 text-sm text-muted-foreground"><code>ui/text-field.tsx</code> (Kobalte TextField) is used only by the stock sidebar’s search slot; forms use Input inside Field.</p>
        </DocSection>
      </>
    ),
  },
  {
    id: 'choice-controls', tab: 'components', group: 'Forms', title: 'Checkbox, Radio, Switch', status: 'stable',
    summary: 'Checkbox for opt-in, RadioGroup for one-of-few, Switch for an instant on / off.',
    sources: ['components/app/checkbox.tsx', 'components/ui/checkbox.tsx', 'components/app/radio-group.tsx', 'components/ui/radio-group.tsx', 'components/app/switch.tsx', 'components/ui/switch.tsx'],
    keywords: 'toggle checkbox radio option boolean',
    render: () => {
      const [checked, setChecked] = createSignal(true)
      const [radio, setRadio] = createSignal('weekly')
      const [on, setOn] = createSignal(true)
      return (
        <>
          <DocSection title="Examples">
            <Example class="grid gap-6 md:grid-cols-3" code={`<Checkbox label="Marketing consent" checked={v()} onChange={setV} />
<RadioGroup value={v()} onChange={setV}><RadioGroupItem value="weekly"><RadioGroupItemLabel>Weekly</RadioGroupItemLabel></RadioGroupItem></RadioGroup>
<Switch label="Auto-reply" checked={on()} onChange={toggle} />`}>
              <div class="flex flex-col gap-3">
                <p class="m-0 text-xs font-medium text-muted-foreground">Checkbox</p>
                <Checkbox label="Marketing consent" checked={checked()} onChange={setChecked} />
                <Checkbox label="Disabled" disabled />
              </div>
              <div class="flex flex-col gap-3">
                <p class="m-0 text-xs font-medium text-muted-foreground">RadioGroup</p>
                <RadioGroup value={radio()} onChange={setRadio}>
                  <For each={['daily', 'weekly', 'monthly']}>{v => <RadioGroupItem value={v}><RadioGroupItemLabel class="capitalize">{v}</RadioGroupItemLabel></RadioGroupItem>}</For>
                </RadioGroup>
              </div>
              <div class="flex flex-col gap-3">
                <p class="m-0 text-xs font-medium text-muted-foreground">Switch</p>
                <div class="flex items-center gap-3 text-sm"><Switch label="Auto-reply" checked={on()} writes={false} onChange={() => setOn(v => !v)} /> Auto-reply {on() ? 'on' : 'off'}</div>
                <div class="flex items-center gap-3 text-sm text-muted-foreground"><Switch label="Disabled" checked={false} writes={false} disabled /> Disabled</div>
              </div>
            </Example>
          </DocSection>
          <DocSection title="Which one">
            <Guidance
              use={[<><strong class="text-foreground">Switch</strong> — takes effect the moment it flips (a runtime switch).</>, <><strong class="text-foreground">Checkbox</strong> — part of a form that is saved with a button.</>, <><strong class="text-foreground">RadioGroup</strong> — 2–5 exclusive options worth seeing at once.</>]}
              avoid={['More than five options — NativeSelect.', 'An ordered scale of autonomy — AuthorityScale.']}
            />
          </DocSection>
        </>
      )
    },
  },
  {
    id: 'authority-scale', tab: 'components', group: 'Forms', title: 'AuthorityScale', status: 'stable',
    summary: 'How far automation may go, as an ordered ladder of rungs.',
    sources: ['components/ui/authority-scale.tsx'], keywords: 'autonomy ladder segmented policy',
    render: () => {
      const [rung, setRung] = createSignal<(typeof RUNGS)[number]['value']>('approval')
      return (
        <DocSection title="Example">
          <Example code={`<AuthorityScale label="Outreach — how far it may go" rungs={RUNGS} value={v()} onChange={setV} showDetail />`}>
            <AuthorityScale label="Outreach — how far it may go" rungs={RUNGS} value={rung()} onChange={setRung} showDetail class="max-w-xl" />
          </Example>
        </DocSection>
      )
    },
  },
  {
    id: 'special-inputs', tab: 'components', group: 'Forms', title: 'Range, Colour, File', status: 'stable',
    summary: 'The less common controls. FileInput is visually hidden inside a label you draw.',
    sources: ['components/ui/range-input.tsx', 'components/ui/color-input.tsx', 'components/ui/file-input.tsx'], keywords: 'slider color upload file',
    render: () => {
      const [range, setRange] = createSignal(40)
      return (
        <DocSection title="Examples">
          <Example class="flex flex-wrap items-center gap-8 text-sm" code={`<RangeInput min={0} max={100} value={v()} onInput={…} />
<ColorInput value="#6039d6" />
<label class={buttonVariants({ variant: 'outline', size: 'sm' })}><Upload /> Upload CSV<FileInput accept=".csv" writes /></label>`}>
            <label class="flex items-center gap-3"><RangeInput min={0} max={100} value={range()} onInput={e => setRange(Number(e.currentTarget.value))} /><span class="tabular-nums text-muted-foreground">{range()}</span></label>
            <label class="flex items-center gap-3"><ColorInput value="#6039d6" /><span class="text-muted-foreground">Brand colour</span></label>
            <label class={buttonVariants({ variant: 'outline', size: 'sm' })}><Upload /> Upload CSV<FileInput accept=".csv" /></label>
          </Example>
        </DocSection>
      )
    },
  },

  // ── Data display ──────────────────────────────────────────────────────
  {
    id: 'data-table', tab: 'components', group: 'Data display', title: 'DataTable', status: 'stable',
    summary: 'The one list: search, filter chips with counts, sortable headers, columns menu, pagination.',
    sources: ['components/app/data-table.tsx'], keywords: 'table list grid sort filter search paginate tanstack',
    render: () => (
      <>
        <DocSection title="Live" description="Search, sort by a header, filter by chip, page through.">
          <Example code={`<DataTable
  data={rows()}
  columns={columns}
  searchText={r => \`\${r.venue} \${r.city}\`}
  toolbar={<FilterChips … />}
  actions={<Button size="sm"><Plus /> Add show</Button>}
  pageSize={10}
/>`}><ShowsTable /></Example>
        </DocSection>
        <DocSection title="Props">
          <PropTable rows={[
            ['data', 'T[]', '—', 'Rows. Map every source to one common row type first.'],
            ['columns', 'ColumnDef<T>[]', '—', 'meta.numeric right-aligns; enableSorting: false on action columns.'],
            ['searchText', '(row) => string', '—', 'What a row is searchable by.'],
            ['toolbar', 'JSX.Element', '—', 'Filter chips, on their own row.'],
            ['actions', 'JSX.Element', '—', 'The add button, at the right of the search.'],
            ['empty', 'JSX.Element', '—', 'Shown instead of the table when there are no rows at all.'],
            ['bordered', 'boolean', 'false', 'Box the table. Off when it already sits in a card.'],
            ['pageSize', 'number', '10', 'Rows per page.'],
          ]} />
        </DocSection>
        <DocSection title="Guidance">
          <Guidance
            use={['Any list of records longer than a handful — shows, fans, contacts, posts.', 'One kind of thing in several states — chips, not tabs.']}
            avoid={['Five or fewer items on a dashboard — ItemRow inside a dash Card.', 'Key / value facts — StatRow.']}
          />
          <Callout tone="warn">Pinned to @tanstack/solid-table 8.21.3. v9’s API is different.</Callout>
        </DocSection>
      </>
    ),
  },
  {
    id: 'table', tab: 'components', group: 'Data display', title: 'Table', status: 'stable',
    summary: 'The bare table DataTable is drawn with — for small fixed tables with no search or paging.',
    sources: ['components/app/table.tsx', 'components/ui/table.tsx'], keywords: 'table rows columns',
    render: () => (
      <DocSection title="Example">
        <Example stage="flush" code={`<Table>
  <TableHeader><TableRow><TableHead>Source</TableHead><TableHead class="text-right">Fans</TableHead></TableRow></TableHeader>
  <TableBody><TableRow><TableCell>Instagram</TableCell><TableCell numeric>612</TableCell></TableRow></TableBody>
</Table>`}>
          <Table>
            <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead class="text-right">Fans</TableHead><TableHead class="text-right">Share</TableHead></TableRow></TableHeader>
            <TableBody>
              <For each={[['Instagram', 'good', 612, '47.7%'], ['Ticket QR', 'good', 401, '31.2%'], ['TikTok', 'warn', 198, '15.4%'], ['Reddit', 'bad', 73, '5.7%']] as const}>{([name, tone, fans, share]) => (
                <TableRow>
                  <TableCell>{name}</TableCell>
                  <TableCell><StatusBadge status={tone === 'good' ? 'syncing' : tone === 'warn' ? 'stale' : 'expired'} tone={tone} /></TableCell>
                  <TableCell numeric>{fans}</TableCell>
                  <TableCell numeric>{share}</TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
        </Example>
      </DocSection>
    ),
  },
  {
    id: 'tile', tab: 'components', group: 'Data display', title: 'Tile', status: 'stable',
    summary: 'One number with its label and one line of context. Lives in Tiles at the top of a page.',
    sources: ['components/ui/dash.tsx', 'components/ui/metric.tsx', 'components/KpiValue.tsx'], keywords: 'kpi metric number stat',
    render: () => (
      <>
        <DocSection title="Example">
          <Example class="grid grid-cols-2 gap-2.5 lg:grid-cols-4" code={`<Tile label="Fans" value="1,284" sub="+62 this week" valueTone="good" />`}>
            <Tile label="Tickets sold" value="214" sub="of 300" />
            <Tile label="Fans" value="1,284" sub="+62 this week" valueTone="good" />
            <Tile label="Unanswered" value="14" sub="oldest 2 days" valueTone="warn" />
            <Tile label="Replies" value={null} sub="Inbox not connected" />
          </Example>
          <PropTable rows={[['label', 'string', '—', 'What is counted.'], ['value', 'JSX | null', '—', 'null renders “—”.'], ['sub', 'JSX.Element', '—', 'Against what: “of 300”, “+62 this week”.'], ['valueTone', 'Tone', '—', 'Only when the number itself is good or bad.']]} />
        </DocSection>
        <DocSection title="Three number rows exist — use Tiles" description="Tiles (31 files) is the dashboard row. Metric / MetricRow (a hairline rail, used through the KpiStrip / KpiCard aliases in 25 files) and CommandBlock (1 file) draw the same thing differently. New pages use Tiles; see Inventory → Consolidate.">
          <Example title="Metric / KpiStrip (legacy look)">
            <MetricRow>
              <Metric label="Active fans" value="1,284" sub="+62 this week" tone="primary" />
              <Metric label="Consented" value="918" sub="71% of active" tone="good" />
              <Metric label="Unanswered" value="14" sub="oldest 2 days" tone="warn" />
              <Metric label="Failed sends" value="3" sub="last 24h" tone="bad" />
            </MetricRow>
          </Example>
          <Example title="CommandBlock (legacy)">
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CommandBlock eyebrow="Aggregate" metric="1,284" label="fans" detail={<span>+62 this week</span>} />
              <CommandBlock eyebrow="Engage" metric="14" label="replies" tone="active" />
              <CommandBlock eyebrow="Convert" metric="41" label="tickets" tone="good" />
              <CommandBlock eyebrow="Deliver" metric="3" label="failed" tone="warn" />
            </div>
          </Example>
        </DocSection>
      </>
    ),
  },
  {
    id: 'rows', tab: 'components', group: 'Data display', title: 'Rows', status: 'stable',
    summary: 'Divided rows inside a dash Card: ItemRow for a work item, StatRow for a fact, MoreRow to end a short list.',
    sources: ['components/ui/dash.tsx'], keywords: 'list item row stat more',
    render: () => {
      const [sel, setSel] = createSignal(0)
      const [expanded, setExpanded] = createSignal(false)
      return (
        <>
          <DocSection title="ItemRow · StatRow · MoreRow">
            <Example code={`<ItemRow pill={{ tone: 'warn', text: 'Today' }} title="Confirm the support act" sub="…" action={<Act>Review</Act>} />
<StatRow label="Doors" value="19:00" />
<MoreRow text="4 more" link={<a href="…">Show all</a>} />`}>
              <div class="grid gap-6 md:grid-cols-2">
                <div>
                  <ItemRow pill={{ tone: 'warn', text: 'Today' }} title="Confirm the support act" sub="Nocny Tramwaj replied yes" action={<Button size="sm" variant="outline">Review</Button>} />
                  <ItemRow pill={{ tone: 'accent', text: 'Draft' }} title="Poster post for Instagram" sub="Ready to approve" action={<Button size="sm" variant="outline">Open</Button>} />
                  <MoreRow text="4 more waiting" link={<a href="#components/rows">Show all</a>} />
                </div>
                <div>
                  <StatRow label="Paid tickets" value={<span class="tabular-nums">214</span>} />
                  <StatRow label="Tracked ticket link" value={<Pill tone="good">done</Pill>} />
                  <StatRow label="Press kit sent" value={<Pill>not yet</Pill>} />
                </div>
              </div>
            </Example>
          </DocSection>
          <DocSection title="RowButton" description="A whole row that selects something, master–detail style.">
            <Example>
              <div class="max-w-sm">
                <For each={['Wave 1 · 24 venues', 'Wave 2 · 18 venues', 'Wave 3 · draft']}>{(label, i) => (
                  <RowButton selected={sel() === i()} onClick={() => setSel(i())}><span class="text-sm">{label}</span></RowButton>
                )}</For>
              </div>
            </Example>
          </DocSection>
          <DocSection title="DataRow & ShowMore (legacy)" description="The older row from layout.tsx; prefer Row / StatRow.">
            <Example>
              <div class="max-w-md">
                <DataRow><span class="text-sm">Auto-reply</span><StatusBadge status="on" tone="good" /></DataRow>
                <DataRow last><span class="text-sm">Weekly digest</span><StatusBadge status="off" tone="muted" /></DataRow>
                <ShowMore hidden={9} expanded={expanded()} onToggle={() => setExpanded(v => !v)} noun="settings" />
              </div>
            </Example>
          </DocSection>
        </>
      )
    },
  },
  {
    id: 'progress', tab: 'components', group: 'Data display', title: 'Steps & Journey', status: 'stable',
    summary: 'Where one thing is in an ordered process: Steps in a card, JourneySteps across a page.',
    sources: ['components/ui/dash.tsx', 'components/Journey.tsx'], keywords: 'stepper progress timeline pipeline stages',
    render: () => (
      <>
        <DocSection title="Steps">
          <Example code={`<Steps steps={[{ label: 'Venue confirmed', state: 'done' }, { label: 'Poster', state: 'due', note: 'by Fri' }]} />`}>
            <Steps steps={[
              { label: 'Venue confirmed', state: 'done' },
              { label: 'Tracked ticket link', state: 'done' },
              { label: 'Poster post', state: 'active', note: 'drafting' },
              { label: 'Press kit to local media', state: 'due', note: 'by Fri' },
              { label: 'Thank-you message', state: 'waiting', note: 'after the show' },
            ]} />
          </Example>
        </DocSection>
        <DocSection title="JourneySteps & JourneyCard">
          <Example code={`<JourneySteps label="Deploy" steps={[{ key, label, status: 'done' | 'current' | 'stuck' | 'pending' | 'skipped', detail }]} />`}>
            <div class="flex flex-col gap-4">
              <JourneySteps label="Deploy progress" steps={[
                { key: 'provision', label: 'Provision', status: 'done', detail: '2h ago' },
                { key: 'migrate', label: 'Migrate', status: 'done' },
                { key: 'start', label: 'Start runtime', status: 'stuck', detail: 'lease expired 10m ago' },
                { key: 'verify', label: 'Verify', status: 'pending' },
              ]} />
              <JourneyCard title="Booking · Klub Re, Kraków" meta="Offer sent 2 days ago" badge={{ label: 'waiting', tone: 'warn' }} action={<Button size="sm" variant="outline">Nudge</Button>} />
            </div>
          </Example>
        </DocSection>
      </>
    ),
  },

  // ── Overlays ──────────────────────────────────────────────────────────
  {
    id: 'form-drawer', tab: 'components', group: 'Overlays', title: 'FormDrawer', status: 'stable',
    summary: 'How every record is added: a right-hand sheet with a real form, validated on submit.',
    sources: ['components/app/form-drawer.tsx', 'components/ui/sheet.tsx'], keywords: 'drawer sheet add create new form side panel',
    render: () => {
      const [open, setOpen] = createSignal(false)
      return (
        <>
          <DocSection title="Live">
            <Example stage="center" code={`<FormDrawer open={open()} onOpenChange={setOpen} title="Add show" submitLabel="Add show" onSubmit={save} pending={m.isPending} error={m.error}>
  <Field label="Title"><Input required /></Field>
</FormDrawer>`}>
              <Button onClick={() => setOpen(true)}><Plus /> Add show</Button>
              <FormDrawer open={open()} onOpenChange={setOpen} title="Add show" description="Specimen only — nothing is saved." submitLabel="Add show"
                onSubmit={() => { setOpen(false); toast.success('Specimen submitted') }}>
                <Field label="Title" hint="As it appears on the poster."><Input required placeholder="Live in Warszawa" autocomplete="off" /></Field>
                <Field label="Starts"><Input required type="datetime-local" /></Field>
                <Field label="Ticket URL" note="optional"><Input type="url" placeholder="https://tickets.example/yourband" /></Field>
              </FormDrawer>
            </Example>
          </DocSection>
          <DocSection title="Props">
            <PropTable rows={[
              ['title', 'string', '—', 'Names the record: “New location”, “Edit contact”.'],
              ['submitLabel', 'string', '—', 'Verb first: “Add contact”, “Save changes”.'],
              ['onSubmit', '() => void', '—', 'Runs after native validation and validate pass.'],
              ['validate', '() => string | undefined', '—', 'Cross-field rules.'],
              ['pending / error / errorTitle', '…', '—', 'Mutation state; error shows an ErrorCard in the drawer.'],
              ['secondaryAction', 'JSX.Element', '—', 'Left of the footer — Back in a wizard.'],
              ['size', "'md' | 'lg' | 'xl'", "'md'", 'lg for side-by-side fields or long text.'],
            ]} />
          </DocSection>
        </>
      )
    },
  },
  {
    id: 'dialog', tab: 'components', group: 'Overlays', title: 'Dialog', status: 'stable',
    summary: 'A centred modal for editing in place or reading detail. Not for adding records.',
    sources: ['components/app/dialog.tsx', 'components/ui/dialog.tsx', 'components/Dialog.tsx'], keywords: 'modal popup window',
    render: () => {
      const [open, setOpen] = createSignal(false)
      return (
        <DocSection title="Live">
          <Example stage="center" code={`<Dialog open={open()} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader><DialogTitle>Edit show</DialogTitle><DialogDescription>…</DialogDescription></DialogHeader>
    …
    <DialogFooter><Button variant="outline">Cancel</Button><Button>Save</Button></DialogFooter>
  </DialogContent>
</Dialog>`}>
            <Button variant="outline" onClick={() => setOpen(true)}>Open dialog</Button>
            <Dialog open={open()} onOpenChange={setOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>Edit show</DialogTitle><DialogDescription>Change what fans see on the gig page.</DialogDescription></DialogHeader>
                <Field label="Venue"><Input value="Hydrozagadka" /></Field>
                <DialogFooter class="gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => setOpen(false)}>Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </Example>
          <p class="m-0 text-sm text-muted-foreground"><code>components/Dialog.tsx</code> is a convenience wrapper (<code>open / onClose / label / footer</code>) over the same parts — fine for read-only detail views.</p>
          <Guidance use={['Editing a few fields of an existing record in place.', 'A read-only detail view.']} avoid={['Adding a record — FormDrawer.', 'Confirming a destructive action — AlertDialog / confirmAction.']} />
        </DocSection>
      )
    },
  },
  {
    id: 'alert-dialog', tab: 'components', group: 'Overlays', title: 'AlertDialog & confirmAction', status: 'stable',
    summary: 'Ask before something that can’t be undone. confirmAction() is the one-line way.',
    sources: ['components/app/alert-dialog.tsx', 'components/ui/alert-dialog.tsx'], keywords: 'confirm confirmation delete are you sure',
    render: () => {
      const [open, setOpen] = createSignal(false)
      return (
        <>
          <DocSection title="confirmAction (preferred)">
            <Example stage="center" code={`if (await confirmAction({ title: 'Delete this show?', body: '…', confirmLabel: 'Delete', destructive: true })) remove()`}>
              <Button variant="outline" onClick={async () => {
                const ok = await confirmAction({ title: 'Delete this show?', body: 'Fans who saved it will no longer see it. This cannot be undone.', confirmLabel: 'Delete show', destructive: true })
                if (ok) toast.success('Specimen: confirmed')
              }}>Delete show…</Button>
              <ConfirmHost />
            </Example>
          </DocSection>
          <DocSection title="AlertDialog (composed)">
            <Example stage="center">
              <Button variant="outline" onClick={() => setOpen(true)}>Open AlertDialog</Button>
              <AlertDialog open={open()} onOpenChange={setOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Remove this operator?</AlertDialogTitle><AlertDialogDescription>They lose access immediately.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter class="gap-2">
                    <AlertDialogCancel class={buttonVariants({ variant: 'outline' })}>Cancel</AlertDialogCancel>
                    <AlertDialogAction class={buttonVariants({ variant: 'destructive' })}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Example>
            <DoDont
              do={{ children: <><Button variant="outline">Cancel</Button><Button variant="destructive">Delete show</Button></>, caption: 'The confirm button repeats the verb and the object.' }}
              dont={{ children: <><Button variant="outline">No</Button><Button>Yes</Button></>, caption: '“Yes / No” — the reader has to reread the question.' }}
            />
          </DocSection>
        </>
      )
    },
  },
  {
    id: 'popover-tooltip', tab: 'components', group: 'Overlays', title: 'Popover & Tooltip', status: 'stable',
    summary: 'Popover explains on click; Tooltip names an icon on hover. Neither holds anything you must read.',
    sources: ['components/app/popover.tsx', 'components/ui/popover.tsx', 'components/ui/tooltip.tsx'], keywords: 'tooltip popover hover explain',
    render: () => (
      <DocSection title="Examples">
        <Example stage="center" code={`<Popover><PopoverTrigger class={buttonVariants({ variant: 'outline' })}>Why first?</PopoverTrigger><PopoverContent>…</PopoverContent></Popover>
<Tooltip><TooltipTrigger as={Button} size="icon" variant="ghost" aria-label="Upload"><Upload /></TooltipTrigger><TooltipContent>Upload</TooltipContent></Tooltip>`}>
          <Popover>
            <PopoverTrigger class={buttonVariants({ variant: 'outline' })}>Why is this first?</PopoverTrigger>
            <PopoverContent><PopoverHeader><PopoverTitle>Ranked first</PopoverTitle><PopoverDescription>Three fans from this city replied in the last week.</PopoverDescription></PopoverHeader></PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger as={Button} size="icon" variant="ghost" aria-label="Upload"><Upload /></TooltipTrigger>
            <TooltipContent>Upload</TooltipContent>
          </Tooltip>
        </Example>
      </DocSection>
    ),
  },
  {
    id: 'dropdown-menu', tab: 'components', group: 'Overlays', title: 'DropdownMenu', status: 'stable',
    summary: 'A list of actions behind a button: row menus, the account menu, the tenant switcher.',
    sources: ['components/ui/dropdown-menu.tsx'], keywords: 'menu more actions overflow kebab',
    render: () => (
      <DocSection title="Example">
        <Example stage="center" code={`<DropdownMenu>
  <DropdownMenuTrigger as={Button} variant="outline">Actions <ChevronDown /></DropdownMenuTrigger>
  <DropdownMenuContent>…<DropdownMenuItem>Duplicate</DropdownMenuItem></DropdownMenuContent>
</DropdownMenu>`}>
          <DropdownMenu>
            <DropdownMenuTrigger as={Button} variant="outline">Actions <ChevronDown /></DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-48">
              <DropdownMenuLabel>Show</DropdownMenuLabel>
              <DropdownMenuItem>Edit<DropdownMenuShortcut>E</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Example>
      </DocSection>
    ),
  },
  {
    id: 'command-palette', tab: 'components', group: 'Overlays', title: 'Command palette', status: 'stable',
    summary: '⌘K — jump to any page or run an action. Opened from the top bar’s CommandTrigger.',
    sources: ['components/ui/command.tsx'], keywords: 'search cmdk command k jump',
    render: () => (
      <DocSection title="About">
        <Example stage="muted"><p class="m-0 text-sm text-muted-foreground">Lives in <code>components/CommandPalette.tsx</code> on top of the stock <code>ui/command.tsx</code> (cmdk-solid). It reads live data, so it isn’t rendered here — press ⌘K in the app. Nav entries come from <code>lib/nav.ts</code>, so a new destination appears automatically.</p></Example>
      </DocSection>
    ),
  },

  // ── Data viz ──────────────────────────────────────────────────────────
  {
    id: 'charts', tab: 'components', group: 'Data viz', title: 'Charts', status: 'stable',
    summary: 'Small, honest charts: share bars, rings, donut, stack bar, bar list, sparkline, funnel.',
    sources: ['components/charts.tsx', 'components/Sparkline.tsx', 'components/ProgressRing.tsx', 'components/FunnelChart.tsx', 'lib/charts.ts'],
    keywords: 'chart graph donut ring bar sparkline funnel visualization',
    render: () => (
      <>
        <DocSection title="Bar (in a card)">
          <Example code={`<Bar label="Instagram" value={612} max={1284} tone="accent" />`}>
            <div class="max-w-md">
              <Bar label="Instagram" value={612} max={1284} />
              <Bar label="Ticket QR" value={401} max={1284} tone="good" />
              <Bar label="TikTok" value={198} max={1284} tone="muted" />
              <Bar label="Reddit" value={null} max={1284} />
            </div>
          </Example>
        </DocSection>
        <DocSection title="BarList">
          <Example><BarList class="max-w-md" rows={[{ label: 'Warszawa', value: 412, class: 'bg-chart-1' }, { label: 'Kraków', value: 268, class: 'bg-chart-2' }, { label: 'Gdańsk', value: 120, class: 'bg-chart-3' }]} /></Example>
        </DocSection>
        <DocSection title="Donut, StackBar, Legend">
          <Example class="flex flex-wrap items-center gap-8">
            <Donut label="Fans by source" segments={SEG_STROKE}><span class="text-lg font-semibold tabular-nums">1,211</span></Donut>
            <div class="flex w-64 flex-col gap-3">
              <StackBar label="Fans by source" segments={SEG_FILL} />
              <Legend segments={SEG_FILL} />
            </div>
          </Example>
        </DocSection>
        <DocSection title="Rings" description="Three ring components exist: charts Ring (large, centred children), dash Ring (56px countdown) and ProgressRing (labelled). Prefer charts Ring for new work.">
          <Example class="flex flex-wrap items-center gap-8">
            <Ring value={0.71} label="Tickets sold"><span class="text-xl font-semibold tabular-nums">71%</span></Ring>
            <DashRing share={0.4} label="4d" tone="warn" title="4 days left" />
            <ProgressRing value={86} tone="good" label="Delivery" />
          </Example>
        </DocSection>
        <DocSection title="Sparkline & Funnel">
          <Example class="flex flex-wrap items-end gap-10">
            <Sparkline data={[3, 7, 4, 8, 6, 11, 9, 14]} width={140} height={36} />
            <Sparkline data={[12, 10, 11, 8, 9, 6, 7, 5]} width={140} height={36} color="var(--color-destructive)" />
            <FunnelChart maxWidth={320} height={180} stages={[{ label: 'Saw a post', value: 4200 }, { label: 'Clicked', value: 860 }, { label: 'Joined list', value: 312 }, { label: 'Bought a ticket', value: 74 }]} />
          </Example>
        </DocSection>
        <DocSection title="Rules">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Every chart has a text label (aria-label) and the numbers beside it — a chart never stands alone.</li>
            <li>Series colours chart-1…5 in order; status colours only when the series means good / bad.</li>
            <li>Null draws an empty track and “—”, never 0 or NaN.</li>
          </ul>
        </DocSection>
      </>
    ),
  },

  // ── Utilities ─────────────────────────────────────────────────────────
  {
    id: 'scroll-area', tab: 'components', group: 'Utilities', title: 'ScrollArea', status: 'stable',
    summary: 'A styled scroll container for a long list inside a fixed-height box.',
    sources: ['components/ui/scroll-area.tsx'], keywords: 'scroll overflow',
    render: () => (
      <DocSection title="Example">
        <Example code={`<ScrollArea class="h-32 rounded-lg border">…</ScrollArea>`}>
          <ScrollArea class="h-32 max-w-sm rounded-lg border border-border">
            <div class="flex flex-col gap-2 p-3"><For each={Array.from({ length: 12 }, (_, i) => i + 1)}>{i => <p class="m-0 text-sm text-muted-foreground">Row {i}</p>}</For></div>
          </ScrollArea>
        </Example>
      </DocSection>
    ),
  },

  // ── Planned ───────────────────────────────────────────────────────────
  {
    id: 'planned-select', tab: 'components', group: 'Planned', title: 'Select / Combobox', status: 'planned',
    summary: 'A searchable picker for long lists (cities, venues, contacts).',
    keywords: 'combobox autocomplete typeahead',
    render: () => <Planned what="A Kobalte Combobox: type to filter, arrow keys to pick, for lists longer than ~15 items where NativeSelect becomes a scroll hunt." recipe="combobox" until="NativeSelect for short lists; an Input with a datalist for long ones." />,
  },
  {
    id: 'planned-date-picker', tab: 'components', group: 'Planned', title: 'Date picker', status: 'planned',
    summary: 'A calendar popover for show dates and ranges.',
    keywords: 'calendar date range',
    render: () => <Planned what="A Kobalte DatePicker in a Popover: one date or a range, week starting Monday, locale-formatted." recipe="date-picker" until={<>Native <code>&lt;Input type="date"&gt;</code> / <code>datetime-local</code> inside a Field.</>} />,
  },
  {
    id: 'planned-progress', tab: 'components', group: 'Planned', title: 'Progress bar', status: 'planned',
    summary: 'A determinate bar for uploads and imports.',
    keywords: 'progress upload import percent',
    render: () => <Planned what="Stock Progress: a track and a fill with a visible percentage, for work the person is waiting on (CSV import, media upload)." recipe="progress" until="Bar from ui/dash for a share; Spinner in the button for an action in flight." />,
  },
  {
    id: 'planned-toggle-group', tab: 'components', group: 'Planned', title: 'Toggle group', status: 'planned',
    summary: 'A segmented control for switching a view (Day / Week / Month).',
    keywords: 'segmented control toggle',
    render: () => <Planned what="Stock ToggleGroup: 2–4 mutually exclusive view options in one bordered strip, used above charts." recipe="toggle-group" until="Outline / default Buttons with aria-pressed, as the DataTable filter chips do." />,
  },
]

