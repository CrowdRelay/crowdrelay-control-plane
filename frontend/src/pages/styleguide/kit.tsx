import { For, Show, createSignal, onCleanup, onMount, type JSX } from 'solid-js'
import { Check, Copy, X } from 'lucide-solid'
import { cn } from '~/lib/cn'

/**
 * The style guide's own building blocks — how a doc page is laid out, not
 * part of the product. Every component page is built from these so the
 * guide reads the same everywhere: a section per topic, live examples in a
 * bordered frame with their code under them, guidance as "use / avoid"
 * columns, and do / don't pairs drawn with the real components.
 */

/** One topic on a doc page — h2 with a copyable anchor. */
export function DocSection(props: { id?: string; title: string; description?: JSX.Element; children: JSX.Element }) {
  return (
    <section id={props.id} class="scroll-mt-28 border-t border-border pt-8 first:border-t-0 first:pt-0">
      <h2 class="m-0 text-lg font-semibold tracking-tight text-foreground">{props.title}</h2>
      <Show when={props.description}>
        <p class="m-0 mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{props.description}</p>
      </Show>
      <div class="mt-5 flex flex-col gap-6">{props.children}</div>
    </section>
  )
}

/** A smaller heading inside a section — "Variants", "States". */
export function DocSub(props: { title: string; note?: JSX.Element; children: JSX.Element }) {
  return (
    <div class="flex flex-col gap-3">
      <div>
        <h3 class="m-0 text-sm font-semibold text-foreground">{props.title}</h3>
        <Show when={props.note}><p class="m-0 mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{props.note}</p></Show>
      </div>
      {props.children}
    </div>
  )
}

/** Code with a copy button. */
export function CodeBlock(props: { code: string; class?: string }) {
  const [copied, setCopied] = createSignal(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.code.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard blocked — the text is still selectable */ }
  }
  return (
    <div class={cn('group relative', props.class)}>
      <pre class="m-0 overflow-x-auto bg-muted/55 p-4 text-xs leading-relaxed text-foreground"><code>{props.code.trim()}</code></pre>
      <button
        type="button"
        onClick={copy}
        class="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={copied() ? 'Copied' : 'Copy code'}
      >
        <Show when={copied()} fallback={<Copy class="size-3.5" />}><Check class="size-3.5" /></Show>
      </button>
    </div>
  )
}

/**
 * A live specimen: the real component in a bordered frame, its code under
 * it behind "Show code". `stage` picks the frame: `pad` (default), `center`
 * for a lone control, `flush` for full-bleed things like the app shell.
 */
export function Example(props: {
  title?: string
  description?: JSX.Element
  code?: string
  stage?: 'pad' | 'center' | 'flush' | 'muted'
  class?: string
  children: JSX.Element
}) {
  const [showCode, setShowCode] = createSignal(false)
  return (
    <figure class="m-0 flex min-w-0 flex-col gap-2">
      <Show when={props.title || props.description}>
        <figcaption>
          <Show when={props.title}><span class="text-sm font-medium text-foreground">{props.title}</span></Show>
          <Show when={props.description}><p class="m-0 mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">{props.description}</p></Show>
        </figcaption>
      </Show>
      <div class="overflow-hidden rounded-lg border border-border">
        <div class={cn(
          'min-w-0',
          props.stage === 'flush' ? '' : 'p-6',
          props.stage === 'center' && 'flex flex-wrap items-center justify-center gap-3',
          props.stage === 'muted' ? 'bg-muted/40' : 'bg-background',
          props.class,
        )}>
          {props.children}
        </div>
        <Show when={props.code}>
          <div class="border-t border-border">
            <button
              type="button"
              class="flex w-full items-center justify-between px-4 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/55 hover:text-foreground"
              aria-expanded={showCode()}
              onClick={() => setShowCode(v => !v)}
            >
              {showCode() ? 'Hide code' : 'Show code'}
            </button>
            <Show when={showCode()}><CodeBlock code={props.code!} class="border-t border-border" /></Show>
          </div>
        </Show>
      </div>
    </figure>
  )
}

/** Two columns: when to reach for it, when to reach for something else. */
export function Guidance(props: { use: JSX.Element[]; avoid?: JSX.Element[] }) {
  return (
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-lg border border-border p-4">
        <p class="m-0 mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Check class="size-4 text-success-foreground" aria-hidden="true" /> Use it for
        </p>
        <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          <For each={props.use}>{item => <li>{item}</li>}</For>
        </ul>
      </div>
      <Show when={props.avoid?.length}>
        <div class="rounded-lg border border-border p-4">
          <p class="m-0 mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <X class="size-4 text-destructive" aria-hidden="true" /> Use something else for
          </p>
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <For each={props.avoid}>{item => <li>{item}</li>}</For>
          </ul>
        </div>
      </Show>
    </div>
  )
}

