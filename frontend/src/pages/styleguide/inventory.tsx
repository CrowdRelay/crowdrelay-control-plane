import { For, Show, createMemo, createResource, createSignal } from 'solid-js'
import { Button } from '~/components/app/button'
import { DataTable, type ColumnDef } from '~/components/app/data-table'
import { Pill, Tile, Tiles } from '~/components/ui/dash'
import { Skeleton } from '~/components/ui/skeleton'
import { Callout, DocSection } from './kit'
import { loadSourceFiles } from './source-files'
import type { DocEntry } from './types'

/**
 * The inventory is computed, not written: Vite hands the dev server every
 * source file as text, and the import statements are parsed here. A new
 * component file shows up on its own — marked undocumented until an entry
 * lists it in `sources`. Loaded only when the tab opens.
 */

type Layer = 'Stock primitive' | 'Adapter' | 'Shell' | 'Composite' | 'Feature'
type FileRow = {
  path: string            // components/ui/button.tsx
  layer: Layer
  exports: string[]
  importers: string[]     // files that import it
  documentedBy: string[]  // style guide entry ids
}
type Model = {
  files: FileRow[]
  /** module path → export name → importer files */
  named: Map<string, Map<string, Set<string>>>
  /** raw text of every non-guide source, for prop-level counts */
  sources: Map<string, string>
}

const COMPOSITES = new Set([
  'components/layout.tsx', 'components/charts.tsx', 'components/Journey.tsx', 'components/Skeleton.tsx',
  'components/StatusBadge.tsx', 'components/Spinner.tsx', 'components/Sparkline.tsx', 'components/ProgressRing.tsx',
  'components/FunnelChart.tsx', 'components/KpiValue.tsx', 'components/NavIcon.tsx', 'components/SectionIcon.tsx',
  'components/Dialog.tsx', 'components/ModeToggle.tsx', 'components/TenantSwitcher.tsx', 'components/ErrorBoundaryPanel.tsx',
  'components/SectionFailureCard.tsx', 'components/ProviderIcon.tsx', 'components/provider-icons.tsx', 'components/chat-icons.tsx',
])

function layerOf(path: string): Layer {
  if (path.startsWith('components/ui/')) {
    return /\/(dash|settings|field|metric|empty-state|hint|authority-scale|TechnicalDetails|color-input|range-input|file-input|native-select)\.tsx$/.test(path) ? 'Composite' : 'Stock primitive'
  }
  if (path.startsWith('components/app/')) return 'Adapter'
  if (path.startsWith('components/shell/') || path === 'components/Shell.tsx') return 'Shell'
  return COMPOSITES.has(path) ? 'Composite' : 'Feature'
}

// Static imports, re-exports (`export { X } from` — the app/ adapters) and
// lazy `import()`. Group 1 is the import clause, 2 or 3 the specifier.
const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\*|[\w$]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const EXPORT_RE = /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)|export\s*\{([^}]*)\}/g

function resolve(from: string, spec: string, known: Set<string>): string | null {
  let base: string
  if (spec.startsWith('~/')) base = spec.slice(2)
  else if (spec.startsWith('.')) {
    const parts = from.split('/').slice(0, -1)
    for (const seg of spec.split('/')) {
      if (seg === '..') parts.pop()
      else if (seg !== '.') parts.push(seg)
    }
    base = parts.join('/')
  } else return null
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (known.has(candidate)) return candidate
  }
  return null
}

function namesOf(clause: string): string[] {
  const braces = clause.match(/\{([\s\S]*)\}/)
  const names: string[] = []
  if (braces) {
    for (const part of braces[1]!.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim()
      if (name) names.push(name)
    }
  }
  const def = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim()
  if (def && !def.startsWith('*')) names.push('default')
  return names
}

