import { useNavigate } from '@tanstack/solid-router'
import { failureLine, lowerFirst } from '../lib/errors'
import { useQuery } from '@tanstack/solid-query'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import type { Component, JSX } from 'solid-js'
import { CircleSlash, ClipboardList, MessageSquareText, Pause, Play, RefreshCw, Rocket, Table2, Trash2 } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { cn } from '../lib/cn'
import { NavIcon } from './NavIcon'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from './ui/command'
import { Kbd } from './ui/kbd'

// Keyboard-first surface for the operator: jump to any tenant subpage and run
// the common mutations without walking the navigation tree. Mutating entries
// are two-step (arm, then Enter) so a fast Enter-Enter can never fire an
// unintended write; the result line keeps the feedback where the eyes are.
type Cmd = {
  id: string
  label: string
  group: string
  keywords?: string
  hint?: string
  icon: () => JSX.Element
  confirm?: boolean
  /// What running this does, which decides whether the palette stays open.
  ///
  /// Navigation dismisses the palette — the operator asked to be somewhere
  /// else, and leaving a modal over the destination means a second keystroke
  /// to see what they navigated to. Mutations keep it open so the result line
  /// is readable and a follow-up command needs no reopen.
  ///
  /// This used to be inferred from the id prefix (`nav-`, `page-`), which
  /// silently excluded the whole Query group: those entries navigate but their
  /// ids start with `q-`, so every one of them left the palette covering the
  /// page it had just opened.
  kind: 'navigate' | 'mutate'
  perform: () => void | Promise<void>
}

// `icon` names a NavIcon, so a page carries the same glyph here as in the
// sidebar, and labels match the sidebar's. Settings is its own section, so
// the entry and its Destinations sub-page are plain suffixes.
const SUBPAGES: Array<{ suffix: string; label: string; icon: string; search?: Record<string, string> }> = [
  { suffix: '/settings', label: 'Settings', icon: 'settings' },
  { suffix: '/attention', label: 'Needs you', icon: 'attention' },
  { suffix: '/in-motion', label: 'In motion', icon: 'motion' },
  { suffix: '/intelligence', label: 'Intelligence', icon: 'intelligence' },
  { suffix: '/health', label: 'Health', icon: 'sliders' },
  { suffix: '/operations', label: 'Today', icon: 'operations' },
  { suffix: '/integrations', label: 'AI Integrations', icon: 'integrations' },
  { suffix: '/settings/notifications', label: 'Notifications', icon: 'notifiers' },
  { suffix: '/audience', label: 'Audience', icon: 'fan-intel' },
  { suffix: '/places', label: 'Places', icon: 'places' },
  { suffix: '/proof', label: 'Proof', icon: 'proof' },
  { suffix: '/shows', label: 'Shows', icon: 'shows' },
  { suffix: '/content', label: 'Content', icon: 'content' },
  // The beacon roster folded into Audience → Contacts; the palette entry
  // names the destination a person sees, not the route it rides.
  { suffix: '/audience/contacts', label: 'Contacts', icon: 'beacons' },
  // AREA lives under Places now — the palette entry names the destination a
  // person sees and lands on its tab via `search`, not an embedded query.
  { suffix: '/places/area', label: 'AREA', icon: 'area' },
]

// Task-oriented shortcuts. These are navigation, so they are labelled as
// navigation: "Explain this growth drop" promised an answer and delivered a
// route change. Keywords still match the way an operator would phrase it, so
// typing "explain growth drop" finds the funnel.
const QUERY_ENTRIES: Array<{ id: string; label: string; keywords: string; suffix: string; platform?: true }> = [
  { id: 'q-approvals', label: 'Open pending approvals', keywords: 'pending approvals review needs you attention show', suffix: '/attention' },
  { id: 'q-decisions', label: 'Open brain decisions', keywords: 'brain decision decisions timeline why reasoning intelligence what did the brain decide today show', suffix: '/intelligence/decisions' },
  { id: 'q-cycle', label: 'Run a growth cycle (brain)', keywords: 'brain run cycle growth grow fans preview dispatch intelligence', suffix: '/intelligence/standing' },
  { id: 'q-goal', label: 'Declare a growth objective', keywords: 'brain goal north star metric target objective intelligence declare', suffix: '/intelligence/standing' },
  // Dead deliveries live on Health's delivery tab — operator-only, same as
  // the page it opens.
  { id: 'q-failed', label: 'Open failed deliveries', keywords: 'failed deliveries dead outbox webhook push show', suffix: '/health/delivery', platform: true },
  { id: 'q-beacons', label: 'Open Amplifier signals', keywords: 'beacon amplifier signals operations outreach', suffix: '/operations' },
  { id: 'q-content', label: 'Open content', keywords: 'content posts material social approve publish drafts what went out', suffix: '/content' },
  { id: 'q-growth', label: 'Open growth intelligence', keywords: 'growth drop decline metrics funnel explain why', suffix: '/intelligence/decisions' },
  { id: 'q-learning', label: 'Open the learning loop', keywords: 'learning loop outcome decision action intelligence what the brain learned', suffix: '/intelligence/learning' },
  { id: 'q-proof', label: 'Open the proof drawer', keywords: 'proof promoter send attest listing share link show report credentials agent label', suffix: '/proof' },
  { id: 'q-opportunities', label: 'Open the decision queue', keywords: 'opportunities board decision attention approvals show current', suffix: '/attention' },
  // The authority sliders live one level in on Health — the band map does not
  // carry Health, so the entry stays operator-only like the page it opens.
  // The capability map: where every feature lives. Operator-only, like the
  // page — a band finds features where it works, not in an index.
  { id: 'q-capabilities', label: 'Where does each feature live', keywords: 'capabilities everything features all map merch stock inventory rewards draws prizes tickets ticketing releases smart links funnel revenue conversion messages campaigns qr checklist show costs import mailing list cycles connections peers', suffix: '/capabilities', platform: true },
  { id: 'q-policies', label: 'Open autopilot policies', keywords: 'autopilot policies rules authority autonomy sliders watch suggest ask alone health', suffix: '/health/policies', platform: true },
]