/** A do / don't pair, each drawn with the real components. */
export function DoDont(props: {
  do: { children: JSX.Element; caption: JSX.Element }
  dont: { children: JSX.Element; caption: JSX.Element }
}) {
  const cell = (kind: 'do' | 'dont', item: { children: JSX.Element; caption: JSX.Element }) => (
    <figure class="m-0 flex min-w-0 flex-col overflow-hidden rounded-lg border border-border">
      <div class="flex min-h-28 flex-wrap items-center justify-center gap-3 bg-background p-6">{item.children}</div>
      <figcaption class={cn('border-t-2 px-4 py-3 text-sm leading-relaxed', kind === 'do' ? 'border-success-foreground' : 'border-destructive')}>
        <strong class={cn('mr-1.5 font-semibold', kind === 'do' ? 'text-success-foreground' : 'text-destructive')}>{kind === 'do' ? 'Do' : "Don't"}</strong>
        <span class="text-muted-foreground">{item.caption}</span>
      </figcaption>
    </figure>
  )
  return <div class="grid gap-4 md:grid-cols-2">{cell('do', props.do)}{cell('dont', props.dont)}</div>
}

export type PropRow = [name: string, type: string, def: string, description: string]

/** The props a component takes — name, type, default, what it does. */
export function PropTable(props: { rows: PropRow[] }) {
  return (
    <div class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full border-collapse text-left text-sm">
        <thead class="bg-muted/55 text-xs text-muted-foreground">
          <tr>
            <th class="px-4 py-2 font-medium">Prop</th>
            <th class="px-4 py-2 font-medium">Type</th>
            <th class="px-4 py-2 font-medium">Default</th>
            <th class="px-4 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>{([name, type, def, description]) => (
            <tr class="border-t border-border align-top">
              <td class="px-4 py-2.5"><code class="text-xs font-medium text-foreground">{name}</code></td>
              <td class="px-4 py-2.5"><code class="text-xs text-info-foreground">{type}</code></td>
              <td class="px-4 py-2.5"><code class="text-xs text-muted-foreground">{def}</code></td>
              <td class="px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">{description}</td>
            </tr>
          )}</For>
        </tbody>
      </table>
    </div>
  )
}

/** A quiet callout for a rule or a caveat. */
export function Callout(props: { title?: string; tone?: 'info' | 'warn'; children: JSX.Element }) {
  return (
    <div class={cn('rounded-lg border-l-2 bg-muted/40 px-4 py-3 text-sm leading-relaxed', props.tone === 'warn' ? 'border-warning-foreground' : 'border-info-foreground')}>
      <Show when={props.title}><p class="m-0 mb-1 font-medium text-foreground">{props.title}</p></Show>
      <div class="text-muted-foreground [&_code]:text-foreground">{props.children}</div>
    </div>
  )
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/[\d.]+/g)
  if (!m) return rgb
  const [r = 0, g = 0, b = 0, a] = m.map(Number)
  const hex = '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
  return a !== undefined && a < 1 ? `${hex} · ${Math.round(a * 100)}%` : hex
}

/** A colour token — the fill re-reads its value when the theme flips. */
export function Swatch(props: { name: string; class: string; usage?: string }) {
  const [value, setValue] = createSignal('')
  let el!: HTMLDivElement
  const read = () => setValue(rgbToHex(getComputedStyle(el).backgroundColor))
  onMount(() => {
    read()
    const observer = new MutationObserver(() => requestAnimationFrame(read))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-kb-theme', 'class', 'style'] })
    onCleanup(() => observer.disconnect())
  })
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <div ref={el} class={cn('h-14 rounded-md border border-input', props.class)} />
      <code class="truncate text-xs font-medium text-foreground">{props.name}</code>
      <span class="font-mono text-xs text-muted-foreground">{value()}</span>
      <Show when={props.usage}><span class="text-xs leading-snug text-muted-foreground">{props.usage}</span></Show>
    </div>
  )
}

/** A labelled row: token / class on the left, the specimen on the right. */
export function Specimen(props: { label: string; note?: string; children: JSX.Element }) {
  return (
    <div class="grid grid-cols-1 items-baseline gap-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-[16rem_1fr] sm:gap-6">
      <div class="min-w-0">
        <code class="text-xs text-foreground">{props.label}</code>
        <Show when={props.note}><p class="m-0 mt-0.5 text-xs text-muted-foreground">{props.note}</p></Show>
      </div>
      <div class="min-w-0">{props.children}</div>
    </div>
  )
}

/** A responsive grid of small things — swatches, icons, radii. */
export function SpecimenGrid(props: { children: JSX.Element; cols?: 'sm' | 'md' | 'lg' }) {
  return (
    <div class={cn('grid gap-4',
      props.cols === 'lg' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : props.cols === 'md' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
      : 'grid-cols-2 sm:grid-cols-4 xl:grid-cols-6')}>
      {props.children}
    </div>
  )
}
