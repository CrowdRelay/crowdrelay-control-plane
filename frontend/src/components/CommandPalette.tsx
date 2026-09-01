import { useNavigate } from '@tanstack/solid-router'
import { createEffect, createMemo, createSignal, For, Show, onMount, onCleanup } from 'solid-js'
import type { Component } from 'solid-js'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { TenantSummary } from '../lib/types'

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

const SUBPAGES: Array<{ suffix: string; label: string }> = [
  { suffix: '', label: 'Overview' },
  { suffix: '/attention', label: 'Attention' },
  { suffix: '/operations', label: 'Operations' },
  { suffix: '/intelligence', label: 'Intelligence' },
  { suffix: '/audience', label: 'Fan Intelligence' },
  { suffix: '/funnel', label: 'Growth Funnel' },
  { suffix: '/notifiers', label: 'Notifiers' },
  { suffix: '/integrations', label: 'AI Integrations' },
  { suffix: '/portfolio', label: 'Portfolio' },
  { suffix: '/area', label: 'AREA' },
]

// Task-oriented shortcuts. These are navigation, so they are labelled as
// navigation: "Explain this growth drop" promised an answer and delivered a
// route change. Keywords still match the way an operator would phrase it, so
// typing "explain growth drop" finds the funnel.
const QUERY_ENTRIES: Array<{ id: string; label: string; keywords: string; suffix: string }> = [
  { id: 'q-approvals', label: 'Open pending approvals', keywords: 'pending approvals review needs you attention show', suffix: '/attention' },
  { id: 'q-decisions', label: 'Open brain decisions', keywords: 'brain decision decisions timeline why reasoning intelligence what did the brain decide today show', suffix: '/intelligence' },
  { id: 'q-cycle', label: 'Run a growth cycle (brain)', keywords: 'brain run cycle growth grow fans preview dispatch intelligence', suffix: '/intelligence' },
  { id: 'q-goal', label: 'Change the brain goal (north star)', keywords: 'brain goal north star metric target objective intelligence', suffix: '/intelligence' },
  { id: 'q-failed', label: 'Open failed deliveries', keywords: 'failed deliveries dead outbox webhook push show', suffix: '/attention' },
  { id: 'q-beacons', label: 'Open Beacon signals', keywords: 'beacon signals operations outreach', suffix: '/operations' },
  { id: 'q-growth', label: 'Open the growth funnel', keywords: 'growth drop decline metrics funnel explain why', suffix: '/funnel' },
  { id: 'q-learning', label: 'Open the learning loop', keywords: 'learning loop outcome decision action intelligence what the brain learned', suffix: '/intelligence' },
  { id: 'q-opportunities', label: 'Open the opportunity board', keywords: 'opportunities board decision operations show current', suffix: '/operations' },
]

// Open state lives in command-palette-state.ts so Shell can toggle the
// palette without this component being in the entry bundle.
import { commandPaletteOpen, setCommandPaletteOpen, toggleCommandPalette } from './command-palette-state'

let tenantsCache: { at: number; data: TenantSummary[] } | null = null

