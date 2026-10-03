import { For, Show, createSignal } from 'solid-js'
import { CircleCheck, Inbox, Plus } from 'lucide-solid'
import { Button } from '~/components/app/button'
import { Card as AppCard } from '~/components/app/card'
import { FormDrawer } from '~/components/app/form-drawer'
import { toast } from '~/components/app/toast'
import { Card, ItemRow, Pill, Tile, Tiles } from '~/components/ui/dash'
import { EmptyState } from '~/components/ui/empty-state'
import { Field } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { NativeSelect } from '~/components/ui/native-select'
import { Skeleton } from '~/components/ui/skeleton'
import { ErrorCard } from '~/components/layout'
import { ApiError } from '~/lib/api'
import { cn } from '~/lib/cn'
import { ShowsTable } from './components-data'
import { Callout, DoDont, DocSection, Example, Guidance } from './kit'
import type { DocEntry } from './types'

type BoardCard = { id: string; title: string; sub: string; column: 'review' | 'auto' | 'manual' }

function StatusBoard() {
  const [cards, setCards] = createSignal<BoardCard[]>([
    { id: 'a', title: 'Poster post · Instagram', sub: 'Drafted 2h ago', column: 'review' },
    { id: 'b', title: 'Setlist reveal · TikTok', sub: 'Drafted today', column: 'review' },
    { id: 'c', title: 'Countdown · Instagram story', sub: 'Posts Fri 10:00', column: 'auto' },
    { id: 'd', title: 'Thank-you · Facebook group', sub: 'Copy, then post by hand', column: 'manual' },
  ])
  const move = (id: string, column: BoardCard['column'] | null, msg: string) => {
    setCards(cs => (column ? cs.map(c => (c.id === id ? { ...c, column } : c)) : cs.filter(c => c.id !== id)))
    toast.success(msg)
  }
  const COLUMNS = [
    { id: 'review', title: 'Needs your yes', tone: 'warn' },
    { id: 'auto', title: 'Posting automatically', tone: 'accent' },
    { id: 'manual', title: 'Post by hand', tone: 'muted' },
  ] as const
  return (
    <div class="grid gap-3 lg:grid-cols-3">
      <For each={COLUMNS}>{col => (
        <section class="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <h3 class="m-0 flex items-center justify-between text-sm font-medium">{col.title}<Pill tone={col.tone}>{cards().filter(c => c.column === col.id).length}</Pill></h3>
          <For each={cards().filter(c => c.column === col.id)} fallback={<p class="m-0 py-4 text-center text-xs text-muted-foreground">Nothing here</p>}>{card => (
            <article class="rounded-lg border border-border bg-card p-3 transition-colors focus-within:border-foreground/30 hover:border-foreground/30">
              <p class="m-0 text-sm font-medium">{card.title}</p>
              <p class="m-0 mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
              <div class="mt-2.5 flex gap-2">
                <Show when={card.column === 'review'}>
                  <Button size="sm" onClick={() => move(card.id, 'auto', 'Approved — it will post on schedule')}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => move(card.id, null, 'Rejected')}>Reject</Button>
                </Show>
                <Show when={card.column === 'auto'}><Button size="sm" variant="outline" onClick={() => move(card.id, 'review', 'Paused for review')}>Pause</Button></Show>
                <Show when={card.column === 'manual'}><Button size="sm" variant="outline" onClick={() => move(card.id, null, 'Marked as posted')}>I posted it</Button></Show>
              </div>
            </article>
          )}</For>
        </section>
      )}</For>
    </div>
  )
}

