import { For, Show, createSignal, createMemo } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { toast } from '../lib/toast'
import type { AutomationEvent, AutomationWorkflowConfig } from '../lib/types'
import { EmptyState } from '../components/EmptyState'
import { SkeletonRows } from '../components/Skeleton'
import { SectionIcon } from '../components/SectionIcon'

const severityTone = (s: string) => s === 'error' ? 'bad' : s === 'warn' ? 'warn' : 'muted'
const statusTone = (s: string) => s === 'new' ? 'bad' : s === 'acknowledged' ? 'warn' : s === 'retried' ? 'warn' : 'muted'
const categoryLabel = (c: string) => c === 'real_work' ? 'Real work' : c === 'system' ? 'System' : 'Status'
const formatTime = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'recently'
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 0) return 'just now'
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString()
}

export function AutomationPage() {
  const params = useParams({ from: '/tenants/$slug/automation' })
  const slug = () => params().slug
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = createSignal<string>('')
  const [showConfigs, setShowConfigs] = createSignal(false)

  const events = useQuery(() => ({
    queryKey: ['automation-events', slug(), statusFilter()],
    queryFn: () => api.automationEvents(slug(), { limit: 100, status: statusFilter() || undefined }),
    reconcile: 'id',
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  }))
  const configs = useQuery(() => ({
    queryKey: ['automation-workflow-configs', slug()],
    queryFn: () => api.automationWorkflowConfigs(slug()),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  }))

  // When the slug changes, TanStack fetches the new tenant's data in the
  // background. Without reconcile/placeholderData the old data is dropped
  // immediately, so the Show fallback (skeleton) renders during the
  // switch instead of painting the wrong tenant's events.
  const eventsReady = () => events.data != null && !events.isPending
  const configsReady = () => configs.data != null && !configs.isPending

  const configMap = createMemo(() => {
    const m = new Map<string, AutomationWorkflowConfig>()
    for (const c of configs.data?.items ?? []) m.set(c.workflowId, c)
    return m
  })

  const newCount = () => events.data?.items.filter(e => e.status === 'new').length ?? 0
  const errorCount = () => events.data?.items.filter(e => e.severity === 'error').length ?? 0

  const invalidate = (scopeSlug: string) => {
    queryClient.invalidateQueries({ queryKey: ['automation-events', scopeSlug] })
    queryClient.invalidateQueries({ queryKey: ['automation-workflow-configs', scopeSlug] })
  }

  const [busyId, setBusyId] = createSignal<string | null>(null)

  const handleAck = async (id: string) => {
    if (busyId()) return
    const scopeSlug = slug()
    setBusyId(id)
    try { await api.ackAutomationEvent(scopeSlug, id); invalidate(scopeSlug) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to acknowledge') }
    finally { setBusyId(null) }
  }
  const handleResolve = async (id: string) => {
    if (busyId()) return
    const scopeSlug = slug()
    setBusyId(id)
    try { await api.resolveAutomationEvent(scopeSlug, id); invalidate(scopeSlug) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to resolve') }
    finally { setBusyId(null) }
  }
  const handleRetry = async (id: string) => {
    if (busyId()) return
    const scopeSlug = slug()
    setBusyId(id)
    try { await api.retryAutomationEvent(scopeSlug, id); invalidate(scopeSlug) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Retry failed') }
    finally { setBusyId(null) }
  }
  const handleConfigUpdate = async (workflowId: string, input: { category?: string; discordEnabled?: boolean; muted?: boolean }) => {
    if (busyId()) return
    const scopeSlug = slug()
    setBusyId(`cfg:${workflowId}`)
    try { await api.updateAutomationWorkflowConfig(scopeSlug, workflowId, input); invalidate(scopeSlug) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Update failed') }
    finally { setBusyId(null) }
  }

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">AUTOMATION</span>
        <h1>Automation events</h1>
        <p>n8n workflow outcomes — errors, status and heartbeat events. Real-work items route to Discord; everything else stays here.</p>
      </div>
      <div class="page-head-actions">
        <button class="ghost" classList={{ active: showConfigs() }} onClick={() => setShowConfigs(v => !v)}>
          {showConfigs() ? 'Back to events' : 'Workflow routing'}
        </button>
      </div>
    </div>

    <Show when={showConfigs()}>
      <div class="section-title"><div><span class="eyebrow">AUTOMATION</span><h2><SectionIcon name="workflow" />Workflow routing</h2><p>One row per n8n workflow, deciding what its events do when they arrive. <strong>Category</strong> sorts the event — only <em>real work</em> is worth waking someone for. <strong>Discord</strong> forwards it to the crew channel. <strong>Muted</strong> keeps the events recorded but stops them counting as new. Changes save as you make them.</p></div></div>
      <Show when={configs.error}><div class="error-card" role="alert">{errorMessage(configs.error, 'Automation routing could not be loaded')}</div></Show>
      <Show when={configsReady()} fallback={!configs.error ? <SkeletonRows count={3} /> : null}>
        <div class="automation-config-list">
          <For each={configs.data!.items}>{(cfg: AutomationWorkflowConfig) => (
            <div class="inherit-card automation-config-row">
              <div class="automation-config-info">
                <strong>{cfg.label}</strong>
                <small>{cfg.workflowId}</small>
              </div>
              <div class="automation-config-controls">
                <select
                  value={cfg.category}
                  disabled={busyId() !== null}
                  onChange={(e) => handleConfigUpdate(cfg.workflowId, { category: e.currentTarget.value })}
                >
                  <option value="status">Status</option>
                  <option value="real_work">Real work</option>
                  <option value="system">System</option>
                </select>
                <label class="toggle-row">
                  <input
                    type="checkbox"
                    disabled={busyId() !== null}
                    checked={cfg.discordEnabled}
                    onChange={(e) => handleConfigUpdate(cfg.workflowId, { discordEnabled: e.currentTarget.checked })}
                  />
                  <span>Discord</span>
                </label>
                <label class="toggle-row">
                  <input
                    type="checkbox"
                    disabled={busyId() !== null}
                    checked={cfg.muted}
                    onChange={(e) => handleConfigUpdate(cfg.workflowId, { muted: e.currentTarget.checked })}
                  />
                  <span>Muted</span>
                </label>
              </div>
            </div>
          )}</For>
          <Show when={configs.data!.items.length === 0}>
            <div class="inherit-card"><EmptyState label="No workflow events" hint="Workflow events appear here when automation rules fire. Connect event sources to start tracking." /></div>
          </Show>
        </div>
      </Show>
    </Show>

    <Show when={!showConfigs()}>
      <div class="kpi-strip">
        <article class="kpi-card kpi-bad">
          <span class="kpi-label">New events</span>
          <strong class="kpi-value tabular-nums">{newCount()}</strong>
          <span class="kpi-sub">unacknowledged</span>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">Errors</span>
          <strong class="kpi-value tabular-nums">{errorCount()}</strong>
          <span class="kpi-sub">in last 100</span>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">Workflows</span>
          <strong class="kpi-value tabular-nums">{configMap().size}</strong>
          <span class="kpi-sub">configured</span>
        </article>
      </div>

      <div class="section-title">
        <div><span class="eyebrow">EVENTS</span><h2><SectionIcon name="history" />Recent events</h2></div>
        <div class="filter-row">
          <select value={statusFilter()} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="retried">Retried</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      <Show when={events.error}><div class="error-card" role="alert">{errorMessage(events.error, 'Automation events could not be loaded')}</div></Show>
      <Show when={eventsReady()} fallback={!events.error ? <SkeletonRows count={5} /> : null}>
        <div class="automation-event-list">
          <For each={events.data!.items}>{(ev: AutomationEvent) => {
            const cfg = configMap().get(ev.workflowId)
            return (
              <div class="inherit-card automation-event-row" classList={{ 'automation-event-new': ev.status === 'new' }}>
                <div class="automation-event-head">
                  <span class={`severity-dot ${severityTone(ev.severity)}`} />
                  <strong>{ev.workflowName}</strong>
                  <span class="muted">{ev.eventKind}</span>
                  <Show when={cfg}><span class={`category-badge ${cfg!.category}`}>{categoryLabel(cfg!.category)}</span></Show>
                  <span class="muted time">{formatTime(ev.occurredAt)}</span>
                </div>
                <div class="automation-event-body">
                  <p>{ev.message}</p>
                  <Show when={ev.nodeName}><small class="muted">Node: {ev.nodeName}</small></Show>
                  <Show when={ev.executionId}><small class="muted">Execution: {ev.executionId}</small></Show>
                </div>
                <div class="automation-event-actions">
                  <span class={`status-badge ${statusTone(ev.status)}`}>{ev.status}</span>
                  <Show when={ev.retryCount > 0}><span class="muted">retried {ev.retryCount}×</span></Show>
                  <Show when={ev.status === 'new'}>
                    <button class="ghost alert-action" disabled={busyId() === ev.id} onClick={() => handleAck(ev.id)}>Ack</button>
                  </Show>
                  <Show when={ev.executionId && ev.status !== 'retried'}>
                    <button class="ghost alert-action" disabled={busyId() === ev.id} onClick={() => handleRetry(ev.id)}>Retry</button>
                  </Show>
                  <Show when={ev.status !== 'resolved'}>
                    <button class="ghost alert-action" disabled={busyId() === ev.id} onClick={() => handleResolve(ev.id)}>Resolve</button>
                  </Show>
                </div>
              </div>
            )
          }}</For>
          <Show when={events.data!.items.length === 0}>
            <div class="inherit-card"><EmptyState label="No events match this filter" hint="Try adjusting the event type or time range filter." /></div>
          </Show>
        </div>
      </Show>
    </Show>
  </section>
}