export const CommandPalette: Component = () => {
  const open = commandPaletteOpen
  const setOpen = setCommandPaletteOpen
  const rawNavigate = useNavigate()
  // The route registry types `to` against known literals; the palette builds
  // tenant paths dynamically, so it narrows once at this single boundary.
  const navigate = rawNavigate as unknown as (opts: { to: string; params?: Record<string, string> }) => void
  const profile = () => authState.profile()
  const isAdmin = () => profile()?.role === 'platform_admin'

  const [query, setQuery] = createSignal('')
  const [index, setIndex] = createSignal(0)
  const [armed, setArmed] = createSignal<string | null>(null)
  const [busy, setBusy] = createSignal<string | null>(null)
  const [message, setMessage] = createSignal('')
  const [tenants, setTenants] = createSignal<TenantSummary[]>([])
  let inputRef: HTMLInputElement | undefined

  createEffect(() => {
    if (!open()) return
    setQuery(''); setIndex(0); setArmed(null); setMessage('')
    queueMicrotask(() => inputRef?.focus())
    // Tenants change rarely; a short cache keeps ⌘K instant while staying fresh.
    const now = Date.now()
    if (isAdmin() && (!tenantsCache || now - tenantsCache.at > 30_000)) {
      api.tenants().then(r => {
        tenantsCache = { at: Date.now(), data: r.items }
        setTenants(r.items)
      }).catch(() => setTenants(tenantsCache?.data ?? []))
    } else {
      setTenants(tenantsCache?.data ?? [])
    }
  })

  const scopedTenants = createMemo(() => {
    if (isAdmin()) return tenants()
    const slug = profile()?.tenantSlug
    return tenants().filter(t => t.slug === slug)
  })

  const commands = createMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'page-overview', label: 'Overview', group: 'Go', kind: 'navigate', perform: () => navigate({ to: '/' }) },
    ]
    if (isAdmin()) {
      list.push(
        { id: 'page-tenants', label: 'Tenants', group: 'Go', keywords: 'registry', kind: 'navigate', perform: () => navigate({ to: '/tenants' }) },
        { id: 'page-attention', label: 'Attention', group: 'Go', keywords: 'alerts watchdog', kind: 'navigate', perform: () => navigate({ to: '/attention' }) },
      )
    }
    const visible = scopedTenants()
    const names = visible.length > 0 ? visible.map(t => t.slug) : [profile()?.tenantSlug].filter((s): s is string => Boolean(s))
    for (const slug of names) {
      for (const page of SUBPAGES) {
        list.push({
          id: `nav-${slug}${page.suffix}`,
          label: `${slug} · ${page.label}`,
          group: 'Jump',
          keywords: `${slug} ${page.label.toLowerCase()}`,
          kind: 'navigate',
          perform: () => page.suffix === ''
            ? navigate({ to: '/tenants/$slug', params: { slug } })
            : navigate({ to: `/tenants/$slug${page.suffix}`, params: { slug } }),
        })
      }
      // Query-oriented entries — natural-language labels for common operator questions
      for (const qe of QUERY_ENTRIES) {
        list.push({
          id: `${qe.id}-${slug}`,
          label: `${qe.label} · ${slug}`,
          group: 'Query',
          keywords: `${slug} ${qe.keywords}`,
          kind: 'navigate',
          perform: () => navigate({ to: `/tenants/$slug${qe.suffix}`, params: { slug } }),
        })
      }
      list.push(
        { id: `act-${slug}-reconcile`, label: `Reconcile ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} reconcile sync`, confirm: true, perform: async () => { await api.runReconciliation(slug) } },
        { id: `act-${slug}-dead`, label: `Clear dead deliveries · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} dead deliveries clear outbox`, confirm: true, perform: async () => { await api.clearDeadDeliveries(slug) } },
        { id: `act-${slug}-plan`, label: `Plan provisioning · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} provisioning plan job`, confirm: true, perform: async () => { await api.planProvisioning(slug) } },
        { id: `act-${slug}-deploy`, label: `Deploy latest · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} deploy provision release`, hint: 'latest version', confirm: true, perform: async () => { await api.deployTenant(slug) } },
        { id: `act-${slug}-cancel`, label: `Cancel provisioning job · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} provisioning cancel job`, confirm: true, perform: async () => { await api.cancelProvisioning(slug) } },
        { id: `act-${slug}-suspend`, label: `Suspend tenant · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} suspend pause disable`, hint: 'stops tenant traffic handling', confirm: true, perform: async () => { await api.suspend(slug) } },
        { id: `act-${slug}-resume`, label: `Resume tenant · ${slug}`, group: 'Actions', kind: 'mutate', keywords: `${slug} resume enable restore`, confirm: true, perform: async () => { await api.resume(slug) } },
      )
    }
    return list
  })

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return commands()
    const terms = q.split(/\s+/)
    return commands().filter(cmd => {
      const haystack = `${cmd.label} ${cmd.keywords ?? ''}`.toLowerCase()
      return terms.every(term => haystack.includes(term))
    })
  })

  createEffect(() => { filtered(); setIndex(current => Math.min(current, Math.max(0, filtered().length - 1))) })

  const active = () => filtered()[index()]

  async function execute(cmd: Cmd) {
    if (!cmd.perform) return
    if (busy() !== null) return
    if (cmd.confirm && armed() !== cmd.id) {
      setArmed(cmd.id)
      setMessage('')
      return
    }
    setArmed(null)
    setBusy(cmd.id)
    try {
      await cmd.perform()
      if (cmd.kind === 'navigate') { close(); return }
      setMessage(`✓ ${cmd.label}`)
    } catch (error) {
      setMessage(error instanceof Error ? `✕ ${error.message}` : `✕ ${cmd.label} failed`)
    } finally {
      setBusy(null)
    }
  }

  function close() {
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent) {
    // ⌘K / Ctrl-K is owned by Shell (it must work before this chunk loads).
    if (!open()) return
    if (event.key === 'Escape') { event.preventDefault(); close() }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(i => Math.min(i + 1, filtered().length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(i => Math.max(i - 1, 0)) }
    else if (event.key === 'Enter' && !event.shiftKey) {
      const cmd = active()
      if (cmd) { event.preventDefault(); void execute(cmd) }
    }
  }

  // The palette is Show-gated: mounted only while open. Bind and unbind the
  // key handler per mount so closed-palette sessions leave no listeners.
  onMount(() => {
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })

  return <Show when={open()}>
    <div class="cmdk-backdrop" onClick={close}>
      <div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onClick={event => event.stopPropagation()}>
        <input
          ref={inputRef}
          class="cmdk-input"
          placeholder="Type a page, tenant or action…"
          aria-label="Command palette search"
          value={query()}
          onInput={event => { setQuery(event.currentTarget.value); setArmed(null) }}
          spellcheck={false}
        />
        <div class="cmdk-list">
          <For each={filtered()} fallback={<div class="cmdk-empty">Nothing matches “{query()}”.</div>}>
            {(cmd, i) => (
              <button
                type="button"
                classList={{
                  'cmdk-item': true,
                  active: i() === index(),
                  danger: Boolean(cmd.confirm),
                  armed: armed() === cmd.id,
                }}
                onMouseEnter={() => setIndex(i())}
                onClick={() => void execute(cmd)}
              >
                <span class="cmdk-label">{armed() === cmd.id ? `Confirm: ${cmd.label}` : cmd.label}</span>
                <Show when={cmd.hint}><span class="cmdk-hint">{cmd.hint}</span></Show>
                <span class="cmdk-group">{cmd.group}</span>
              </button>
            )}
          </For>
        </div>
        <div class="cmdk-foot">
          <Show when={message()} fallback={
            <span class="cmdk-foot-hints">
              <span class="cmdk-foot-hint"><kbd>↑↓</kbd>navigate</span>
              <span class="cmdk-foot-sep">·</span>
              <span class="cmdk-foot-hint"><kbd>↵</kbd>run{active()?.confirm ? ' (twice to confirm)' : ''}</span>
              <span class="cmdk-foot-sep">·</span>
              <span class="cmdk-foot-hint"><kbd>esc</kbd>close</span>
            </span>
          }>
            <span>{message()}</span>
          </Show>
          {busy() !== null && <span class="cmdk-busy">running…</span>}
        </div>
      </div>
    </div>
  </Show>
}
