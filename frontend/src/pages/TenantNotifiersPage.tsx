import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { toast } from '../lib/toast'
import type { NotifierChannel, NotifierEvent, DiscoveredEndpoint, PlatformConfigItem, AutomationRoutingItem } from '../lib/types'
import { NOTIFIER_EVENTS } from '../lib/types'
import { errorMessage } from '../lib/format'
import { NotifierIcon } from '../components/ProviderIcon'
import { EmptyState } from '../components/EmptyState'
import { SkeletonNotifiersPage, SkeletonSection } from '../components/Skeleton'
import { confirmAction } from '../components/Dialog'

const kindLabel = (k: NotifierChannel['kind']) => k === 'discord' ? 'Discord app' : k === 'webhook' ? 'Webhook' : 'Email (relay)'
const evLabel = (e: string) => e.replaceAll('.', ' ')

const platformTypeLabel = (t: string) => {
  switch (t) {
    case 'discord_automation_webhook': return 'Discord automation webhook'
    case 'email_relay': return 'Email relay'
    case 'n8n_base_url': return 'n8n base URL'
    default: return t
  }
}

const provenanceBadge = (source: string, owner: string) =>
  <span class="provenance-badge"><small class="muted">{source}</small> · <small class="muted">{owner}</small></span>


// The environment variable behind each platform notifier.
//
// "not configured" with no variable name is a dead end: it reports a fact and
// gives the operator nowhere to go. Worse, these are easy to believe are set —
// Discord and n8n are both configured elsewhere in this system, so the panel
// reads as broken rather than as an unset variable.
//
// They are interpolated by compose from `.env` in the deployment directory.
// A variable that is absent there becomes an empty string via `${VAR:-}` and
// silently overrides anything an env_file provides, which is exactly how these
// three ended up empty while a file on the same server held real values.
const PLATFORM_ENV_VAR: Record<string, string> = {
  discord_automation_webhook: 'CONTROL_PLANE_DISCORD_AUTOMATION_WEBHOOK_URL',
  email_relay: 'CONTROL_PLANE_NOTIFY_EMAIL_RELAY_URL',
  n8n_base_url: 'CONTROL_PLANE_N8N_BASE_URL',
}