async function buildModel(docs: DocEntry[]): Promise<Model> {
  const sources = await loadSourceFiles()
  const known = new Set(sources.keys())
  const importers = new Map<string, Set<string>>()
  const named = new Map<string, Map<string, Set<string>>>()

  for (const [file, text] of sources) {
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[2] ?? m[3]
      if (!spec) continue
      const target = resolve(file, spec, known)
      if (!target || target === file) continue
      if (!importers.has(target)) importers.set(target, new Set())
      importers.get(target)!.add(file)
      if (m[1]) {
        if (!named.has(target)) named.set(target, new Map())
        const byName = named.get(target)!
        for (const n of namesOf(m[1])) {
          if (!byName.has(n)) byName.set(n, new Set())
          byName.get(n)!.add(file)
        }
      }
    }
  }

  const docBy = new Map<string, string[]>()
  for (const e of docs) for (const s of e.sources ?? []) docBy.set(s, [...(docBy.get(s) ?? []), e.id])

  const files: FileRow[] = [...sources.keys()]
    .filter(p => p.startsWith('components/') && p.endsWith('.tsx'))
    .map(path => {
      const text = sources.get(path)!
      const exports = new Set<string>()
      for (const m of text.matchAll(EXPORT_RE)) {
        if (m[1]) exports.add(m[1])
        else if (m[2]) for (const part of m[2].split(',')) { const n = part.trim().split(/\s+as\s+/).pop()?.trim(); if (n && !n.startsWith('type ')) exports.add(n) }
      }
      return {
        path,
        layer: layerOf(path),
        exports: [...exports],
        importers: [...(importers.get(path) ?? [])].sort(),
        documentedBy: docBy.get(path) ?? [],
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))

  return { files, named, sources }
}

let cache: Promise<Model> | null = null
const loadModel = (docs: DocEntry[]) => (cache ??= buildModel(docs))

type Filter = 'all' | 'undocumented' | 'unused' | Layer

function InventoryTable(props: { docs: DocEntry[] }) {
  const [model] = createResource(() => loadModel(props.docs))
  const [filter, setFilter] = createSignal<Filter>('all')
  const files = () => model()?.files ?? []
  const match = (f: FileRow, by: Filter) =>
    by === 'all' ? true
    : by === 'undocumented' ? f.documentedBy.length === 0 && f.layer !== 'Feature'
    : by === 'unused' ? f.importers.length === 0 && f.path !== 'components/Shell.tsx'
    : f.layer === by
  const rows = createMemo(() => files().filter(f => match(f, filter())))
  const primitives = () => files().filter(f => f.layer !== 'Feature')
  const coverage = () => {
    const p = primitives()
    return p.length ? Math.round((p.filter(f => f.documentedBy.length).length / p.length) * 100) : 0
  }

  const columns: ColumnDef<FileRow, any>[] = [
    { accessorKey: 'path', header: 'File', cell: i => <code class="text-xs">{(i.getValue() as string).replace('components/', '')}</code> },
    { accessorKey: 'layer', header: 'Layer', cell: i => <span class="whitespace-nowrap text-xs text-muted-foreground">{i.getValue() as string}</span> },
    { id: 'exports', header: 'Exports', enableSorting: false, accessorFn: r => r.exports.join(', '), cell: i => <span class="line-clamp-2 max-w-md text-xs text-muted-foreground">{i.getValue() as string || '—'}</span> },
    { id: 'used', header: 'Used in', accessorFn: r => r.importers.length, meta: { numeric: true }, cell: i => (
      <span title={i.row.original.importers.join('\n')} class={i.getValue() === 0 ? 'text-warning-foreground' : ''}>{i.getValue() as number}</span>
    ) },
    { id: 'doc', header: 'Page', accessorFn: r => r.documentedBy.length, cell: i => (
      <Show when={i.row.original.documentedBy.length} fallback={i.row.original.layer === 'Feature' ? <span class="text-xs text-muted-foreground">—</span> : <Pill tone="warn">missing</Pill>}>
        {(() => {
          const id = i.row.original.documentedBy[0]!
          const tab = props.docs.find(d => d.id === id)?.tab ?? 'components'
          return <a class="text-xs text-info-foreground hover:underline" href={`#${tab}/${id}`}>{id}</a>
        })()}
      </Show>
    ) },
  ]

  const chip = (id: Filter, label: string) => (
    <Button size="sm" variant={filter() === id ? 'default' : 'outline'} aria-pressed={filter() === id} onClick={() => setFilter(id)}>
      {label} <span class="tabular-nums opacity-70">{files().filter(f => match(f, id)).length}</span>
    </Button>
  )

  return (
    <Show when={!model.loading} fallback={<div class="flex flex-col gap-2"><Skeleton class="h-20 w-full" /><Skeleton class="h-64 w-full" /></div>}>
      <Tiles>
        <Tile label="Component files" value={files().length} sub={`${files().filter(f => f.layer === 'Feature').length} feature panels`} />
        <Tile label="Primitives & composites" value={primitives().length} sub="ui, app, shell, shared" />
        <Tile label="Documented" value={`${coverage()}%`} sub="of primitives & composites" valueTone={coverage() === 100 ? 'good' : 'warn'} />
        <Tile label="Not imported anywhere" value={files().filter(f => match(f, 'unused')).length} sub="candidates to delete" valueTone={files().some(f => match(f, 'unused')) ? 'warn' : 'good'} />
      </Tiles>
      <DataTable
        data={rows()}
        columns={columns}
        searchText={r => `${r.path} ${r.exports.join(' ')}`}
        searchPlaceholder="Search files or exports…"
        pageSize={25}
        bordered
        getRowId={r => r.path}
        initialSorting={[{ id: 'path', desc: false }]}
        toolbar={<div class="flex flex-wrap gap-2">
          {chip('all', 'All')}{chip('undocumented', 'No page')}{chip('unused', 'Unused')}
          {chip('Stock primitive', 'Stock')}{chip('Adapter', 'Adapters')}{chip('Composite', 'Composites')}{chip('Shell', 'Shell')}{chip('Feature', 'Features')}
        </div>}
      />
    </Show>
  )
}