function AddFlowDemo() {
  const [open, setOpen] = createSignal(false)
  const [contacts, setContacts] = createSignal(['Klub Re — booking@klubre.pl'])
  let nameRef!: HTMLInputElement
  let emailRef!: HTMLInputElement
  return (
    <Card title="Promoters" aside={`${contacts().length} saved`}>
      <div class="flex justify-end pb-2"><Button size="sm" onClick={() => setOpen(true)}><Plus /> Add promoter</Button></div>
      <For each={contacts()}>{c => <ItemRow title={c} />}</For>
      <FormDrawer open={open()} onOpenChange={setOpen} title="Add promoter" description="Who books shows at a venue." submitLabel="Add promoter"
        onSubmit={() => { setContacts(cs => [...cs, `${nameRef.value} — ${emailRef.value}`]); setOpen(false); toast.success('Promoter added') }}>
        <Field label="Venue or name"><Input ref={nameRef} required placeholder="Pogłos" /></Field>
        <Field label="Email"><Input ref={emailRef} required type="email" placeholder="booking@poglos.pl" /></Field>
        <Field label="City" note="optional"><NativeSelect><option>Warszawa</option><option>Kraków</option></NativeSelect></Field>
      </FormDrawer>
    </Card>
  )
}

export const overviewEntries: DocEntry[] = [
  {
    id: 'introduction', tab: 'overview', group: 'Start here', title: 'CrowdRelay design system',
    summary: 'One place to see every token, layout, component and pattern the console is built from — rendered by the real code.',
    history: ['pages/styleguide/StyleGuidePage.tsx', 'pages/styleguide/kit.tsx'],
    keywords: 'intro principles about how to use',
    render: () => (
      <>
        <DocSection title="What this is" description="A living style guide: every specimen on these pages is the production component, imported from frontend/src. If it looks wrong here, it looks wrong in the app. It runs only on the dev server at localhost/styleguide — a production build drops it.">
          <div class="grid gap-3 md:grid-cols-3">
            <For each={[
              ['Foundations', 'Colour, type, spacing, radius, elevation, icons, motion, breakpoints, writing.', '#foundations/colors'],
              ['Layout', 'The app shell, sidebar, top bar, page container, headers, grids, settings layout.', '#layout/app-shell'],
              ['Components', 'Every primitive with variants, states, props and do / don’t.', '#components/button'],
              ['Patterns', 'How components combine for a job: adding, lists, boards, states.', '#patterns/add-flow'],
              ['Inventory', 'Every component file in src, how often it is used, and whether it has a page.', '#inventory/all-components'],
            ] as const}>{([title, text, href]) => (
              <a href={href} class="group rounded-lg border border-border p-4 transition-colors hover:bg-muted/40">
                <p class="m-0 text-sm font-medium group-hover:underline">{title}</p>
                <p class="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
              </a>
            )}</For>
          </div>
        </DocSection>
        <DocSection title="Principles">
          <ol class="m-0 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li><strong class="text-foreground">One way to do each thing.</strong> One button, one list (DataTable), one add flow (FormDrawer), one settings layout. When two components do the same job, one is marked legacy.</li>
            <li><strong class="text-foreground">Borders separate, shadows float.</strong> Flat pages; only overlays cast a shadow.</li>
            <li><strong class="text-foreground">Colour means state.</strong> Monochrome structure; the five tones carry meaning.</li>
            <li><strong class="text-foreground">Plain words, honest numbers.</strong> Say what happened; “—” when not reported.</li>
            <li><strong class="text-foreground">Stock first.</strong> shadcn / solid-ui files in <code>components/ui/</code> stay as the CLI wrote them; behaviour goes in <code>components/app/</code>.</li>
          </ol>
        </DocSection>
        <DocSection title="Status labels">
          <div class="grid gap-3 md:grid-cols-3">
            <div class="rounded-lg border border-border p-4"><Pill tone="good">Stable</Pill><p class="m-0 mt-2 text-xs leading-relaxed text-muted-foreground">Use it. This is the one.</p></div>
            <div class="rounded-lg border border-border p-4"><Pill tone="warn">Legacy</Pill><p class="m-0 mt-2 text-xs leading-relaxed text-muted-foreground">Still rendered somewhere; don’t use in new code. The page names its replacement.</p></div>
            <div class="rounded-lg border border-border p-4"><Pill tone="accent">Planned</Pill><p class="m-0 mt-2 text-xs leading-relaxed text-muted-foreground">Not built yet. The page says what it will be and how to add it.</p></div>
          </div>
        </DocSection>
      </>
    ),
  },
  {
    id: 'contributing', tab: 'overview', group: 'Start here', title: 'Adding a component',
    summary: 'Every new component gets a page here in the same change. A check fails the build when one is missing.',
    history: ['pages/styleguide/types.ts', 'pages/styleguide/kit.tsx'],
    keywords: 'contribute governance new component process checklist',
    render: () => (
      <>
        <DocSection title="Before you build">
          <ol class="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Search this guide (top bar). If something does the job, use it — even if it is 90% right, extend it rather than fork it.</li>
            <li>If shadcn / solid-ui has it, add the stock file: <code>npx solidui-cli@latest add &lt;name&gt;</code>. Don’t edit files in <code>components/ui/</code>.</li>
            <li>Need different behaviour or a legacy API? Wrap it in <code>components/app/</code>.</li>
            <li>A console-specific composite (built from primitives) goes in <code>components/ui/</code> as its own file, like <code>dash.tsx</code> or <code>settings.tsx</code>.</li>
          </ol>
        </DocSection>
        <DocSection title="Document it">
          <Example code={`// pages/styleguide/components-core.tsx (or -data.tsx) — add an entry
{
  id: 'progress', tab: 'components', group: 'Feedback', title: 'Progress', status: 'stable',
  summary: 'A determinate bar for uploads and imports.',
  sources: ['components/ui/<name>.tsx'],   // every file it covers
  render: () => (
    <DocSection title="Example">
      <Example code={\`<Progress value={40} />\`}><Progress value={40} /></Example>
    </DocSection>
  ),
},`} stage="muted">
            <p class="m-0 text-sm text-muted-foreground">A page has: what it is for (summary), live examples with code, variants and states, props, use / avoid guidance and at least one do / don’t.</p>
          </Example>
          <Callout title="The coverage check">
            <code>python3 scripts/test_styleguide_coverage.py</code> fails when a file in <code>components/ui/</code>, <code>components/app/</code> or <code>components/shell/</code> is not listed in any entry’s <code>sources</code>. Run it with the token ratchet after UI changes.
          </Callout>
        </DocSection>
        <DocSection title="Retiring one">
          <p class="m-0 max-w-3xl text-sm leading-relaxed text-muted-foreground">Mark the old entry <code>status: 'legacy'</code> with <code>replacedBy</code>, migrate call sites (Inventory shows how many), then delete the file and its entry together.</p>
        </DocSection>
      </>
    ),
  },
]

