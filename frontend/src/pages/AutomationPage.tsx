import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { errorMessage, relativeTime } from '../lib/format'
import { toast } from '../components/app/toast'
import type { AutomationEvent, AutomationWorkflowConfig } from '../lib/types'
import { EmptyState } from '../components/ui/empty-state'
import { Checkbox } from '../components/app/checkbox'
import { SkeletonRows } from '../components/Skeleton'
import { SectionIcon } from '../components/SectionIcon'
import { StatusBadge } from '../components/StatusBadge'
import { PageShell, PageHeader, KpiStrip, KpiCard, ErrorCard, Section, TabBar, TabPanel, useTabPanels } from '../components/layout'
import { Button } from '../components/app/button'
import { Badge } from '../components/app/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/app/table'
import { cn } from '../lib/cn'
import { NativeSelect } from '../components/ui/native-select'
import { writeGuard } from '../lib/read-only'

const TABS = ['events', 'routing'] as const

const severityTone = (s: string) => s === 'error' ? 'bad' : s === 'warn' ? 'warn' : 'muted'
const statusTone = (s: string) => s === 'new' ? 'bad' : s === 'acknowledged' || s === 'retried' ? 'warn' : s === 'resolved' ? 'good' : 'muted'
const categoryLabel = (c: string) => c === 'real_work' ? 'Real work' : c === 'system' ? 'System' : 'Status'
const formatTime = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'recently'
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString()
}