type Candidate = { module: string; name: string; label?: string; keep?: boolean }
type Group = { title: string; why: string; action: string; items: Candidate[] }

const GROUPS: Group[] = [
  {
    title: 'Number rows', why: 'Three components draw “a row of numbers”, each with its own look.',
    action: 'Keep Tiles / Tile. Point KpiStrip / KpiCard at Tile, then retire Metric and CommandBlock.',
    items: [
      { module: 'components/ui/dash.tsx', name: 'Tiles', keep: true }, { module: 'components/ui/dash.tsx', name: 'Tile', keep: true },
      { module: 'components/layout.tsx', name: 'KpiStrip' }, { module: 'components/layout.tsx', name: 'KpiCard' },
      { module: 'components/ui/metric.tsx', name: 'MetricRow' }, { module: 'components/ui/metric.tsx', name: 'Metric' },
      { module: 'components/layout.tsx', name: 'CommandBlock' }, { module: 'components/KpiValue.tsx', name: 'KpiValue' },
    ],
  },
  {
    title: 'Tabs inside pages', why: 'Sub-pages replaced in-page tabs, but two tab systems remain.',
    action: 'Separate areas → sub-pages; one list in several states → DataTable chips.',
    items: [
      { module: 'components/ui/dash.tsx', name: 'SubPagePanel', keep: true },
      { module: 'components/layout.tsx', name: 'TabBar' }, { module: 'components/layout.tsx', name: 'useTabPanels' },
      { module: 'components/ui/dash.tsx', name: 'WorkAreas' }, { module: 'components/ui/dash.tsx', name: 'useWorkAreas' },
    ],
  },
  {
    title: 'Cards', why: 'Four bordered-block components with different padding and radius (dash Card is rounded-xl, the others rounded-lg).',
    action: 'Dash Card for dashboard blocks, stock Card for standalone panels and forms. Fold Widget and SectionPanel into those; align dash Card to rounded-lg.',
    items: [
      { module: 'components/ui/dash.tsx', name: 'Card', label: 'Card (dash)', keep: true },
      { module: 'components/app/card.tsx', name: 'Card', label: 'Card (app)', keep: true },
      { module: 'components/charts.tsx', name: 'Widget' }, { module: 'components/layout.tsx', name: 'SectionPanel' },
      { module: 'components/layout.tsx', name: 'CollapsiblePanel' },
    ],
  },
  {
    title: 'Rings', why: 'Three ring charts with different sizes and APIs.',
    action: 'Keep charts Ring; give it a small size and a tone, then retire dash Ring and ProgressRing.',
    items: [
      { module: 'components/charts.tsx', name: 'Ring', label: 'Ring (charts)', keep: true },
      { module: 'components/ui/dash.tsx', name: 'Ring', label: 'Ring (dash)' },
      { module: 'components/ProgressRing.tsx', name: 'ProgressRing' },
    ],
  },
  {
    title: 'Rows', why: 'layout.tsx’s DataRow predates the dash rows.',
    action: 'Use Row / ItemRow / StatRow; migrate DataRow and ShowMore (→ MoreRow).',
    items: [
      { module: 'components/ui/dash.tsx', name: 'ItemRow', keep: true }, { module: 'components/ui/dash.tsx', name: 'StatRow', keep: true },
      { module: 'components/ui/dash.tsx', name: 'Row', keep: true },
      { module: 'components/layout.tsx', name: 'DataRow' }, { module: 'components/layout.tsx', name: 'ShowMore' },
    ],
  },
  {
    title: 'Empty states', why: 'The stock shadcn Empty arrived beside the console’s EmptyState.',
    action: 'Use EmptyState; migrate the one Empty caller.',
    items: [
      { module: 'components/ui/empty-state.tsx', name: 'EmptyState', keep: true },
      { module: 'components/ui/empty.tsx', name: 'Empty' },
    ],
  },
]