export const patternEntries: DocEntry[] = [
  {
    id: 'add-flow', tab: 'patterns', group: 'Patterns', title: 'Adding a record',
    summary: 'An “Add …” button opens FormDrawer. Never an inline expanding form, never a centred dialog.',
    history: ['components/app/form-drawer.tsx'],
    keywords: 'create new add form drawer',
    render: () => (
      <>
        <DocSection title="Live">
          <Example description="Add a promoter — it appears in the list and a toast confirms."><AddFlowDemo /></Example>
        </DocSection>
        <DocSection title="Rules">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>The button says “Add &lt;thing&gt;” with a Plus icon and sits where the list is (DataTable <code>actions</code>, a card, the page header).</li>
            <li>When add and edit share fields, edit opens the same drawer prefilled. Small edit-in-place stays inline or in a Dialog.</li>
            <li>Validate on submit (native required / pattern, then <code>validate</code>). Show the server error in the drawer; keep what was typed.</li>
            <li>Wizards: per-step <code>submitLabel</code> and a Back <code>secondaryAction</code>.</li>
            <li>On success: close, toast, the new row visible.</li>
          </ul>
          <DoDont
            do={{ children: <Button size="sm"><Plus /> Add promoter</Button>, caption: 'One button that opens the drawer.' }}
            dont={{ children: <div class="flex w-full max-w-xs flex-col gap-2 rounded-lg border border-border p-3"><Input placeholder="Name" /><Input placeholder="Email" /><Button size="sm">Save</Button></div>, caption: 'An always-open create form on the page.' }}
          />
        </DocSection>
      </>
    ),
  },
  {
    id: 'lists', tab: 'patterns', group: 'Patterns', title: 'Lists & filtering',
    summary: 'One DataTable with filter chips beats several tabbed tables.',
    history: ['components/app/data-table.tsx'],
    keywords: 'list table filter chips tabs',
    render: () => (
      <>
        <DocSection title="Live"><Example><ShowsTable /></Example></DocSection>
        <DocSection title="Rules">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Map each source to one row type; chips filter by kind or state, each with its count.</li>
            <li>Searchable by what people remember (names, cities), sortable by the columns they compare.</li>
            <li>On a dashboard, show the top five as ItemRows and link “Show all N” to the full table.</li>
          </ul>
          <Guidance use={['Any list longer than five.']} avoid={['Tabs per status.', '“Show all 240” expanding inline.']} />
        </DocSection>
      </>
    ),
  },
  {
    id: 'status-board', tab: 'patterns', group: 'Patterns', title: 'Status board',
    summary: 'A one-way pipeline as columns of cards, each with its next-step button. No drag and drop.',
    history: ['pages/TenantContentPage.tsx'],
    keywords: 'kanban board pipeline columns drag',
    render: () => (
      <>
        <DocSection title="Live" description="Approve, reject, pause, mark posted — each move is a button that can ask for confirmation or input. Try it.">
          <Example><StatusBoard /></Example>
        </DocSection>
        <DocSection title="Rules">
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Columns are work in progress only. Finished items (Published) are a DataTable under the board — a record, not a column.</li>
            <li>Five cards per column, then “Show all N”. Columns stack on phones.</li>
            <li>A “Didn’t land” strip appears above the board only when something failed.</li>
            <li>Motion is colour only — hover and focus-within on cards.</li>
          </ul>
        </DocSection>
      </>
    ),
  },
  {
    id: 'states', tab: 'patterns', group: 'Patterns', title: 'Loading, empty & error',
    summary: 'Every block that loads data has three other faces. Design all four.',
    history: ['components/ui/empty-state.tsx', 'components/ui/skeleton.tsx', 'components/Skeleton.tsx', 'components/layout.tsx'],
    keywords: 'loading empty error states skeleton',
    render: () => {
      const [state, setState] = createSignal<'loading' | 'empty' | 'error' | 'ready'>('loading')
      const err = new ApiError(502, 'upstream unreachable', 'upstream_unreachable', undefined, '3f1c9a52-7d0e-4b8e-9d7a-2c6e1f0b9a41')
      return (
        <>
          <DocSection title="One block, four states">
            <div class="flex flex-wrap gap-2">
              <For each={['loading', 'empty', 'error', 'ready'] as const}>{s => (
                <Button size="sm" variant={state() === s ? 'default' : 'outline'} aria-pressed={state() === s} onClick={() => setState(s)} class="capitalize">{s}</Button>
              )}</For>
            </div>
            <Example>
              <div class="max-w-lg">
                <Show when={state() === 'loading'}>
                  <Card title="Replies"><div class="flex flex-col gap-2 py-1"><Skeleton class="h-4 w-full" /><Skeleton class="h-4 w-5/6" /><Skeleton class="h-4 w-2/3" /></div></Card>
                </Show>
                <Show when={state() === 'empty'}>
                  <Card title="Replies"><EmptyState icon={<Inbox />} label="No replies yet" hint="Replies to your posts and DMs land here." /></Card>
                </Show>
                <Show when={state() === 'error'}><ErrorCard title="Couldn't load replies" error={err} onRetry={() => setState('ready')} /></Show>
                <Show when={state() === 'ready'}>
                  <Card title="Replies" aside="3 waiting">
                    <ItemRow pill={{ tone: 'warn', text: '2d' }} title="“Are you playing Gdańsk?”" sub="Instagram DM" />
                    <ItemRow pill={{ tone: 'accent', text: 'new' }} title="“Merch after the show?”" sub="TikTok comment" />
                  </Card>
                </Show>
              </div>
            </Example>
          </DocSection>
          <DocSection title="Rules">
            <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>Loading keeps the block’s frame and title; only the body becomes a skeleton. The header never blinks.</li>
              <li>An error stays inside its block — the rest of the page keeps working. Retry when a retry could help.</li>
              <li>Partial data: show what arrived, “—” for what didn’t, and an info Alert naming the missing section.</li>
            </ul>
          </DocSection>
        </>
      )
    },
  },
  {
    id: 'dashboard-page', tab: 'patterns', group: 'Patterns', title: 'Dashboard page',
    summary: 'The first screen of a section: header, four numbers, the work list beside the object, deeper areas as sub-pages.',
    history: ['components/ui/dash.tsx'],
    keywords: 'dashboard overview page template',
    render: () => (
      <>
        <DocSection title="Shape">
          <Example stage="muted">
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between"><span class="text-xl font-semibold">Today</span><Pill tone="good">All running</Pill></div>
              <Tiles class="mb-0">
                <Tile label="Needs you" value="4" valueTone="warn" />
                <Tile label="Posting today" value="2" />
                <Tile label="New fans" value="38" sub="+12%" valueTone="good" />
                <Tile label="Replies" value="14" />
              </Tiles>
              <div class="grid gap-2.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <Card title="Needs you"><ItemRow pill={{ tone: 'warn', text: 'Today' }} title="Approve the poster post" action={<Button size="sm" variant="outline">Review</Button>} /></Card>
                <Card title="Next show"><p class="m-0 text-sm">Fri 3 Oct · Hydrozagadka</p></Card>
              </div>
            </div>
          </Example>
          <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>The question the page answers is in the first screen — no scrolling to find what needs you.</li>
            <li>Nothing heavier than Tiles, dash Cards and rows on the first screen. Panels live on sub-pages.</li>
            <li>See Layout → App shell for this template inside the real shell.</li>
          </ul>
        </DocSection>
      </>
    ),
  },
  {
    id: 'confirmations', tab: 'patterns', group: 'Patterns', title: 'Confirming & undo',
    summary: 'Ask only before what can’t be undone, and name the consequence.',
    history: ['components/Dialog.tsx'],
    keywords: 'confirm destructive delete undo',
    render: () => (
      <DocSection title="When to ask">
        <Guidance
          use={['Deleting, removing access, suspending, sending to many people.', 'Anything that reaches the outside world and can’t be recalled.']}
          avoid={['Saving a form, toggling a setting — just do it and toast.', 'Reversible moves — offer Undo in the toast instead.']}
        />
        <Callout>Use <code>confirmAction({'{'} title, body, confirmLabel, destructive {'}'})</code>. Title is the question (“Delete this show?”); body is the consequence; the button repeats the verb.</Callout>
      </DocSection>
    ),
  },
  {
    id: 'read-only', tab: 'patterns', group: 'Patterns', title: 'Read-only sessions',
    summary: 'Viewers see everything and change nothing. Controls that write say why they are disabled.',
    history: ['lib/read-only.ts', 'components/Shell.tsx'],
    keywords: 'permissions viewer disabled writes guard',
    render: () => (
      <DocSection title="How">
        <Example stage="flush">
          <div class="flex items-center gap-2 border-b border-warning-foreground/30 bg-warning px-4 py-2 text-xs text-warning-foreground" role="status">
            <strong class="font-semibold">Read-only session.</strong>
            <span>This account can look at everything and change nothing. Controls that would write are disabled.</span>
          </div>
          <div class="p-6"><AppCard class="max-w-sm p-4"><p class="m-0 text-sm">Every control that changes something takes <code>writes</code>: Button, Switch, FileInput, FormDrawer. The shell shows the banner once.</p></AppCard></div>
        </Example>
        <DoDont
          do={{ children: <Button writes>Approve</Button>, caption: 'Mark writing controls with writes; the guard does the rest.' }}
          dont={{ children: <span class={cn('text-sm text-muted-foreground')}><CircleCheck class="mr-1 inline size-4" />Hide the button for viewers</span>, caption: 'Hiding controls — viewers should see what an operator would see.' }}
        />
      </DocSection>
    ),
  },
]
