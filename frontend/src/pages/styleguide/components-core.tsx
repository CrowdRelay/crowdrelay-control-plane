import { For } from 'solid-js'
import { CircleCheck, Copy, MoreHorizontal, Plus, RefreshCw, SearchX, Trash2, Users } from 'lucide-solid'
import { Button } from '~/components/app/button'
import { Badge } from '~/components/app/badge'
import { Alert } from '~/components/app/alert'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/app/card'
import { CollapsibleSection } from '~/components/app/collapsible'
import { toast } from '~/components/app/toast'
import { Act, Card as DashCard, IconAct, Note, Pill } from '~/components/ui/dash'
import { EmptyState } from '~/components/ui/empty-state'
import { Hint } from '~/components/ui/hint'
import { Kbd, KbdGroup } from '~/components/ui/kbd'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { Separator } from '~/components/ui/separator'
import { Skeleton } from '~/components/ui/skeleton'
import { TechIdList } from '~/components/ui/TechnicalDetails'
import { StatusBadge } from '~/components/StatusBadge'
import { Spinner } from '~/components/Spinner'
import { SkeletonBlock, SkeletonRows } from '~/components/Skeleton'
import { DeltaBadge, Widget } from '~/components/charts'
import { ErrorCard } from '~/components/layout'
import { ApiError } from '~/lib/api'
import { DoDont, DocSection, DocSub, Example, Guidance, PropTable } from './kit'
import type { DocEntry } from './types'

/** Real backend shapes, so the specimens show exactly what readers see. */
const SAMPLE_ERRORS = {
  unreachable: new ApiError(502, 'upstream unreachable', 'upstream_unreachable', undefined, '3f1c9a52-7d0e-4b8e-9d7a-2c6e1f0b9a41'),
  conflict: new ApiError(409, 'conflict: operator username is already taken', 'conflict', undefined, 'b8e2d7c1-1a4f-4f3e-8c2b-5d9e0a7f6c13'),
  missing: new ApiError(404, 'not found', 'not_found', undefined, 'e0a4c6d2-9b1f-47c3-a8e5-6f2d1b3c9e07'),
}

const BUTTON_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'link', 'destructive'] as const
const BADGE_VARIANTS = ['default', 'secondary', 'outline', 'success', 'warning', 'error'] as const

