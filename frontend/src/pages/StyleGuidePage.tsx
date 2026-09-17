import { For, createSignal, onMount, type JSX } from 'solid-js'
import { cn } from '~/lib/cn'
import {
  CommandBlock, DataRow, ErrorCard, Eyebrow, PageHeader, PanelTitle, Section, SectionTitle,
  ShowMore, TabBar,
} from '~/components/layout'
import { StatusBadge } from '~/components/StatusBadge'
import { ModeToggle } from '~/components/ModeToggle'
import { Spinner } from '~/components/Spinner'
import { Sparkline } from '~/components/Sparkline'
import { ProgressRing } from '~/components/ProgressRing'
import { SkeletonBlock, SkeletonRows } from '~/components/Skeleton'
import { Alert } from '~/components/app/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '~/components/app/alert-dialog'
import { AuthorityScale } from '~/components/ui/authority-scale'
import { Badge } from '~/components/app/badge'
import { Button, buttonVariants } from '~/components/app/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/app/card'
import { Checkbox } from '~/components/app/checkbox'
import { CollapsibleSection } from '~/components/app/collapsible'
import { ColorInput } from '~/components/ui/color-input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '~/components/app/dialog'
import { EmptyState } from '~/components/ui/empty-state'
import { Field, FieldGrid, ReadField, Unset } from '~/components/ui/field'
import { Hint } from '~/components/ui/hint'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/app/label'
import { Metric, MetricRow } from '~/components/ui/metric'
import { NativeSelect } from '~/components/ui/native-select'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '~/components/app/popover'
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '~/components/app/radio-group'
import { RangeInput } from '~/components/ui/range-input'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Switch } from '~/components/app/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/app/table'
import { Textarea } from '~/components/ui/textarea'
import { ToastContainer, toast } from '~/components/app/toast'
import { Plus } from 'lucide-solid'

/**
 * Style guide — every token and primitive the console has, on one page.
 *
 * Dev-only: `main.tsx` mounts it at `/styleguide` when `import.meta.env.DEV`
 * is true and the host is localhost, so a production build never includes it.
 * It sits outside the login gate and the router, which is why nothing here
 * may issue a query.
 *
 * Swatch classes are written out in full (not built from a name) so Tailwind
 * sees them and emits the utilities.
 */

const SECTIONS = [
  ['colors', 'Colours'],
  ['typography', 'Typography'],
  ['radius', 'Radius & shadow'],
  ['buttons', 'Buttons'],
  ['badges', 'Badges & status'],
  ['alerts', 'Alerts & feedback'],
  ['cards', 'Cards'],
  ['forms', 'Forms'],
  ['metrics', 'Metrics'],
  ['table', 'Table'],
  ['overlays', 'Overlays'],
  ['layout', 'Layout primitives'],
  ['data-viz', 'Data viz & loading'],
] as const

type Swatch = { name: string; class: string }

const COLOR_GROUPS: { title: string; note?: string; swatches: Swatch[] }[] = [
  {
    title: 'Base',
    swatches: [
      { name: 'background', class: 'bg-background' },
      { name: 'foreground', class: 'bg-foreground' },
      { name: 'card', class: 'bg-card' },
      { name: 'card-foreground', class: 'bg-card-foreground' },
      { name: 'popover', class: 'bg-popover' },
      { name: 'popover-foreground', class: 'bg-popover-foreground' },
    ],
  },
  {
    title: 'Brand & neutrals',
    swatches: [
      { name: 'primary', class: 'bg-primary' },
      { name: 'primary-foreground', class: 'bg-primary-foreground' },
      { name: 'secondary', class: 'bg-secondary' },
      { name: 'secondary-foreground', class: 'bg-secondary-foreground' },
      { name: 'muted', class: 'bg-muted' },
      { name: 'muted-foreground', class: 'bg-muted-foreground' },
      { name: 'accent', class: 'bg-accent' },
      { name: 'accent-foreground', class: 'bg-accent-foreground' },
    ],
  },
  {
    title: 'Status',
    note: 'In this preset the plain name is the pale surface and `-foreground` is the strong colour: text, icons and dots use `-foreground`.',
    swatches: [
      { name: 'destructive', class: 'bg-destructive' },
      { name: 'destructive-foreground', class: 'bg-destructive-foreground' },
      { name: 'info', class: 'bg-info' },
      { name: 'info-foreground', class: 'bg-info-foreground' },
      { name: 'success', class: 'bg-success' },
      { name: 'success-foreground', class: 'bg-success-foreground' },
      { name: 'warning', class: 'bg-warning' },
      { name: 'warning-foreground', class: 'bg-warning-foreground' },
      { name: 'error', class: 'bg-error' },
      { name: 'error-foreground', class: 'bg-error-foreground' },
    ],
  },
  {
    title: 'Lines',
    swatches: [
      { name: 'border', class: 'bg-border' },
      { name: 'input', class: 'bg-input' },
      { name: 'ring', class: 'bg-ring' },
    ],
  },
]