// n8n workflow outcomes for one tenant. Two views of the same system: the
// events it produced, and the per-workflow rules that decide what an event
// does. They used to be one page that swapped wholesale behind a ghost button
// in the header; they are two tabs now, so the current view is always named.
export function AutomationPage() {
  const params = useParams({ from: '/tenants/$slug/automation' })
  const slug = () => params().slug
  const queryClient = useQueryClient()
  // The id list makes `?tab=` deep links land on the right tab.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('events', [...TABS])
  const [statusFilter, setStatusFilter] = createSignal<string>('')

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
  // background. The Show fallback renders the skeleton during the switch
  // instead of painting the wrong tenant's events.
  const eventsReady = () => events.data != null && !events.isPending
  const configsReady = () => configs.data != null && !configs.isPending

  const configMap = createMemo(() => {
    const m = new Map<string, AutomationWorkflowConfig>()
    for (const c of configs.data?.items ?? []) m.set(c.workflowId, c)
    return m
  })

  const newCount = () => events.data?.items.filter(e => e.status === 'new').length ?? 0
  const errorCount = () => events.data?.items.filter(e => e.severity === 'error').length ?? 0
  const mutedCount = () => configs.data?.items.filter(c => c.muted).length ?? 0

  const invalidate = (scopeSlug: string) => {
    queryClient.invalidateQueries({ queryKey: ['automation-events', scopeSlug] })
    queryClient.invalidateQueries({ queryKey: ['automation-workflow-configs', scopeSlug] })
  }
  const refreshing = () => events.isFetching || configs.isFetching

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    const ts = Math.max(events.dataUpdatedAt, configs.dataUpdatedAt)
    return ts === 0 ? null : relativeTime(ts)
  })

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

  return <PageShell>
    <PageHeader
      title="Automation"
      description="What the n8n workflows did, and what each workflow's events are allowed to do. Real work routes to Discord; everything else stays here."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={() => invalidate(slug())} disabled={refreshing()} aria-label="Refresh">
            <RefreshCw class={cn(refreshing() && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    <KpiStrip>
      <KpiCard label="New events" value={eventsReady() ? newCount() : '—'} tone={newCount() > 0 ? 'warn' : 'default'} sub="not acknowledged yet" />
      <KpiCard label="Errors" value={eventsReady() ? errorCount() : '—'} tone={errorCount() > 0 ? 'bad' : 'default'} sub="in the last 100 events" />
      <KpiCard label="Workflows" value={configsReady() ? configMap().size : '—'} sub={mutedCount() > 0 ? `${mutedCount()} muted` : 'with routing rules'} />
    </KpiStrip>

    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'events', label: 'Events', count: () => newCount() },
        { id: 'routing', label: 'Workflow routing' },
      ]}
    />

    {/* ─── Events ─────────────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="events" visited={isVisited('events')}>
      <Section
        flush
        title="Recent events"
        icon={<SectionIcon name="history" />}
        count={events.data?.items.length}
        description="The latest 100 outcomes. Acknowledge what you have seen, retry a failed execution, resolve what is done."
        action={
          <NativeSelect class="w-auto" aria-label="Filter events by status" value={statusFilter()} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="retried">Retried</option>
            <option value="resolved">Resolved</option>
          </NativeSelect>
        }
      >
        <Show when={events.error}><ErrorCard>{errorMessage(events.error, 'Automation events could not be loaded')}</ErrorCard></Show>
        <Show when={eventsReady()} fallback={!events.error ? <SkeletonRows count={5} /> : null}>
          <Show when={events.data!.items.length > 0} fallback={
            // The copy used to say "no events match this filter" with no
            // filter set, and suggest a time-range filter the page never had.
            <Show when={statusFilter()} fallback={
              <EmptyState label="No automation events yet" hint="Events land here when an n8n workflow reports an error, a status change or a heartbeat." />
            }>
              <EmptyState label={`No ${statusFilter()} events`} hint="Choose All statuses to see every event." />
            </Show>
          }>
            <ul class="divide-y divide-border rounded-lg border border-border">
              <For each={events.data!.items}>{(ev: AutomationEvent) => {
                const cfg = () => configMap().get(ev.workflowId)
                return (
                  <li class="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div class="min-w-0 flex-1 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class={cn('inline-block size-2 shrink-0 rounded-full', severityTone(ev.severity) === 'bad' ? 'bg-destructive' : severityTone(ev.severity) === 'warn' ? 'bg-warning-foreground' : 'bg-muted-foreground')}
                          role="img"
                          aria-label={`severity ${ev.severity}`}
                        />
                        <strong class="text-sm text-foreground">{ev.workflowName}</strong>
                        <span class="text-xs text-muted-foreground">{ev.eventKind}</span>
                        <Show when={cfg()}>{c => <Badge variant={c().category === 'real_work' ? 'default' : 'outline'}>{categoryLabel(c().category)}</Badge>}</Show>
                      </div>
                      <p class="text-sm text-foreground">{ev.message}</p>
                      <p class="text-xs text-muted-foreground">
                        {formatTime(ev.occurredAt)}
                        <Show when={ev.nodeName}> · node {ev.nodeName}</Show>
                        <Show when={ev.executionId}> · execution {ev.executionId}</Show>
                        <Show when={ev.retryCount > 0}> · retried {ev.retryCount}×</Show>
                      </p>
                    </div>
                    <div class="flex shrink-0 flex-wrap items-center gap-2">
                      <StatusBadge status={ev.status} tone={statusTone(ev.status)} />
                      <Show when={ev.status === 'new'}>
                        <Button writes variant="outline" size="sm" disabled={busyId() === ev.id} onClick={() => handleAck(ev.id)}>Acknowledge</Button>
                      </Show>
                      <Show when={ev.executionId && ev.status !== 'retried'}>
                        <Button writes variant="ghost" size="sm" disabled={busyId() === ev.id} onClick={() => handleRetry(ev.id)}>Retry</Button>
                      </Show>
                      <Show when={ev.status !== 'resolved'}>
                        <Button writes variant="ghost" size="sm" disabled={busyId() === ev.id} onClick={() => handleResolve(ev.id)}>Resolve</Button>
                      </Show>
                    </div>
                  </li>
                )
              }}</For>
            </ul>
          </Show>
        </Show>
      </Section>
    </TabPanel>

    {/* ─── Workflow routing ───────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="routing" visited={isVisited('routing')}>
      <Section
        flush
        title="Workflow routing"
        icon={<SectionIcon name="workflow" />}
        count={configs.data?.items.length}
        description="One row per workflow. Category sorts its events, and only real work is worth waking someone for. Discord forwards them to the crew channel. Muted keeps them recorded without counting as new. Changes save as you make them."
      >
        <Show when={configs.error}><ErrorCard>{errorMessage(configs.error, 'Automation routing could not be loaded')}</ErrorCard></Show>
        <Show when={configsReady()} fallback={!configs.error ? <SkeletonRows count={3} /> : null}>
          <Show when={configs.data!.items.length > 0} fallback={
            <EmptyState label="No workflows yet" hint="A workflow appears here the first time it reports an event. Its routing starts as Status and can be changed here." />
          }>
            <div class="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Discord</TableHead>
                    <TableHead>Muted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={configs.data!.items}>{(cfg: AutomationWorkflowConfig) => (
                    <TableRow>
                      <TableCell>
                        <strong class="block text-foreground">{cfg.label}</strong>
                        <code class="text-xs text-muted-foreground">{cfg.workflowId}</code>
                      </TableCell>
                      <TableCell>
                        <NativeSelect
                          class="w-auto"
                          aria-label={`Category for ${cfg.label}`}
                          value={cfg.category}
                          disabled={busyId() !== null}
                          onChange={(e) => handleConfigUpdate(cfg.workflowId, { category: e.currentTarget.value })}
                          {...writeGuard()}
                        >
                          <option value="status">Status</option>
                          <option value="real_work">Real work</option>
                          <option value="system">System</option>
                        </NativeSelect>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          class="text-sm text-foreground"
                          disabled={busyId() !== null}
                          checked={cfg.discordEnabled}
                          onChange={(on) => handleConfigUpdate(cfg.workflowId, { discordEnabled: on })}
                          label="Forward"
                          {...writeGuard()}
                        />
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          class="text-sm text-foreground"
                          disabled={busyId() !== null}
                          checked={cfg.muted}
                          onChange={(on) => handleConfigUpdate(cfg.workflowId, { muted: on })}
                          label="Muted"
                          {...writeGuard()}
                        />
                      </TableCell>
                    </TableRow>
                  )}</For>
                </TableBody>
              </Table>
            </div>
          </Show>
        </Show>
      </Section>
    </TabPanel>
  </PageShell>
}