export function TenantNotifiersPage() {
  const params = useParams({ from: '/tenants/$slug/notifiers' })
  const slug = () => params().slug
  const qc = useQueryClient()
  const channels = useQuery(() => ({ queryKey: ['notifiers', slug(), refreshTick()], queryFn: () => api.notifiers(slug()), refetchOnWindowFocus: false, reconcile: 'id', staleTime: 20_000 }))
  const discovered = useQuery(() => ({ queryKey: ['notifiers-discovered', slug(), refreshTick()], queryFn: () => api.discoveredEndpoints(slug()), refetchOnWindowFocus: false, reconcile: 'id', staleTime: 20_000 }))
  const platformConfig = useQuery(() => ({ queryKey: ['notifier-platform-config', slug(), refreshTick()], queryFn: () => api.notifierPlatformConfig(slug()), refetchOnWindowFocus: false, staleTime: 20_000 }))
  const automationRouting = useQuery(() => ({ queryKey: ['notifier-automation-routing', slug(), refreshTick()], queryFn: () => api.notifierAutomationRouting(slug()), refetchOnWindowFocus: false, staleTime: 20_000 }))

  const [kind, setKind] = createSignal<NotifierChannel['kind']>('discord')
  const [label, setLabel] = createSignal('')
  const [target, setTarget] = createSignal('')
  const [events, setEvents] = createSignal<string[]>([])
  const [testResult, setTestResult] = createSignal<Record<string, string>>({})

  const refresh = () => { qc.invalidateQueries({ queryKey: ['notifiers', slug()] }); qc.invalidateQueries({ queryKey: ['notifiers-discovered', slug()] }); qc.invalidateQueries({ queryKey: ['notifier-platform-config', slug()] }); qc.invalidateQueries({ queryKey: ['notifier-automation-routing', slug()] }) }
  const toggleEvent = (e: NotifierEvent) => setEvents(c => c.includes(e) ? c.filter(i => i !== e) : [...c, e])
  const targetLabel = () => kind() === 'email_relay' ? 'Recipient email' : 'Webhook URL'
  const targetPh = () => kind() === 'discord' ? 'https://discord.com/api/webhooks/…' : kind() === 'webhook' ? 'https://ops.example.com/hooks/crowdrelay' : 'alerts@future-metal.example'
  const formReady = () => label().trim().length >= 2 && (kind() === 'email_relay' ? /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(target().trim()) : target().trim().startsWith('https://'))

  const create = useMutation(() => ({ mutationFn: () => api.createNotifier(slug(), { kind: kind(), label: label().trim(), url: kind() === 'email_relay' ? undefined : target().trim(), events: events(), enabled: true }), onSuccess: async () => { await refresh(); toast.success(`${label().trim()} added.`); setLabel(''); setTarget(''); setEvents([]) } }))
  const update = useMutation(() => ({ mutationFn: (i: { id: string; enabled?: boolean }) => api.updateNotifier(slug(), i.id, { enabled: i.enabled }), onSuccess: refresh }))
  const syncRouting = useMutation(() => ({
    mutationFn: () => api.syncNotifierAutomationRouting(slug()),
    onSuccess: (result) => {
      refresh()
      toast.success(
        result.skipped > 0
          ? `Synced ${result.synced} workflows, skipped ${result.skipped}.`
          : `Synced ${result.synced} workflows from n8n.`,
      )
    },
    onError: (error) => toast.error(errorMessage(error, 'n8n sync failed')),
  }))
  const remove = useMutation(() => ({ mutationFn: (id: string) => api.deleteNotifier(slug(), id), onSuccess: () => { refresh(); toast.success('Notifier removed.') } }))
  const test = useMutation(() => ({ mutationFn: async (id: string) => { try { const r = await api.testNotifier(slug(), id); return r.ok ? '' : (r.error ?? 'delivery failed') } catch (e) { return errorMessage(e, 'test delivery failed') } }, onMutate: (id) => setTestResult(c => ({ ...c, [id]: 'testing…' })), onSuccess: (err, id) => { setTestResult(c => ({ ...c, [id]: err ? `failed: ${err}` : 'delivered ✓' })); if (err) toast.error(`Test delivery failed: ${err}`) } }))

  const items = () => channels.data?.items ?? []
  const platformItems = () => platformConfig.data?.items ?? []
  const routingItems = () => automationRouting.data?.items ?? []

  return <section class="page">
    <div class="page-head"><div><span class="eyebrow">SYSTEM</span><h1>Notification topology</h1><p>Where this tenant's alerts land and how they get there. Three layers: tenant channels, platform config, and automation routing. Delivery is best-effort with bounded retries; endpoints belong to your own infrastructure.</p></div></div>

    {/* ── TENANT / VIRYA ─────────────────────────────────────────── */}
    <Show when={channels.error}><div class="error-card" role="alert">{errorMessage(channels.error, 'Channels could not be loaded')}</div></Show>
    <Show when={!channels.error && channels.isPending}><SkeletonNotifiersPage /></Show>
    <Show when={channels.data} fallback={!channels.error ? null : undefined}>
      <article class="panel">
        <div class="section-title"><div><span class="eyebrow">TENANT / {slug().toUpperCase()}</span><h2>Active destinations</h2></div><Show when={items().length > 0}><small class="muted">{items().length} configured</small></Show></div>
        <p class="agent-section-intro">Per-tenant notifier channels. <strong>source:</strong> database · <strong>owner:</strong> tenant · <strong>path:</strong> direct or relay</p>
        <Show when={items().length === 0} fallback={<div class="notifier-list"><For each={items()}>{ch => <div class="notifier-row">
          <div class="notifier-meta notifier-meta-with-icon"><NotifierIcon kind={ch.kind} size={20} class="provider-icon" /><div><strong>{ch.label}</strong><small>{kindLabel(ch.kind)} · {ch.config.to ?? ch.config.urlHost ?? 'endpoint'} · {ch.events.length ? ch.events.map(evLabel).join(', ') : 'all events'}</small><Show when={testResult()[ch.id]}><small class={testResult()[ch.id]?.includes('failed') ? 'notifier-test-bad' : 'notifier-test-ok'}>{testResult()[ch.id]}</small></Show></div></div>
          <div class="row-health"><button type="button" class="ghost" disabled={test.isPending} onClick={() => test.mutateAsync(ch.id)}>Send test</button><button type="button" class={`switch-control ${ch.enabled ? 'on' : ''}`} role="switch" aria-checked={ch.enabled} aria-label={`${ch.label} enabled`} onClick={() => update.mutate({ id: ch.id, enabled: !ch.enabled })}><span /></button><button type="button" class="danger-ghost" onClick={async () => {
            const ok = await confirmAction({
              title: `Delete channel “${ch.label}”?`,
              body: 'Alerts routed to this channel stop being delivered.',
              confirmLabel: 'Delete channel',
              destructive: true,
            })
            if (ok) remove.mutate(ch.id)
          }}>Delete</button></div>
        </div>}</For></div>}><div class="inherit-card"><EmptyState label="No notification channels" hint="Add a destination below to start receiving operational alerts." /></div></Show>
      </article>
    </Show>

    {/* ── PLATFORM / CONTROL PLANE ───────────────────────────────── */}
    <Show when={platformConfig.error}><article class="panel"><div class="error-card" role="alert">{errorMessage(platformConfig.error, 'Platform config could not be loaded')}</div></article></Show>
    <Show when={!platformConfig.error && platformConfig.isPending}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={platformConfig.data}>
      <article class="panel">
        <div class="section-title"><div><span class="eyebrow">PLATFORM / CONTROL PLANE</span><h2>Platform notification config</h2></div></div>
        <p class="agent-section-intro">Environment-level notification routing. <strong>source:</strong> environment · <strong>owner:</strong> platform · <strong>path:</strong> direct, relay, or workflow</p>
        <p class="agent-section-intro muted">These are separate from any Discord or n8n you have configured elsewhere — each is read from its own variable in the control plane's deployment environment, and an unset one shows the variable to set.</p>
        <table class="data-table">
          <thead><tr><th>Type</th><th>Source</th><th>Owner</th><th>Path</th><th>Destination</th><th>Status</th></tr></thead>
          <tbody>
            <For each={platformItems()}>{(item: PlatformConfigItem) => <tr>
              <td>{platformTypeLabel(item.type)}</td>
              <td><small class="muted">{item.source}</small></td>
              <td><small class="muted">{item.owner}</small></td>
              <td><small class="muted">{item.path}</small></td>
              <td>
                <Show when={item.destination} fallback={
                  <small class="muted">set <code>{PLATFORM_ENV_VAR[item.type] ?? item.type}</code> in the deployment's <code>.env</code></small>
                }>
                  <code>{item.destination}</code>
                </Show>
              </td>
              <td><span class={`status-badge ${item.configured && item.enabled ? 'good' : 'muted'}`}>{item.configured ? (item.enabled ? 'enabled' : 'disabled') : 'not configured'}</span></td>
            </tr>}</For>
          </tbody>
        </table>
      </article>
    </Show>

    {/* ── AUTOMATION / N8N ───────────────────────────────────────── */}
    <Show when={automationRouting.error}><article class="panel"><div class="error-card" role="alert">{errorMessage(automationRouting.error, 'Automation routing could not be loaded')}</div></article></Show>
    <Show when={!automationRouting.error && automationRouting.isPending}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={automationRouting.data}>
      <article class="panel">
        <div class="section-title"><div><span class="eyebrow">AUTOMATION / N8N</span><h2>Workflow routing configs</h2></div><div class="row-health"><Show when={routingItems().length > 0}><small class="muted">{routingItems().length} workflows</small></Show><button type="button" class="ghost" disabled={syncRouting.isPending} onClick={() => syncRouting.mutate()}>{syncRouting.isPending ? 'Syncing…' : 'Sync from n8n'}</button></div></div>
        <p class="agent-section-intro">n8n workflow routing with Discord forwarding and mute controls. <strong>source:</strong> database · <strong>owner:</strong> automation · <strong>path:</strong> workflow</p>
        <Show when={routingItems().length === 0}>
          <div class="inherit-card">
            <EmptyState
              label="No workflows mirrored yet"
              hint="n8n owns the workflows; this table is the control plane's copy. Sync to pull the live list in, then mute the ones you do not want reported."
            />
          </div>
        </Show>
        <Show when={routingItems().length > 0}>
        <table class="data-table">
          <thead><tr><th>Workflow</th><th>Label</th><th>Category</th><th>Discord</th><th>Muted</th><th>Status</th></tr></thead>
          <tbody>
            <For each={routingItems()}>{(item: AutomationRoutingItem) => <tr>
              <td><code>{item.workflowId}</code></td>
              <td>{item.label}</td>
              <td><small class="muted">{item.category}</small></td>
              <td>{item.discordEnabled ? '✓' : '—'}</td>
              <td>{item.muted ? 'muted' : '—'}</td>
              <td><span class={`status-badge ${item.enabled ? 'good' : 'muted'}`}>{item.enabled ? 'enabled' : 'muted'}</span></td>
            </tr>}</For>
          </tbody>
        </table>
        </Show>
      </article>
    </Show>

    {/* ── Discovered webhook endpoints ───────────────────────────── */}
    <Show when={discovered.error}><article class="panel"><div class="section-title"><div><span class="eyebrow">CROWDRELAY</span><h2>Discovered webhook endpoints</h2></div></div><div class="inherit-card"><p>CrowdRelay webhook endpoints unavailable: {errorMessage(discovered.error, 'read failed')}</p></div></article></Show>
    <Show when={!discovered.error && discovered.isPending}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={discovered.data && discovered.data.endpoints.length > 0}><article class="panel"><div class="section-title"><div><span class="eyebrow">CROWDRELAY</span><h2>Discovered webhook endpoints</h2><p>Outbound webhook delivery targets already configured in this tenant's CrowdRelay instance.</p></div></div><table class="data-table"><thead><tr><th>Name</th><th>Target</th><th>Active</th></tr></thead><tbody><For each={discovered.data?.endpoints ?? []}>{(ep: DiscoveredEndpoint) => <tr><td>{ep.name}</td><td><code>{ep.urlHost}</code></td><td><span class={`status-badge ${ep.active ? 'good' : 'muted'}`}>{ep.active ? 'active' : 'inactive'}</span></td></tr>}</For></tbody></table></article></Show>

    {/* ── Create form ────────────────────────────────────────────── */}
    <form class="tenant-create-form" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
      <div class="form-section-head"><div><span class="eyebrow">NEW CHANNEL</span><h2>Add a destination</h2></div></div>
      <div class="form-grid">
        <label>Type<select value={kind()} onChange={(e) => { setKind(e.currentTarget.value as NotifierChannel['kind']); setTarget('') }}><option value="discord">Discord app</option><option value="webhook">Generic webhook</option><option value="email_relay">Email via platform relay</option></select></label>
        <label>Label<input value={label()} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Ops Discord" /></label>
        <label style={{ 'grid-column': '1 / -1' }}>{targetLabel()}<input value={target()} onInput={(e) => setTarget(e.currentTarget.value)} placeholder={targetPh()} /></label>
      </div>
      <div class="check-row-group" role="group" aria-label="Subscribed events">
        <For each={[...NOTIFIER_EVENTS]}>{ev => <label class="check-row"><input type="checkbox" checked={events().includes(ev)} onChange={() => toggleEvent(ev)} /><span><strong>{evLabel(ev)}</strong></span></label>}</For>
        <Show when={!events().length}><small class="check-row-hint">No selection = all events</small></Show>
      </div>
      <Show when={create.error}><div class="error-card" role="alert">{errorMessage(create.error, 'Channel creation failed')}</div></Show>
      <div class="form-actions right"><button type="submit" disabled={create.isPending || !formReady()}>{create.isPending ? 'Adding…' : 'Add channel'}</button></div>
    </form>
  </section>
}