const TYPE_SCALE = [
  { token: 'text-xs', size: '12px', class: 'text-xs' },
  { token: 'text-sm', size: '14px', class: 'text-sm' },
  { token: 'text-base', size: '16px', class: 'text-base' },
  { token: 'text-lg', size: '18px', class: 'text-lg' },
  { token: 'text-xl', size: '20px', class: 'text-xl' },
  { token: 'text-2xl', size: '24px', class: 'text-2xl' },
  { token: 'text-3xl', size: '30px', class: 'text-3xl' },
  { token: 'text-4xl', size: '36px', class: 'text-4xl' },
]

const WEIGHTS = [
  { name: 'Regular 400', class: 'font-normal' },
  { name: 'Medium 500', class: 'font-medium' },
  { name: 'Semibold 600', class: 'font-semibold' },
  { name: 'Bold 700', class: 'font-bold' },
]

const RADII = [
  { name: 'rounded-sm · 4px', class: 'rounded-sm' },
  { name: 'rounded-md · 6px', class: 'rounded-md' },
  { name: 'rounded-lg · 8px (--radius)', class: 'rounded-lg' },
  { name: 'rounded-xl · 12px', class: 'rounded-xl' },
  { name: 'rounded-full', class: 'rounded-full' },
]

const SHADOWS = [
  { name: 'shadow-sm', class: 'shadow-sm' },
  { name: 'shadow-md', class: 'shadow-md' },
  { name: 'shadow-lg', class: 'shadow-lg' },
]

const BUTTON_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'link', 'destructive'] as const
const BUTTON_SIZES = ['sm', 'default', 'lg'] as const
const BADGE_VARIANTS = ['default', 'secondary', 'outline', 'success', 'warning', 'error'] as const

const RUNGS = [
  { value: 'observe', label: 'Only watch', detail: 'Records what it sees and does nothing else.' },
  { value: 'recommend', label: 'Suggest it', detail: 'Proposes the action for you to take.' },
  { value: 'approval', label: 'Ask me first', detail: 'Prepares the action and waits for your approval.' },
  { value: 'bounded', label: 'Do it alone', detail: 'Acts inside the limits you set.' },
] as const

function rgbToHex(rgb: string): string {
  const m = rgb.match(/[\d.]+/g)
  if (!m) return rgb
  const [r = 0, g = 0, b = 0, a] = m.map(Number)
  const hex = '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
  return a !== undefined && a < 1 ? `${hex} · ${Math.round(a * 100)}%` : hex
}

function SwatchTile(props: { name: string; class: string }) {
  const [value, setValue] = createSignal('')
  let el!: HTMLDivElement
  onMount(() => setValue(rgbToHex(getComputedStyle(el).backgroundColor)))
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <div ref={el} class={cn('h-14 rounded-md border border-input', props.class)} />
      <code class="truncate text-xs text-foreground">{props.name}</code>
      <span class="font-mono text-xs text-muted-foreground">{value()}</span>
    </div>
  )
}

function Group(props: { title: string; note?: JSX.Element; children: JSX.Element; class?: string }) {
  return (
    <div class={cn('flex flex-col gap-3', props.class)}>
      <div>
        <PanelTitle as="h3">{props.title}</PanelTitle>
        {props.note && <p class="mt-1 text-xs text-muted-foreground">{props.note}</p>}
      </div>
      {props.children}
    </div>
  )
}