// The band's palette mirrors the band's sidebar — the process destinations
// only. Operator-only pages stay reachable by URL but do not list here.
const BAND_SUFFIXES = new Set(['/operations', '/shows', '/attention', '/in-motion', '/places', '/audience', '/intelligence', '/content', '/proof'])
const BAND_ICON: Record<string, string> = { '/operations': 'operations' }

// Section order and headings. The list used to tag every row GO / JUMP /
// QUERY on the right; headed sections say it once.
const GROUPS: Array<{ key: string; heading: string }> = [
  { key: 'Go', heading: 'Go to' },
  { key: 'Jump', heading: 'Pages' },
  { key: 'Query', heading: 'Questions' },
  { key: 'Actions', heading: 'Actions' },
]

// Open state lives in command-palette-state.ts so Shell can toggle the
// palette without this component being in the entry bundle.
import { commandPaletteOpen, setCommandPaletteOpen } from './command-palette-state'
import { readOnly } from '../lib/read-only'


const pageIcon = (name: string) => () => <NavIcon name={name} />

export const CommandPalette: Component = () => {
  const open = commandPaletteOpen
  const setOpen = setCommandPaletteOpen
  const rawNavigate = useNavigate()
  // The route registry types `to` against known literals; the palette builds
  // tenant paths dynamically, so it narrows once at this single boundary.
  const navigate = rawNavigate as unknown as (opts: { to: string; params?: Record<string, string>; search?: Record<string, string> }) => void
  const profile = () => authState.profile()
  const isPlatformLevel = () => authState.isPlatformLevel()

  const [query, setQuery] = createSignal('')
  const [armed, setArmed] = createSignal<string | null>(null)
  const [busy, setBusy] = createSignal<string | null>(null)
  const [message, setMessage] = createSignal('')

  // Share the same ['tenants'] cache as Shell and OverviewPage — no
  // duplicated module-level cache. The query is enabled only for admins
  // (non-admins see only their own tenant, derived from the profile) and
  // only while the palette is open, so it does not fetch on boot.
  const tenantsQuery = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: api.tenants,
    enabled: isPlatformLevel() && open(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    reconcile: 'id',
  }))
  const tenants = () => tenantsQuery.data?.items ?? []

  // Every open starts clean. The component stays mounted between opens (so the
  // dialog can animate out), which makes this reset explicit rather than a
  // side effect of remounting.
  createEffect(() => {
    if (!open()) return
    setQuery(''); setArmed(null); setMessage('')
  })

  const scopedTenants = createMemo(() => {
    if (isPlatformLevel()) return tenants()
    const slug = profile()?.tenantSlug
    return tenants().filter(t => t.slug === slug)
  })

  const commands = createMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'page-overview', label: 'Overview', group: 'Go', icon: pageIcon('overview'), kind: 'navigate', perform: () => navigate({ to: '/' }) },
    ]
    if (isPlatformLevel()) {
      list.push(
        { id: 'page-tenants', label: 'Tenants', group: 'Go', keywords: 'registry', icon: () => <Table2 />, kind: 'navigate', perform: () => navigate({ to: '/tenants' }) },
      )
    }
    const visible = scopedTenants()
    const names = visible.length > 0 ? visible.map(t => t.slug) : [profile()?.tenantSlug].filter((s): s is string => Boolean(s))
    const platform = isPlatformLevel()
    // Tabbed suffixes normalize the same way QUERY_ENTRIES does — the band
    // check cares about the destination page, not the `?tab=` deep link.
    const subpages = platform ? SUBPAGES : SUBPAGES.filter(p => BAND_SUFFIXES.has(p.suffix.split('?')[0] ?? p.suffix))
    // A query entry's suffix carries its `?tab=` deep link; the band check
    // cares about the destination page, so the param is stripped first —
    // otherwise every tabbed entry is silently dropped for a band session.
    const queryEntries = platform ? QUERY_ENTRIES : QUERY_ENTRIES.filter(qe => BAND_SUFFIXES.has(qe.suffix.split('?')[0] ?? qe.suffix) && !qe.platform)
    for (const slug of names) {
      for (const page of subpages) {
        const label = page.label
        list.push({
          // Entries sharing a suffix (Places and AREA) differ by search —
          // it keeps their ids distinct.
          id: `nav-${slug}${page.suffix}${page.search?.tab ? `-${page.search.tab}` : ''}`,
          label: `${slug} · ${label}`,
          group: 'Jump',
          keywords: `${slug} ${label.toLowerCase()}`,
          icon: pageIcon(platform ? page.icon : BAND_ICON[page.suffix] ?? page.icon),
          kind: 'navigate',
          perform: () => navigate({ to: `/tenants/$slug${page.suffix}`, params: { slug }, search: page.search }),
        })
      }
      // Query-oriented entries — natural-language labels for common operator questions
      for (const qe of queryEntries) {
        list.push({
          id: `${qe.id}-${slug}`,
          label: `${qe.label} · ${slug}`,
          group: 'Query',
          keywords: `${slug} ${qe.keywords}`,
          icon: () => <MessageSquareText />,
          kind: 'navigate',
          perform: () => navigate({ to: `/tenants/$slug${qe.suffix}`, params: { slug } }),
        })
      }
      if (platform) {
        // Deploy authority splits on ownership: externally-owned tenants
        // redeploy through `deployTenant` (the ecosystem-deploy workflow),
        // provisioner-managed tenants get a `planned` job a platform admin
        // approves via `reprovision`. Offering either to the wrong kind is
        // a guaranteed 403 or a job nothing ever claims.
        const t = visible.find(row => row.slug === slug)
        list.push(
          { id: `act-${slug}-reconcile`, label: `Reconcile ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} reconcile sync`, icon: () => <RefreshCw />, confirm: true, perform: async () => { await api.runReconciliation(slug) } },
          { id: `act-${slug}-dead`, label: `Clear dead deliveries · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} dead deliveries clear outbox`, icon: () => <Trash2 />, confirm: true, perform: async () => { await api.clearDeadDeliveries(slug) } },
        )
        if (t?.canProvision) list.push(
          { id: `act-${slug}-plan`, label: `Plan provisioning · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} provisioning plan job`, icon: () => <ClipboardList />, confirm: true, perform: async () => { await api.planProvisioning(slug) } },
        )
        if (t && !t.canProvision) list.push(
          { id: `act-${slug}-deploy`, label: `Deploy latest · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} deploy provision release`, hint: 'latest version', icon: () => <Rocket />, confirm: true, perform: async () => { await api.deployTenant(slug) } },
        )
        if (t?.canProvision && authState.isAdmin()) list.push(
          { id: `act-${slug}-approve`, label: `Approve deployment · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} approve provisioning deploy managed`, hint: 'hands the plan to the deploy agent', icon: () => <Rocket />, confirm: true, perform: async () => { await api.reprovisionTenant(slug) } },
        )
        list.push(
          { id: `act-${slug}-cancel`, label: `Cancel provisioning job · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} provisioning cancel job`, icon: () => <CircleSlash />, confirm: true, perform: async () => { await api.cancelProvisioning(slug) } },
          { id: `act-${slug}-suspend`, label: `Suspend tenant · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} suspend pause disable`, hint: 'stops tenant traffic handling', icon: () => <Pause />, confirm: true, perform: async () => { await api.suspend(slug) } },
          { id: `act-${slug}-resume`, label: `Resume tenant · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} resume enable restore`, icon: () => <Play />, confirm: true, perform: async () => { await api.resume(slug) } },
        )
      }
    }
    return list
  })

  // A read-only account cannot run any of these, and the palette is a list of
  // things you can do — an entry that always fails is worse than no entry.
  // Every command already declares its `kind`, so nothing new is needed to
  // tell the two apart.
  const runnable = createMemo(() => readOnly() ? commands().filter(cmd => cmd.kind !== 'mutate') : commands())

  // Filtering stays ours (cmdk's `shouldFilter` is off): every typed word must
  // appear in the label or keywords. cmdk's fuzzy score would rank "sus" into
  // unrelated rows, and a destructive action should only show when asked for.
  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return runnable()
    const terms = q.split(/\s+/)
    return runnable().filter(cmd => {
      const haystack = `${cmd.label} ${cmd.keywords ?? ''}`.toLowerCase()
      return terms.every(term => haystack.includes(term))
    })
  })

  const sections = createMemo(() => GROUPS
    .map(group => ({ ...group, items: filtered().filter(cmd => cmd.group === group.key) }))
    .filter(group => group.items.length > 0))

  const byId = createMemo(() => new Map(runnable().map(cmd => [cmd.id, cmd])))
  const [selected, setSelected] = createSignal('')
  const armedCmd = () => { const id = armed(); return id ? byId().get(id) : undefined }
  const selectedCmd = () => byId().get(selected())

  async function execute(cmd: Cmd) {
    if (busy() !== null) return
    // Mutations are two-step: the first Enter arms the row, the second runs
    // it, so a fast Enter-Enter from the search field can't fire a write the
    // operator never read.
    if (cmd.confirm && armed() !== cmd.id) {
      setArmed(cmd.id)
      setMessage('')
      return
    }
    setArmed(null)
    setBusy(cmd.id)
    try {
      await cmd.perform()
      if (cmd.kind === 'navigate') { setOpen(false); return }
      setMessage(`✓ ${cmd.label}`)
    } catch (error) {
      setMessage(`✕ ${failureLine(`Couldn't ${lowerFirst(cmd.label)}`, error)}`)
    } finally {
      setBusy(null)
    }
  }

  const footer = (
    <div class="flex min-h-10 items-center justify-between gap-3 border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Show when={message()} fallback={
        <Show when={armedCmd()} fallback={
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>navigate</span>
            <span class="flex items-center gap-1.5"><Kbd>↵</Kbd>{selectedCmd()?.confirm ? 'select, then ↵ again' : 'open'}</span>
            <span class="hidden items-center gap-1.5 sm:flex"><Kbd>esc</Kbd>close</span>
          </div>
        }>
          {cmd => <span class="truncate text-destructive">Press <Kbd class="text-destructive">↵</Kbd> again to {cmd().label.charAt(0).toLowerCase() + cmd().label.slice(1)}</span>}
        </Show>
      }>
        <span role="status" class={cn('truncate', message().startsWith('✕') && 'text-destructive')}>{message()}</span>
      </Show>
      <Show when={busy() !== null}><span class="shrink-0 text-foreground">Running…</span></Show>
    </div>
  )

  return (
    <CommandDialog
      open={open()}
      onOpenChange={setOpen}
      title="Command palette"
      description={isPlatformLevel() ? 'Search pages, tenants and actions' : 'Search pages and actions'}
      commandProps={{
        shouldFilter: false,
        loop: true,
        // Uncontrolled: cmdk owns the highlighted row and reports it here.
        // Moving off an armed row disarms it — the confirm belongs to the row
        // the operator was looking at when they pressed Enter.
        onValueChange: (value: string) => {
          setSelected(value)
          if (armed() !== null && armed() !== value) setArmed(null)
        },
      }}
      footer={footer}
    >
      <CommandInput
        aria-label="Search"
        placeholder={isPlatformLevel() ? 'Search pages, tenants or actions…' : 'Search pages or actions…'}
        value={query()}
        onValueChange={value => { setQuery(value); setArmed(null) }}
        spellcheck={false}
      />
      <CommandList class="px-1 pb-1">
        <CommandEmpty>Nothing matches “{query()}”.</CommandEmpty>
        <For each={sections()}>
          {(section, i) => <>
            <Show when={i() > 0}><CommandSeparator class="my-1" /></Show>
            <CommandGroup heading={section.heading}>
              <For each={section.items}>
                {cmd => (
                  <CommandItem
                    value={cmd.id}
                    keywords={cmd.keywords ? [cmd.keywords] : undefined}
                    onSelect={() => void execute(cmd)}
                    class={cn(
                      cmd.confirm && 'data-[selected=true]:bg-destructive/10 data-[selected=true]:text-destructive',
                      armed() === cmd.id && 'bg-destructive/10 text-destructive [&_svg]:text-destructive',
                    )}
                  >
                    {cmd.icon()}
                    <span class="min-w-0 flex-1 truncate">{cmd.label}</span>
                    <Show when={armed() === cmd.id} fallback={
                      <Show when={cmd.hint}><CommandShortcut class="tracking-normal">{cmd.hint}</CommandShortcut></Show>
                    }>
                      <CommandShortcut class="flex items-center gap-1 tracking-normal text-destructive">
                        <Show when={busy() === cmd.id} fallback={<>Confirm <Kbd>↵</Kbd></>}>Running…</Show>
                      </CommandShortcut>
                    </Show>
                  </CommandItem>
                )}
              </For>
            </CommandGroup>
          </>}
        </For>
      </CommandList>
    </CommandDialog>
  )
}