const LEGACY_PROPS = [
  { label: 'variant="success"', re: /variant=["']success["']/g, fix: '→ default' },
  { label: 'variant="destructive-ghost"', re: /variant=["']destructive-ghost["']/g, fix: '→ outline' },
  { label: 'size="xs"', re: /size=["']xs["']/g, fix: '→ sm' },
  { label: 'shadow-* outside overlays', re: /\bshadow-(?:sm|md|lg|xl)\b/g, fix: 'borders separate' },
  { label: 'rounded-xl', re: /\brounded-xl\b/g, fix: '→ rounded-lg' },
]

function Consolidate(props: { docs: DocEntry[] }) {
  const [model] = createResource(() => loadModel(props.docs))
  const uses = (c: Candidate) => model()?.named.get(c.module)?.get(c.name)?.size ?? 0
  const propCount = (re: RegExp) => {
    let files = 0, hits = 0
    for (const [path, text] of model()?.sources ?? []) {
      if (path.startsWith('components/ui/')) continue
      const n = text.match(re)?.length ?? 0
      if (n) { files++; hits += n }
    }
    return { files, hits }
  }
  return (
    <Show when={!model.loading} fallback={<Skeleton class="h-64 w-full" />}>
      <div class="flex flex-col gap-4">
        <For each={GROUPS}>{g => (
          <section class="rounded-lg border border-border p-4">
            <h3 class="m-0 text-sm font-semibold">{g.title}</h3>
            <p class="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">{g.why}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <For each={g.items}>{c => (
                <span class="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
                  <code>{c.label ?? c.name}</code>
                  <span class="tabular-nums text-muted-foreground">{uses(c)} files</span>
                  <Pill tone={c.keep ? 'good' : 'warn'}>{c.keep ? 'keep' : 'retire'}</Pill>
                </span>
              )}</For>
            </div>
            <p class="m-0 mt-3 text-xs leading-relaxed"><strong class="font-medium">Do: </strong><span class="text-muted-foreground">{g.action}</span></p>
          </section>
        )}</For>
        <section class="rounded-lg border border-border p-4">
          <h3 class="m-0 text-sm font-semibold">Legacy props and drift</h3>
          <p class="m-0 mt-1 text-xs text-muted-foreground">Counted across src outside components/ui.</p>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="text-muted-foreground"><tr><th class="py-1.5 pr-4 font-medium">Pattern</th><th class="py-1.5 pr-4 text-right font-medium">Files</th><th class="py-1.5 pr-4 text-right font-medium">Uses</th><th class="py-1.5 font-medium">Fix</th></tr></thead>
              <tbody>
                <For each={LEGACY_PROPS}>{p => {
                  const c = propCount(p.re)
                  return <tr class="border-t border-border"><td class="py-1.5 pr-4"><code>{p.label}</code></td><td class="py-1.5 pr-4 text-right tabular-nums">{c.files}</td><td class="py-1.5 pr-4 text-right tabular-nums">{c.hits}</td><td class="py-1.5 text-muted-foreground">{p.fix}</td></tr>
                }}</For>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Show>
  )
}

export function inventoryEntries(docs: () => DocEntry[]): DocEntry[] {
  return [
    {
      id: 'all-components', tab: 'inventory', group: 'Inventory', title: 'All components',
      summary: 'Every .tsx file under components/, read from source: what it exports, how many files import it, and whether it has a page here.',
    history: ['pages/styleguide/inventory.tsx'],
      keywords: 'inventory audit usage coverage files',
      render: () => (
        <>
          <DocSection title="Files">
            <InventoryTable docs={docs()} />
          </DocSection>
          <DocSection title="How it is counted">
            <Callout>Imports are parsed from every file in <code>src</code> except this guide. Feature panels don’t need a page — they are compositions of documented parts. Everything else should be 100% documented; <code>scripts/test_styleguide_coverage.py</code> enforces it for ui/, app/ and shell/.</Callout>
          </DocSection>
        </>
      ),
    },
    {
      id: 'consolidate', tab: 'inventory', group: 'Inventory', title: 'Consolidate',
      summary: 'Where two or more components do the same job, with live usage counts and which one to keep.',
    history: ['pages/styleguide/inventory.tsx'],
      keywords: 'duplicates variants cleanup migrate legacy consistency',
      render: () => (
        <DocSection title="Overlaps" description="The fastest way to fewer variants: pick the keeper in each group, migrate the retiring ones, delete them. Counts update as you migrate.">
          <Consolidate docs={docs()} />
        </DocSection>
      ),
    },
  ]
}