function Specimen(props: { label: string; children: JSX.Element }) {
  return (
    <div class="grid grid-cols-1 items-baseline gap-2 border-b border-border py-3 sm:grid-cols-[14rem_1fr] sm:gap-6">
      <code class="text-xs text-muted-foreground">{props.label}</code>
      <div class="min-w-0">{props.children}</div>
    </div>
  )
}

export default function StyleGuidePage() {
  const [tab, setTab] = createSignal('first')
  const [checked, setChecked] = createSignal(true)
  const [switchOn, setSwitchOn] = createSignal(true)
  const [radio, setRadio] = createSignal('weekly')
  const [rung, setRung] = createSignal<(typeof RUNGS)[number]['value']>('approval')
  const [range, setRange] = createSignal(40)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [alertOpen, setAlertOpen] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)

  return (
    <div class="h-viewport overflow-y-auto bg-background text-foreground">
      <div class="mx-auto flex max-w-7xl gap-8 px-4 md:px-6">
        <nav class="sticky top-0 hidden h-viewport w-48 shrink-0 flex-col gap-1 overflow-y-auto py-6 lg:flex" aria-label="Style guide sections">
          <Eyebrow class="mb-2">Style guide</Eyebrow>
          <For each={SECTIONS}>{([id, label]) => (
            <a href={`#${id}`} class="rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {label}
            </a>
          )}</For>
        </nav>

        <main class="min-w-0 flex-1 space-y-5 py-6 pb-20">
          <PageHeader
            eyebrow="Localhost only"
            title="Style guide"
            description="Every colour token, text style and component in frontend/src. Rendered from the real primitives, so what you see here is what ships."
            actions={<><Badge variant="warning">DEV</Badge><ModeToggle /></>}
          />

          {/* ── Colours ─────────────────────────────────────────── */}
          <Section title="Colours" description="The stock solid-ui init preset. Toggle light / dark at the top — every swatch re-reads its value.">
            <div id="colors" class="flex flex-col gap-8">
              <For each={COLOR_GROUPS}>{group => (
                <Group title={group.title} note={group.note}>
                  <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
                    <For each={group.swatches}>{s => <SwatchTile name={s.name} class={s.class} />}</For>
                  </div>
                </Group>
              )}</For>
            </div>
          </Section>

          {/* ── Typography ──────────────────────────────────────── */}
          <Section title="Typography" description="Tailwind's default scale and system font stack — the preset sets no font of its own.">
            <div id="typography" class="flex flex-col gap-8">
              <Group title="Scale">
                <div>
                  <For each={TYPE_SCALE}>{t => (
                    <Specimen label={`${t.token} · ${t.size}`}>
                      {/* Not `cn`: tailwind-merge reads the custom `text-body` / `text-md`
                          sizes as colours and drops them beside `text-foreground`. */}
                      <span class={`${t.class} text-foreground`}>Fans who came to Friday's show</span>
                    </Specimen>
                  )}</For>
                </div>
              </Group>

              <Group title="Weights">
                <div>
                  <For each={WEIGHTS}>{w => (
                    <Specimen label={w.class}>
                      <span class={cn('text-base', w.class)}>{w.name}</span>
                    </Specimen>
                  )}</For>
                </div>
              </Group>

              <Group title="Text styles in use" note="The components that own each style — use the component, not the class string.">
                <div>
                  <Specimen label="PageHeader · h1 text-3xl bold">
                    <span class="text-3xl font-bold tracking-tight">Tonight at Hydrozagadka</span>
                  </Specimen>
                  <Specimen label="SectionTitle / Section lead · text-lg semibold">
                    <span class="text-lg font-semibold tracking-tight">Where your fans come from</span>
                  </Specimen>
                  <Specimen label="Section · PanelTitle h2 · text-base semibold">
                    <PanelTitle>Needs you today</PanelTitle>
                  </Specimen>
                  <Specimen label="PanelTitle h3 · CardTitle · text-sm semibold">
                    <PanelTitle as="h3">Reply triage</PanelTitle>
                  </Specimen>
                  <Specimen label="Eyebrow · text-xs uppercase tracking-wider">
                    <Eyebrow>Growth · last 30 days</Eyebrow>
                  </Specimen>
                  <Specimen label="Metric value · text-2xl bold tabular-nums">
                    <span class="text-2xl font-bold leading-none tracking-tight tabular-nums">1,284</span>
                  </Specimen>
                  <Specimen label="Body · text-sm text-foreground">
                    <p class="text-sm">Three bands share the bill. Two have posted about it.</p>
                  </Specimen>
                  <Specimen label="Secondary · text-sm text-secondary-foreground">
                    <p class="text-sm text-secondary-foreground">Posted 2 hours ago on Instagram.</p>
                  </Specimen>
                  <Specimen label="Muted · text-sm text-muted-foreground">
                    <p class="text-sm leading-relaxed text-muted-foreground">Descriptions, hints and captions under a heading.</p>
                  </Specimen>
                  <Specimen label="Caption · text-xs text-muted-foreground">
                    <p class="text-xs text-muted-foreground">Updated 14:02 · from the tenant read model</p>
                  </Specimen>
                  <Specimen label="Tones · text-success-foreground / warning-foreground / destructive / info-foreground">
                    <p class="flex flex-wrap gap-4 text-sm">
                      <span class="text-success-foreground">Healthy</span>
                      <span class="text-warning-foreground">Degraded</span>
                      <span class="text-destructive">Failing</span>
                      <span class="text-info-foreground">Info</span>
                    </p>
                  </Specimen>
                  <Specimen label="Link · buttonVariants link">
                    <a href="#typography" class="text-sm text-primary underline-offset-4 hover:underline">Open the gig page</a>
                  </Specimen>
                  <Specimen label="Mono · code / .mono">
                    <code class="text-xs text-secondary-foreground">tenant_id=virya · fan_acquisition_events</code>
                  </Specimen>
                  <Specimen label="Bare h1–h4 (preflight: unstyled)">
                    <div class="flex flex-col gap-1">
                      <h1 class="m-0">Heading 1</h1>
                      <h2 class="m-0">Heading 2</h2>
                      <h3 class="m-0">Heading 3</h3>
                      <h4 class="m-0">Heading 4</h4>
                    </div>
                  </Specimen>
                </div>
              </Group>
            </div>
          </Section>

          {/* ── Radius & shadow ─────────────────────────────────── */}
          <Section title="Radius & shadow" description="--radius is 0.5rem; sm / md / xl are derived from it. Shadows are Tailwind defaults.">
            <div id="radius" class="flex flex-col gap-8">
              <Group title="Radius">
                <div class="grid grid-cols-2 gap-4 sm:grid-cols-5">
                  <For each={RADII}>{r => (
                    <div class="flex flex-col gap-2">
                      <div class={cn('h-16 border border-input bg-muted', r.class)} />
                      <code class="text-xs text-muted-foreground">{r.name}</code>
                    </div>
                  )}</For>
                </div>
              </Group>
              <Group title="Shadow">
                <div class="grid grid-cols-1 gap-6 rounded-lg bg-muted p-6 sm:grid-cols-3">
                  <For each={SHADOWS}>{s => (
                    <div class="flex flex-col gap-2">
                      <div class={cn('h-16 rounded-lg border border-border bg-card', s.class)} />
                      <code class="text-xs text-muted-foreground">{s.name}</code>
                    </div>
                  )}</For>
                </div>
              </Group>
            </div>
          </Section>

          {/* ── Buttons ─────────────────────────────────────────── */}
          <Section title="Button" description="Stock ui/button.tsx, used through app/button.tsx, which adds writes (read-only guard) and maps legacy names: success → default, destructive-ghost → outline, xs → sm.">
            <div id="buttons" class="flex flex-col gap-8">
              <Group title="Variants">
                <div class="flex flex-wrap items-center gap-3">
                  <For each={BUTTON_VARIANTS}>{v => <Button variant={v}>{v}</Button>}</For>
                </div>
              </Group>
              <Group title="Sizes">
                <div class="flex flex-wrap items-center gap-3">
                  <For each={BUTTON_SIZES}>{s => <Button size={s}>size {s}</Button>}</For>
                  <Button size="icon" aria-label="Icon button">
                    <Plus size={16} aria-hidden="true" />
                  </Button>
                </div>
              </Group>
              <Group title="States">
                <div class="flex flex-wrap items-center gap-3">
                  <Button disabled>Disabled</Button>
                  <Button variant="outline" disabled>Disabled outline</Button>
                  <Button disabled><Spinner /> Saving…</Button>
                  <Button variant="outline" class="ring-2 ring-ring ring-offset-2 ring-offset-background">Focus ring</Button>
                </div>
              </Group>
            </div>
          </Section>

          {/* ── Badges ──────────────────────────────────────────── */}
          <Section title="Badges & status" description="Stock ui/badge.tsx via app/badge.tsx (destructive → error, muted → secondary), StatusBadge, Hint.">
            <div id="badges" class="flex flex-col gap-8">
              <Group title="Badge">
                <div class="flex flex-wrap items-center gap-3">
                  <For each={BADGE_VARIANTS}>{v => <Badge variant={v}>{v}</Badge>}</For>
                </div>
              </Group>
              <Group title="StatusBadge">
                <div class="flex flex-wrap items-center gap-3">
                  <StatusBadge status="healthy" tone="good" />
                  <StatusBadge status="degraded" tone="warn" />
                  <StatusBadge status="failing" tone="bad" />
                  <StatusBadge status="unknown" tone="muted" />
                </div>
              </Group>
              <Group title="Hint">
                <div class="flex items-center gap-2 text-sm">
                  Paid providers
                  <Hint label="About paid providers">The router reaches for free models first and only falls back to paid ones when the free tier is exhausted.</Hint>
                </div>
              </Group>
            </div>
          </Section>

          {/* ── Alerts ──────────────────────────────────────────── */}
          <Section title="Alerts & feedback" description="Stock alert has two variants; app/alert.tsx maps destructive → destructive and every other tone → default. Toasts are the stock Kobalte toaster.">
            <div id="alerts" class="flex flex-col gap-8">
              <Group title="Alert tones">
                <div class="grid gap-3 md:grid-cols-2">
                  <Alert tone="info" title="Info">Last-known values; the tenant did not answer in time.</Alert>
                  <Alert tone="success" title="Success">Instagram connected. First sync in a few minutes.</Alert>
                  <Alert tone="warning" title="Warning">Reddit cookie expires in 3 days.</Alert>
                  <Alert tone="destructive" title="Destructive">Outbox delivery failed for 12 messages.</Alert>
                </div>
              </Group>
              <Group title="ErrorCard">
                <ErrorCard>Learning proof is unavailable.</ErrorCard>
              </Group>
              <Group title="EmptyState">
                <Card class="rounded-lg">
                  <EmptyState label="No fans reporting" hint="Connect a source to start aggregating." />
                </Card>
              </Group>
              <Group title="Toast">
                <div class="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => toast.success('Reconciliation finished')}>toast.success</Button>
                  <Button variant="outline" onClick={() => toast.error('Deploy failed')}>toast.error</Button>
                  <Button variant="outline" onClick={() => toast.info('Outbox item re-queued')}>toast.info</Button>
                </div>
              </Group>
            </div>
          </Section>

          {/* ── Cards ───────────────────────────────────────────── */}
          <Section title="Cards" description="Stock ui/card.tsx. app/card.tsx adds flat (top rule only) for panels stacked inside a page.">
            <div id="cards" class="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Default</CardTitle>
                  <CardDescription>Rounded, bordered, shadow-sm.</CardDescription>
                </CardHeader>
                <CardContent class="text-sm">Content</CardContent>
                <CardFooter><Button size="sm" variant="outline">Action</Button></CardFooter>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>With actions</CardTitle>
                  <CardDescription>Header, content and footer parts.</CardDescription>
                </CardHeader>
                <CardContent class="text-sm">Content</CardContent>
                <CardFooter><Button size="sm">Action</Button></CardFooter>
              </Card>
              <div class="flex flex-col">
                <Card flat class="p-4">
                  <PanelTitle as="h3">Flat (first)</PanelTitle>
                  <p class="mt-1 text-sm text-muted-foreground">No rule on the first one.</p>
                </Card>
                <Card flat class="p-4">
                  <PanelTitle as="h3">Flat (stacked)</PanelTitle>
                  <p class="mt-1 text-sm text-muted-foreground">A top rule separates it.</p>
                </Card>
              </div>
            </div>
          </Section>

          {/* ── Forms ───────────────────────────────────────────── */}
          <Section title="Forms" description="Field wraps a control with its label, hint and error. Controls that write take writes.">
            <div id="forms" class="flex flex-col gap-8">
              <Group title="Field + text controls">
                <FieldGrid min="240px">
                  <Field label="Band name" hint="Shown to fans on every page.">
                    <Input placeholder="Virya" />
                  </Field>
                  <Field label="Country code" note="optional" error="Use a two-letter ISO code.">
                    <Input value="POL" />
                  </Field>
                  <Field label="Channel">
                    <NativeSelect>
                      <option>Instagram</option>
                      <option>TikTok</option>
                      <option>Reddit</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Disabled">
                    <Input disabled value="Locked" />
                  </Field>
                  <Field label="Filter (NativeSelect sm)">
                    <NativeSelect size="sm">
                      <option>All tenants</option>
                    </NativeSelect>
                  </Field>
                  <div class="flex flex-col gap-1.5">
                    <Label for="sg-label">Label (standalone)</Label>
                    <Input id="sg-label" placeholder="Associated with for=" />
                  </div>
                </FieldGrid>
                <Field label="Textarea" hint="Resizes vertically.">
                  <Textarea rows={3} placeholder="Write a note for the other bands…" />
                </Field>
              </Group>

              <Group title="Choice controls">
                <div class="grid gap-6 md:grid-cols-3">
                  <div class="flex flex-col gap-3">
                    <Eyebrow>Checkbox</Eyebrow>
                    <Checkbox label="Marketing consent" checked={checked()} onChange={setChecked} />
                    <Checkbox label="Disabled" disabled />
                  </div>
                  <div class="flex flex-col gap-3">
                    <Eyebrow>RadioGroup</Eyebrow>
                    <RadioGroup value={radio()} onChange={setRadio}>
                      <For each={['daily', 'weekly', 'monthly']}>{v => (
                        <RadioGroupItem value={v}>
                          <RadioGroupItemLabel class="capitalize">{v}</RadioGroupItemLabel>
                        </RadioGroupItem>
                      )}</For>
                    </RadioGroup>
                  </div>
                  <div class="flex flex-col gap-3">
                    <Eyebrow>Switch</Eyebrow>
                    <div class="flex items-center gap-3 text-sm">
                      <Switch label="Auto-reply" checked={switchOn()} writes={false} onChange={() => setSwitchOn(v => !v)} />
                      Auto-reply {switchOn() ? 'on' : 'off'}
                    </div>
                    <div class="flex items-center gap-3 text-sm text-muted-foreground">
                      <Switch label="Disabled" checked={false} writes={false} disabled />
                      Disabled
                    </div>
                  </div>
                </div>
              </Group>

              <Group title="AuthorityScale">
                <AuthorityScale label="Outreach — how far it may go" rungs={RUNGS} value={rung()} onChange={setRung} showDetail class="max-w-xl" />
              </Group>

              <Group title="RangeInput & ColorInput">
                <div class="flex flex-wrap items-center gap-6 text-sm">
                  <label class="flex items-center gap-3">
                    <RangeInput min={0} max={100} value={range()} onInput={e => setRange(Number(e.currentTarget.value))} />
                    <span class="tabular-nums text-muted-foreground">{range()}</span>
                  </label>
                  <label class="flex items-center gap-3">
                    <ColorInput value="#6039d6" />
                    <span class="text-muted-foreground">Brand colour</span>
                  </label>
                </div>
              </Group>

              <Group title="ReadField & Unset" note="The display half of a settings form.">
                <FieldGrid>
                  <ReadField label="Band name">Virya</ReadField>
                  <ReadField label="Home city" hint="Used to rank venues.">Warsaw</ReadField>
                  <ReadField label="Spotify"><Unset /></ReadField>
                </FieldGrid>
              </Group>
            </div>
          </Section>

          {/* ── Metrics ─────────────────────────────────────────── */}
          <Section title="Metrics" description="ui/metric.tsx — one hairline-divided rail, not a row of boxes. KpiStrip / KpiCard are aliases.">
            <div id="metrics">
              <MetricRow>
                <Metric label="Active fans" value="1,284" sub="+62 this week" tone="primary" />
                <Metric label="Consented" value="918" sub="71% of active" tone="good" />
                <Metric label="Unanswered replies" value="14" sub="oldest 2 days" tone="warn" />
                <Metric label="Failed sends" value="3" sub="last 24h" tone="bad" />
                <Metric label="Best source" value="—" sub="no acquisition data" />
              </MetricRow>
            </div>
          </Section>

          {/* ── Table ───────────────────────────────────────────── */}
          <Section title="Table" description="ui/table.tsx — sticky header and first column; numeric cells right-align.">
            <div id="table">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead class="text-right">Fans</TableHead>
                      <TableHead class="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={[
                      ['Instagram', 'good', 612, '47.7%'],
                      ['Ticket QR', 'good', 401, '31.2%'],
                      ['TikTok', 'warn', 198, '15.4%'],
                      ['Reddit', 'bad', 73, '5.7%'],
                    ] as const}>{([name, tone, fans, share]) => (
                      <TableRow>
                        <TableCell>{name}</TableCell>
                        <TableCell><StatusBadge status={tone === 'good' ? 'syncing' : tone === 'warn' ? 'stale' : 'expired'} tone={tone} /></TableCell>
                        <TableCell numeric>{fans}</TableCell>
                        <TableCell numeric>{share}</TableCell>
                      </TableRow>
                    )}</For>
                  </TableBody>
                </Table>
              </Card>
            </div>
          </Section>

          {/* ── Overlays ────────────────────────────────────────── */}
          <Section title="Overlays" description="Stock Dialog, AlertDialog and Popover (Kobalte).">
            <div id="overlays" class="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(true)}>Open Dialog</Button>
              <Dialog open={dialogOpen()} onOpenChange={setDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit show</DialogTitle>
                    <DialogDescription>Change what fans see on the gig page.</DialogDescription>
                  </DialogHeader>
                  <Field label="Venue"><Input value="Hydrozagadka" /></Field>
                  <DialogFooter class="gap-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={() => setDialogOpen(false)}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button variant="destructive-ghost" onClick={() => setAlertOpen(true)}>Open AlertDialog</Button>
              <AlertDialog open={alertOpen()} onOpenChange={setAlertOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this show?</AlertDialogTitle>
                    <AlertDialogDescription>Fans who saved it will no longer see it. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter class="gap-2">
                    <AlertDialogCancel class={buttonVariants({ variant: 'outline' })}>Cancel</AlertDialogCancel>
                    <AlertDialogAction class={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Popover>
                <PopoverTrigger class={buttonVariants({ variant: 'outline' })}>Open Popover</PopoverTrigger>
                <PopoverContent>
                  <PopoverHeader>
                    <PopoverTitle>Why this is ranked first</PopoverTitle>
                    <PopoverDescription>Three fans from this city replied in the last week.</PopoverDescription>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </div>
          </Section>

          {/* ── Layout primitives ───────────────────────────────── */}
          <Section title="Layout primitives" description="components/layout.tsx — page structure. Section is the one being used right now.">
            <div id="layout" class="flex flex-col gap-8">
              <Group title="TabBar">
                <div>
                  <TabBar
                    tabs={[
                      { id: 'first', label: 'First tab' },
                      { id: 'second', label: 'With count', count: () => 12 },
                      { id: 'third', label: 'Third tab' },
                    ]}
                    active={tab()}
                    onChange={setTab}
                  />
                  <p class="text-sm text-muted-foreground">Active tab: {tab()}</p>
                </div>
              </Group>

              <Group title="SectionTitle">
                <Card class="p-4">
                  <SectionTitle eyebrow="Audience" title="Where your fans come from" description="Last 30 days" action={<Button size="sm" variant="ghost">View all</Button>} />
                </Card>
              </Group>

              <Group title="Section (lead)" note="One per page — larger heading, primary-tinted rule.">
                <Card class="p-4">
                  <Section title="Needs you today" count={3} lead flush description="Ranked by what it costs to leave." action={<Button size="sm" variant="outline">Clear all</Button>}>
                    <p class="text-sm text-muted-foreground">Body</p>
                  </Section>
                </Card>
              </Group>

              <Group title="CollapsibleSection / CollapsiblePanel">
                <CollapsibleSection eyebrow="Operator" title="Runtime switches" badge="2 off" badgeTone="warn">
                  <p class="text-sm text-muted-foreground">Mounted the first time it opens.</p>
                </CollapsibleSection>
              </Group>

              <Group title="CommandBlock">
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <CommandBlock eyebrow="Aggregate" metric="1,284" label="fans" detail={<span>+62 this week</span>} />
                  <CommandBlock eyebrow="Engage" metric="14" label="replies" tone="active" detail={<span>oldest 2 days</span>} />
                  <CommandBlock eyebrow="Convert" metric="41" label="tickets" tone="good" />
                  <CommandBlock eyebrow="Deliver" metric="3" label="failed" tone="warn" />
                </div>
              </Group>

              <Group title="DataRow & ShowMore">
                <Card class="px-4">
                  <DataRow><span class="text-sm">Auto-reply</span><StatusBadge status="on" tone="good" /></DataRow>
                  <DataRow><span class="text-sm">Weekly digest</span><StatusBadge status="off" tone="muted" /></DataRow>
                  <DataRow last><span class="text-sm">Press room</span><StatusBadge status="stale" tone="warn" /></DataRow>
                  <ShowMore hidden={9} expanded={expanded()} onToggle={() => setExpanded(v => !v)} noun="settings" />
                </Card>
              </Group>

              <Group title="ScrollArea">
                <ScrollArea class="h-32 rounded-lg border border-border">
                  <div class="flex flex-col gap-2 p-3">
                    <For each={Array.from({ length: 12 }, (_, i) => i + 1)}>{i => (
                      <p class="text-sm text-muted-foreground">Row {i}</p>
                    )}</For>
                  </div>
                </ScrollArea>
              </Group>
            </div>
          </Section>

          {/* ── Data viz & loading ──────────────────────────────── */}
          <Section title="Data viz & loading" description="Sparkline, ProgressRing, Spinner and skeletons.">
            <div id="data-viz" class="flex flex-col gap-8">
              <Group title="Sparkline">
                <div class="flex flex-wrap items-end gap-8">
                  <Sparkline data={[3, 7, 4, 8, 6, 11, 9, 14]} width={140} height={36} />
                  <Sparkline data={[12, 10, 11, 8, 9, 6, 7, 5]} width={140} height={36} color="var(--color-destructive)" />
                  <Sparkline data={[4, 5, 5, 7, 8, 8, 10, 12]} width={140} height={36} color="var(--color-success)" />
                </div>
              </Group>
              <Group title="ProgressRing">
                <div class="flex flex-wrap items-center gap-6">
                  <ProgressRing value={86} tone="good" label="Delivery" />
                  <ProgressRing value={54} tone="warn" label="Consent" />
                  <ProgressRing value={18} tone="bad" label="Sync" />
                  <ProgressRing value={40} tone="muted" size={64} />
                </div>
              </Group>
              <Group title="Spinner">
                <div class="flex items-center gap-4 text-sm text-muted-foreground">
                  <Spinner /> <Spinner size={16} /> <Spinner size={24} /> Loading…
                </div>
              </Group>
              <Group title="Skeletons">
                <div class="grid gap-4 md:grid-cols-2">
                  <SkeletonBlock height="96px" />
                  <SkeletonRows count={2} />
                </div>
              </Group>
            </div>
          </Section>
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