export const coreEntries: DocEntry[] = [
  // ── Actions ───────────────────────────────────────────────────────────
  {
    id: 'button', tab: 'components', group: 'Actions', title: 'Button', status: 'stable',
    summary: 'The one button. Six variants, four sizes; writes guards read-only sessions.',
    sources: ['components/app/button.tsx', 'components/ui/button.tsx'], keywords: 'cta action submit primary',
    render: () => (
      <>
        <DocSection title="Variants">
          <Example stage="center" code={`<Button>Add show</Button>
<Button variant="secondary">…</Button>
<Button variant="outline">…</Button>
<Button variant="ghost">…</Button>
<Button variant="link">…</Button>
<Button variant="destructive">…</Button>`}>
            <For each={BUTTON_VARIANTS}>{v => <Button variant={v}>{v}</Button>}</For>
          </Example>
          <PropTable rows={[
            ['variant="default"', 'variant', 'default', 'The one primary action on a page or in a dialog.'],
            ['variant="outline"', 'variant', '', 'Everything else that sits next to a primary: Cancel, Review, Export.'],
            ['variant="secondary"', 'variant', '', 'A soft filled action where outline is too faint — rare.'],
            ['variant="ghost"', 'variant', '', 'Toolbar and row controls, icon buttons, “View all”.'],
            ['variant="link"', 'variant', '', 'Inline action inside text.'],
            ['variant="destructive"', 'variant', '', 'Delete / remove / park — the confirm button in an AlertDialog, the Danger zone.'],
          ]} />
        </DocSection>
        <DocSection title="Sizes">
          <Example stage="center" code={`<Button size="sm">…</Button>
<Button>…</Button>
<Button size="lg">…</Button>
<Button size="icon" aria-label="Add"><Plus /></Button>`}>
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Add"><Plus /></Button>
            <Button size="icon" variant="ghost" aria-label="More"><MoreHorizontal /></Button>
          </Example>
          <p class="m-0 text-sm text-muted-foreground">sm in headers, rows and toolbars (most of the console); default in forms and dialogs; lg almost never.</p>
        </DocSection>
        <DocSection title="With icons & states">
          <Example stage="center" code={`<Button><Plus /> Add show</Button>
<Button disabled><Spinner /> Saving…</Button>
<Button writes>Approve</Button>  {/* disabled with a reason in read-only sessions */}`}>
            <Button><Plus /> Add show</Button>
            <Button variant="outline"><Copy /> Copy and open</Button>
            <Button variant="outline" size="sm"><RefreshCw /> Retry</Button>
            <Button disabled><Spinner /> Saving…</Button>
            <Button variant="outline" disabled>Disabled</Button>
            <Button variant="destructive"><Trash2 /> Delete</Button>
          </Example>
        </DocSection>
        <DocSection title="Props">
          <PropTable rows={[
            ['variant', "'default' | 'secondary' | 'outline' | 'ghost' | 'link' | 'destructive'", "'default'", 'Visual weight.'],
            ['size', "'sm' | 'default' | 'lg' | 'icon'", "'default'", 'Height and padding.'],
            ['writes', 'boolean', 'false', 'This button changes something. Read-only sessions see it disabled with a tooltip.'],
            ['as', 'Component', 'button', 'Render as a router Link or an anchor.'],
          ]} />
          <DocSub title="Legacy names" note="Still accepted, mapped onto the stock set. Don’t use them in new code — 42 call sites to migrate.">
            <PropTable rows={[
              ['variant="success"', '→ default', '13 files', 'There is no green button. Use default.'],
              ['variant="destructive-ghost"', '→ outline', '17 files', 'Use outline; put the destructive weight in the confirm dialog.'],
              ['size="xs"', '→ sm', '12 files', 'Use sm.'],
            ]} />
          </DocSub>
        </DocSection>
        <DocSection title="Guidance">
          <DoDont
            do={{ children: <><Button variant="outline">Cancel</Button><Button>Save</Button></>, caption: 'One primary per view; the rest outline. Primary on the right.' }}
            dont={{ children: <><Button>Cancel</Button><Button>Save</Button><Button>Save & close</Button></>, caption: 'Several filled buttons side by side.' }}
          />
          <DoDont
            do={{ children: <Button size="icon" variant="ghost" aria-label="Refresh"><RefreshCw /></Button>, caption: 'Icon-only buttons carry an aria-label.' }}
            dont={{ children: <button type="button" class="text-xs underline">refresh</button>, caption: 'Raw <button> outside components/ui — the ratchet counts them, and they skip writeGuard.' }}
          />
        </DocSection>
      </>
    ),
  },
  {
    id: 'row-actions', tab: 'components', group: 'Actions', title: 'Row actions: Act & IconAct', status: 'stable',
    summary: 'The small outlined control inside a dashboard row, and the bare icon control in a card header.',
    sources: ['components/ui/dash.tsx'], keywords: 'act iconact inline small link button',
    render: () => (
      <>
        <DocSection title="Act" description="Renders a router Link with to, an external anchor with href, a button otherwise.">
          <Example stage="center" code={`<Act onClick={…}>Review</Act>
<Act primary onClick={…}>Approve</Act>
<Act to="/tenants/$slug/shows" params={{ slug }}>Open</Act>`}>
            <Act onClick={() => {}}>Review</Act>
            <Act primary onClick={() => {}}>Approve</Act>
            <Act href="https://example.com">Open site</Act>
            <Act disabled>Waiting</Act>
          </Example>
          <Guidance
            use={['The control at the end of an ItemRow / Row inside a dash Card.']}
            avoid={['Page or dialog actions — use Button size="sm". Act and Button sm look nearly the same; prefer Button in new code outside rows.']}
          />
        </DocSection>
        <DocSection title="IconAct">
          <Example stage="center" code={`<IconAct label="Refresh" onClick={refetch}><RefreshCw class="size-3.5" /></IconAct>`}>
            <IconAct label="Refresh" onClick={() => {}}><RefreshCw class="size-3.5" /></IconAct>
          </Example>
        </DocSection>
      </>
    ),
  },

  // ── Status & labels ───────────────────────────────────────────────────
  {
    id: 'badge', tab: 'components', group: 'Status & labels', title: 'Badge & StatusBadge', status: 'stable',
    summary: 'A small label for a state. StatusBadge takes a backend token and a tone and says the words.',
    sources: ['components/app/badge.tsx', 'components/ui/badge.tsx', 'components/StatusBadge.tsx'], keywords: 'tag chip label status',
    render: () => (
      <>
        <DocSection title="Badge">
          <Example stage="center" code={`<Badge variant="success">Connected</Badge>`}>
            <For each={BADGE_VARIANTS}>{v => <Badge variant={v}>{v}</Badge>}</For>
          </Example>
        </DocSection>
        <DocSection title="StatusBadge" description="Pass the raw token; humanizeToken turns AWAITING_APPROVAL into “Awaiting approval”.">
          <Example stage="center" code={`<StatusBadge status={run.state} tone="good" />`}>
            <StatusBadge status="SUCCEEDED" tone="good" />
            <StatusBadge status="awaiting_approval" tone="warn" />
            <StatusBadge status="FAILED" tone="bad" />
            <StatusBadge status="not_reported" tone="muted" />
          </Example>
        </DocSection>
        <DocSection title="Badge vs Pill" description="Two chips exist. Badge is bordered and bolder — for status in tables and headers. Pill is the softer tinted chip of the dashboard rows. Pick by context, not taste.">
          <Example stage="center">
            <Badge variant="warning">Badge · warning</Badge>
            <Pill tone="warn">Pill · warn</Pill>
          </Example>
        </DocSection>
      </>
    ),
  },
  {
    id: 'pill', tab: 'components', group: 'Status & labels', title: 'Pill', status: 'stable',
    summary: 'The tinted chip of dashboard rows — tone + a few words.',
    sources: ['components/ui/dash.tsx'], keywords: 'chip tag tone',
    render: () => (
      <DocSection title="Tones">
        <Example stage="center" code={`<Pill tone="good">Sent</Pill>`}>
          <Pill tone="good">Sent</Pill><Pill tone="warn">Today</Pill><Pill tone="bad">Failed</Pill><Pill tone="accent">Draft</Pill><Pill>Off</Pill>
        </Example>
        <PropTable rows={[['tone', "'good' | 'warn' | 'bad' | 'accent' | 'muted'", "'muted'", 'See Foundations → Colour → Tone vocabulary.'], ['children', 'JSX.Element', '—', 'One to three words.']]} />
      </DocSection>
    ),
  },
  {
    id: 'delta-badge', tab: 'components', group: 'Status & labels', title: 'DeltaBadge', status: 'stable',
    summary: 'A change against a previous period: up is good, down is bad, zero is muted.',
    sources: ['components/charts.tsx'], keywords: 'trend change percent',
    render: () => (
      <DocSection title="Directions">
        <Example stage="center" code={`<DeltaBadge value={0.12} label="vs last week" />`}>
          <DeltaBadge value={0.12} label="vs last week" />
          <DeltaBadge value={-0.08} label="vs last week" />
          <DeltaBadge value={0} label="vs last week" />
          <DeltaBadge value={null} label="vs last week" />
        </Example>
      </DocSection>
    ),
  },
  {
    id: 'kbd', tab: 'components', group: 'Status & labels', title: 'Kbd', status: 'stable',
    summary: 'A keyboard key or shortcut.',
    sources: ['components/ui/kbd.tsx'], keywords: 'shortcut key keyboard',
    render: () => (
      <DocSection title="Example">
        <Example stage="center" code={`<KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>`}>
          <KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>
          <KbdGroup><Kbd>⌘</Kbd><Kbd>B</Kbd></KbdGroup>
          <Kbd>Esc</Kbd>
        </Example>
      </DocSection>
    ),
  },
  {
    id: 'avatar', tab: 'components', group: 'Status & labels', title: 'Avatar', status: 'stable',
    summary: 'Initials for a person or workspace. Used in the account menu.',
    sources: ['components/ui/avatar.tsx'], keywords: 'user initials picture',
    render: () => (
      <DocSection title="Example">
        <Example stage="center" code={`<Avatar class="size-8 rounded-lg"><AvatarFallback class="rounded-lg">DE</AvatarFallback></Avatar>`}>
          <Avatar class="size-8 rounded-lg"><AvatarFallback class="rounded-lg">DE</AvatarFallback></Avatar>
          <Avatar><AvatarFallback>KW</AvatarFallback></Avatar>
        </Example>
      </DocSection>
    ),
  },
  {
    id: 'hint', tab: 'components', group: 'Status & labels', title: 'Hint', status: 'stable',
    summary: 'A small “?” that explains a term in a popover. For definitions, not instructions.',
    sources: ['components/ui/hint.tsx'], keywords: 'help info tooltip explain',
    render: () => (
      <DocSection title="Example">
        <Example stage="center" code={`Paid providers <Hint label="About paid providers">The router …</Hint>`}>
          <span class="flex items-center gap-2 text-sm">Paid providers<Hint label="About paid providers">The router reaches for free models first and falls back to paid ones only when the free tier is exhausted.</Hint></span>
        </Example>
        <Guidance use={['Defining a term the reader may not know.']} avoid={['Anything they need to act — put it in the hint line under the field or in the page.']} />
      </DocSection>
    ),
  },

  // ── Feedback ──────────────────────────────────────────────────────────
  {
    id: 'alert', tab: 'components', group: 'Feedback', title: 'Alert', status: 'stable',
    summary: 'A notice inside the page about this page’s data. Four tones, one stock look.',
    sources: ['components/app/alert.tsx', 'components/ui/alert.tsx', 'components/alert-guide.ts'], keywords: 'banner notice warning message',
    render: () => (
      <DocSection title="Tones">
        <Example class="grid gap-3 md:grid-cols-2" code={`<Alert tone="warning" title="Reddit cookie expires in 3 days">Upload a fresh one in Settings.</Alert>`}>
          <Alert tone="info" title="Last-known values">The tenant did not answer in time.</Alert>
          <Alert tone="success" title="Instagram connected">First sync in a few minutes.</Alert>
          <Alert tone="warning" title="Reddit cookie expires in 3 days">Upload a fresh one in Settings.</Alert>
          <Alert tone="destructive" title="Outbox delivery failed">12 messages did not send.</Alert>
        </Example>
        <Guidance
          use={['A state that holds while the page is open: degraded data, an expiring credential.']}
          avoid={['A load that failed — ErrorCard.', 'Confirmation that an action worked — toast.', 'Empty data — EmptyState.']}
        />
      </DocSection>
    ),
  },
  {
    id: 'error-card', tab: 'components', group: 'Feedback', title: 'ErrorCard', status: 'stable',
    summary: 'A failed load or action: the title names what failed, the error supplies why and what next.',
    sources: ['components/layout.tsx', 'components/ui/TechnicalDetails.tsx', 'lib/errors.ts', 'components/SectionFailureCard.tsx'], keywords: 'error failure retry',
    render: () => (
      <>
        <DocSection title="Examples" description="Pass the caught error, never its message. lib/errors.ts turns it into a plain reason and next step, and keeps status, code and request ID under Technical details. Temporary problems take the warning tone.">
          <Example class="grid gap-3 md:grid-cols-2" code={`<ErrorCard title="Couldn't load growth trends" error={query.error} onRetry={() => query.refetch()} />`}>
            <ErrorCard title="Couldn't load growth trends" error={SAMPLE_ERRORS.unreachable} onRetry={() => new Promise(r => setTimeout(r, 800))} />
            <ErrorCard title="Couldn't save the operator" error={SAMPLE_ERRORS.conflict} />
            <ErrorCard title="Couldn't load this show" error={SAMPLE_ERRORS.missing} />
            <ErrorCard>{"Couldn't import the file. Choose a CSV file first."}</ErrorCard>
          </Example>
        </DocSection>
        <DocSection title="Technical details" description="IDs and raw values tucked behind a disclosure.">
          <Example code={`<TechIdList ids={[{ label: 'request', value: id }]} />`}>
            <TechIdList ids={[{ label: 'request', value: '3f1c9a52-7d0e-4b8e-9d7a-2c6e1f0b9a41' }, { label: 'tenant', value: 'virya' }]} />
          </Example>
        </DocSection>
      </>
    ),
  },
  {
    id: 'empty-state', tab: 'components', group: 'Feedback', title: 'EmptyState', status: 'stable',
    summary: 'Nothing to show: one muted icon, what is missing, and the action that fills it.',
    sources: ['components/ui/empty-state.tsx', 'components/ui/empty.tsx'], keywords: 'empty zero none no data blank',
    render: () => (
      <>
        <DocSection title="Kinds">
          <Example class="grid gap-3 md:grid-cols-3" code={`<EmptyState icon={<Users />} label="No fans yet" hint="Connect a source to start counting fans.">
  <Button variant="outline" size="sm">Connect a source</Button>
</EmptyState>`}>
            <Card><EmptyState icon={<Users />} label="No fans yet" hint="Connect a source to start counting fans."><Button variant="outline" size="sm">Connect a source</Button></EmptyState></Card>
            <Card><EmptyState icon={<CircleCheck />} label="No open alerts" hint="Everything is running as expected." /></Card>
            <Card><EmptyState icon={<SearchX />} label="Nothing matches “metal”" hint="Try a shorter search or clear the filters." /></Card>
          </Example>
          <p class="m-0 text-sm text-muted-foreground">First use → a forward action. All clear → CircleCheck, no action. No results → SearchX and how to widen. <code>ui/empty.tsx</code> (stock shadcn Empty) has one caller; prefer EmptyState.</p>
        </DocSection>
      </>
    ),
  },
  {
    id: 'toast', tab: 'components', group: 'Feedback', title: 'Toast', status: 'stable',
    summary: 'A brief confirmation that an action worked, or that it failed after the dialog closed.',
    sources: ['components/app/toast.tsx', 'components/ui/toast.tsx'], keywords: 'notification snackbar',
    render: () => (
      <DocSection title="API">
        <Example stage="center" code={`toast.success('Reconciliation finished')
toast.error("Couldn't start the deploy", error)   // persistent, carries the reason
toast.info('Outbox item re-queued')`}>
          <Button variant="outline" onClick={() => toast.success('Reconciliation finished')}>toast.success</Button>
          <Button variant="outline" onClick={() => toast.error("Couldn't start the deploy", SAMPLE_ERRORS.unreachable)}>toast.error</Button>
          <Button variant="outline" onClick={() => toast.info('Outbox item re-queued')}>toast.info</Button>
        </Example>
        <Guidance use={['The result of an action the person just took.']} avoid={['Something they must act on later — put it in the page (Alert, Needs you).']} />
      </DocSection>
    ),
  },
  {
    id: 'loading', tab: 'components', group: 'Feedback', title: 'Skeleton & Spinner', status: 'stable',
    summary: 'Skeletons hold the shape of content while it loads; a Spinner is only for a button that is working.',
    sources: ['components/ui/skeleton.tsx', 'components/Skeleton.tsx', 'components/Spinner.tsx'], keywords: 'loading placeholder pending shimmer',
    render: () => (
      <>
        <DocSection title="Skeleton" description="shadcn Skeleton: animate-pulse rounded-md bg-muted. Compose the shape of what is coming. Skeleton.tsx holds page-level composites (SkeletonPage, SkeletonRows…).">
          <Example class="grid gap-6 md:grid-cols-3" code={`<Skeleton class="h-4 w-48" />
<SkeletonRows count={3} />`}>
            <div class="flex items-center gap-4">
              <Skeleton class="size-12 rounded-full" />
              <div class="flex flex-col gap-2"><Skeleton class="h-4 w-40" /><Skeleton class="h-4 w-28" /></div>
            </div>
            <SkeletonBlock height="96px" />
            <SkeletonRows count={2} />
          </Example>
        </DocSection>
        <DocSection title="Spinner">
          <Example stage="center" code={`<Button disabled><Spinner /> Saving…</Button>`}>
            <Spinner /><Spinner size={16} /><Spinner size={24} />
            <Button disabled><Spinner /> Saving…</Button>
          </Example>
          <DoDont
            do={{ children: <div class="flex w-48 flex-col gap-2"><Skeleton class="h-4 w-full" /><Skeleton class="h-4 w-2/3" /></div>, caption: 'A skeleton in the shape of the content.' }}
            dont={{ children: <span class="text-sm text-muted-foreground">Loading…</span>, caption: 'Text “Loading…” placeholders or a page-sized spinner.' }}
          />
        </DocSection>
      </>
    ),
  },

  // ── Containers ────────────────────────────────────────────────────────
  {
    id: 'card', tab: 'components', group: 'Containers', title: 'Card', status: 'stable',
    summary: 'A bordered block. Dash Card is the dashboard one; the stock Card is for forms and standalone panels.',
    sources: ['components/ui/dash.tsx', 'components/app/card.tsx', 'components/ui/card.tsx'], keywords: 'panel box container block',
    render: () => (
      <>
        <DocSection title="Dash Card" description="Small title with an icon, an optional note on the right, rows inside. The block dashboards are made of.">
          <Example code={`<Card title="Needs you" icon={<Users />} aside="ranked by fans it can bring">…</Card>   // from ui/dash`}>
            <div class="grid gap-3 md:grid-cols-2">
              <DashCard title="Needs you" icon={<Users />} aside="ranked by fans it can bring">
                <p class="m-0 text-sm text-muted-foreground">Rows go here.</p>
                <Note>Arrivals stopped 9 days ago.</Note>
              </DashCard>
              <DashCard title="Reddit" tone="warn" aside="cookie expires in 3 days">
                <p class="m-0 text-sm text-muted-foreground">tone="warn" tints the border.</p>
              </DashCard>
            </div>
          </Example>
        </DocSection>
        <DocSection title="Stock Card" description="Header, content and footer parts. flat removes the box and keeps a top rule, for panels stacked in a page.">
          <Example code={`<Card>
  <CardHeader><CardTitle>…</CardTitle><CardDescription>…</CardDescription></CardHeader>
  <CardContent>…</CardContent>
  <CardFooter>…</CardFooter>
</Card>`}>
            <div class="grid gap-3 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Connect Instagram</CardTitle><CardDescription>Posts and DMs flow in once connected.</CardDescription></CardHeader>
                <CardContent class="text-sm text-muted-foreground">You’ll be sent to Instagram to approve access.</CardContent>
                <CardFooter><Button size="sm">Connect</Button></CardFooter>
              </Card>
              <div>
                <Card flat class="p-4"><p class="m-0 text-sm font-medium">Flat (first)</p><p class="m-0 mt-1 text-xs text-muted-foreground">No rule on the first one.</p></Card>
                <Card flat class="p-4"><p class="m-0 text-sm font-medium">Flat (stacked)</p><p class="m-0 mt-1 text-xs text-muted-foreground">A top rule separates it.</p></Card>
              </div>
            </div>
          </Example>
        </DocSection>
        <DocSection title="Widget" description="A card with a muted label row, for a single chart.">
          <Example code={`<Widget label="Fans this month" action={<DeltaBadge … />}>…</Widget>`}>
            <Widget label="Fans this month" action={<DeltaBadge value={0.12} label="vs last month" />} class="max-w-sm">
              <p class="m-0 text-3xl font-semibold tabular-nums">1,284</p>
            </Widget>
          </Example>
        </DocSection>
        <DocSection title="Rules">
          <DoDont
            do={{ children: <DashCard title="Shows" class="w-52"><p class="m-0 text-xs text-muted-foreground">Border only</p></DashCard>, caption: 'Separate with the border.' }}
            dont={{ children: <div class="w-52 rounded-xl border bg-card p-4"><div class="rounded-xl border p-3 text-xs text-muted-foreground">Card in a card</div></div>, caption: 'Nest a bordered card inside a card, or add a shadow.' }}
          />
        </DocSection>
      </>
    ),
  },
  {
    id: 'collapsible', tab: 'components', group: 'Containers', title: 'CollapsibleSection', status: 'stable',
    summary: 'A bordered block that opens on demand — operator details most people never need.',
    sources: ['components/app/collapsible.tsx', 'components/ui/collapsible.tsx'], keywords: 'accordion disclosure expand fold',
    render: () => (
      <DocSection title="Example">
        <Example code={`<CollapsibleSection eyebrow="Operator" title="Runtime switches" badge="2 off" badgeTone="warn">…</CollapsibleSection>`}>
          <CollapsibleSection eyebrow="Operator" title="Runtime switches" badge="2 off" badgeTone="warn">
            <p class="m-0 text-sm text-muted-foreground">Mounted the first time it opens.</p>
          </CollapsibleSection>
        </Example>
        <Guidance use={['Rarely-needed, technical detail at the foot of a page.']} avoid={['Primary content — people miss what is folded.', 'Nav groups — they never fold.']} />
      </DocSection>
    ),
  },
  {
    id: 'separator', tab: 'components', group: 'Containers', title: 'Separator', status: 'stable',
    summary: 'A 1px rule, horizontal or vertical.',
    sources: ['components/ui/separator.tsx'], keywords: 'divider rule line hr',
    render: () => (
      <DocSection title="Example">
        <Example code={`<Separator />  <Separator orientation="vertical" class="h-4" />`}>
          <div class="flex flex-col gap-3 text-sm">
            <span>Above</span><Separator /><div class="flex h-5 items-center gap-3"><span>Left</span><Separator orientation="vertical" class="h-4" /><span>Right</span></div>
          </div>
        </Example>
      </DocSection>
    ),
  },
]

