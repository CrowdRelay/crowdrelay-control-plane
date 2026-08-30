import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { toast } from '../lib/toast'
import type { NotifierChannel, NotifierEvent, DiscoveredEndpoint } from '../lib/types'
import { NOTIFIER_EVENTS } from '../lib/types'
import { errorMessage } from '../lib/format'
import { NotifierIcon } from '../components/ProviderIcon'
import { EmptyState } from '../components/EmptyState'

const kindLabel = (k: NotifierChannel['kind']) => k === 'discord' ? 'Discord app' : k === 'webhook' ? 'Webhook' : 'Email (relay)'
const evLabel = (e: string) => e.replaceAll('.', ' ')

export function TenantNotifiersPage() {
  const params = useParams({ from: '/tenants/$slug/notifiers' })
  const slug = () => params().slug
  const qc = useQueryClient()
  const channels = useQuery(() => ({ queryKey: ['notifiers', slug(), refreshTick()], queryFn: () => api.notifiers(slug()), refetchOnWindowFocus: false, reconcile: 'id', staleTime: 20_000 }))
  const discovered = useQuery(() => ({ queryKey: ['notifiers-discovered', slug(), refreshTick()], queryFn: () => api.discoveredEndpoints(slug()), refetchOnWindowFocus: false, reconcile: 'id', staleTime: 20_000 }))

  const [kind, setKind] = createSignal<NotifierChannel['kind']>('discord')
  const [label, setLabel] = createSignal('')
  const [target, setTarget] = createSignal('')
  const [events, setEvents] = createSignal<string[]>([])
  const [testResult, setTestResult] = createSignal<Record<string, string>>({})

  const refresh = () => { qc.invalidateQueries({ queryKey: ['notifiers', slug()] }); qc.invalidateQueries({ queryKey: ['notifiers-discovered', slug()] }) }
  const toggleEvent = (e: NotifierEvent) => setEvents(c => c.includes(e) ? c.filter(i => i !== e) : [...c, e])
  const targetLabel = () => kind() === 'email_relay' ? 'Recipient email' : 'Webhook URL'
  const targetPh = () => kind() === 'discord' ? 'https://discord.com/api/webhooks/…' : kind() === 'webhook' ? 'https://ops.example.com/hooks/crowdrelay' : 'alerts@future-metal.example'
  const formReady = () => label().trim().length >= 2 && (kind() === 'email_relay' ? /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(target().trim()) : target().trim().startsWith('https://'))

  const create = useMutation(() => ({ mutationFn: () => api.createNotifier(slug(), { kind: kind(), label: label().trim(), url: kind() === 'email_relay' ? undefined : target().trim(), events: events(), enabled: true }), onSuccess: async () => { await refresh(); toast.success(`${label().trim()} added.`); setLabel(''); setTarget(''); setEvents([]) } }))
  const update = useMutation(() => ({ mutationFn: (i: { id: string; enabled?: boolean }) => api.updateNotifier(slug(), i.id, { enabled: i.enabled }), onSuccess: refresh }))
  const remove = useMutation(() => ({ mutationFn: (id: string) => api.deleteNotifier(slug(), id), onSuccess: () => { refresh(); toast.success('Notifier removed.') } }))
  const test = useMutation(() => ({ mutationFn: async (id: string) => { try { const r = await api.testNotifier(slug(), id); return r.ok ? '' : (r.error ?? 'delivery failed') } catch (e) { return errorMessage(e, 'test delivery failed') } }, onMutate: (id) => setTestResult(c => ({ ...c, [id]: 'testing…' })), onSuccess: (err, id) => { setTestResult(c => ({ ...c, [id]: err ? `failed: ${err}` : 'delivered ✓' })); if (err) toast.error(`Test delivery failed: ${err}`) } }))

  const items = () => channels.data?.items ?? []

  return <section class="page">
    <div class="page-head"><div><span class="eyebrow">TENANT / {slug().toUpperCase()}</span><h1>Notification channels</h1><p>Where this tenant's alerts land: provisioning failures and runtime health changes. Delivery is best-effort with bounded retries; endpoints belong to your own infrastructure.</p></div></div>

    {/* Active channels */}
    <Show when={channels.error}><div class="error-card" role="alert">{errorMessage(channels.error, 'Channels could not be loaded')}</div></Show>
    <Show when={!channels.error && channels.isPending}><div class="skeleton-block" /></Show>
    <Show when={channels.data} fallback={!channels.error ? null : undefined}>
      <article class="panel">
        <div class="section-title"><div><span class="eyebrow">CHANNELS</span><h2>Active destinations</h2></div><Show when={items().length > 0}><small class="muted">{items().length} configured</small></Show></div>
        <Show when={items().length === 0} fallback={<div class="notifier-list"><For each={items()}>{ch => <div class="notifier-row">
          <div class="notifier-meta notifier-meta-with-icon"><NotifierIcon kind={ch.kind} size={20} class="provider-icon" /><div><strong>{ch.label}</strong><small>{kindLabel(ch.kind)} · {ch.config.to ?? ch.config.urlHost ?? 'endpoint'} · {ch.events.length ? ch.events.map(evLabel).join(', ') : 'all events'}</small><Show when={testResult()[ch.id]}><small class={testResult()[ch.id]?.includes('failed') ? 'notifier-test-bad' : 'notifier-test-ok'}>{testResult()[ch.id]}</small></Show></div></div>
          <div class="row-health"><button type="button" class="ghost" disabled={test.isPending} onClick={() => test.mutateAsync(ch.id)}>Send test</button><button type="button" class={`switch-control ${ch.enabled ? 'on' : ''}`} role="switch" aria-checked={ch.enabled} aria-label={`${ch.label} enabled`} onClick={() => update.mutate({ id: ch.id, enabled: !ch.enabled })}><span /></button><button type="button" class="danger-ghost" onClick={() => { if (confirm(`Delete channel "${ch.label}"?`)) remove.mutate(ch.id) }}>Delete</button></div>
        </div>}</For></div>}><div class="inherit-card"><EmptyState label="No notification channels" hint="Add a destination below to start receiving operational alerts." /></div></Show>
      </article>
    </Show>

    {/* Discovered webhook endpoints */}
    <Show when={discovered.error}><article class="panel"><div class="section-title"><div><span class="eyebrow">CROWDRELAY</span><h2>Discovered webhook endpoints</h2></div></div><div class="inherit-card"><p>CrowdRelay webhook endpoints unavailable: {errorMessage(discovered.error, 'read failed')}</p></div></article></Show>
    <Show when={!discovered.error && discovered.isPending}><div class="skeleton-block" /></Show>
    <Show when={discovered.data && discovered.data.endpoints.length > 0}><article class="panel"><div class="section-title"><div><span class="eyebrow">CROWDRELAY</span><h2>Discovered webhook endpoints</h2><p>Outbound webhook delivery targets already configured in this tenant's CrowdRelay instance.</p></div></div><table class="data-table"><thead><tr><th>Name</th><th>Target</th><th>Active</th></tr></thead><tbody><For each={discovered.data?.endpoints ?? []}>{(ep: DiscoveredEndpoint) => <tr><td>{ep.name}</td><td><code>{ep.urlHost}</code></td><td><span class={`status-badge ${ep.active ? 'good' : 'muted'}`}>{ep.active ? 'active' : 'inactive'}</span></td></tr>}</For></tbody></table></article></Show>

    {/* Create form */}
    <form class="tenant-create-form" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
      <div class="form-section-head"><div><span class="eyebrow">NEW CHANNEL</span><h2>Add a destination</h2></div></div>
      <div class="form-grid">
        <label>Type<select value={kind()} onChange={(e) => { setKind(e.currentTarget.value as NotifierChannel['kind']); setTarget('') }}><option value="discord">Discord app</option><option value="webhook">Generic webhook</option><option value="email_relay">Email via platform relay</option></select></label>
        <label>Label<input value={label()} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Ops Discord" /></label>
        <label style={{ 'grid-column': '1 / -1' }}>{targetLabel()}<input value={target()} onInput={(e) => setTarget(e.currentTarget.value)} placeholder={targetPh()} /></label>
      </div>
      <div class="check-row-group" role="group" aria-label="Subscribed events"><For each={[...NOTIFIER_EVENTS]}>{ev => <label class="check-row"><input type="checkbox" checked={events().includes(ev)} onChange={() => toggleEvent(ev)} /><span><strong>{evLabel(ev)}</strong><small>{events().length ? '' : 'no selection = all events'}</small></span></label>}</For></div>
      <Show when={create.error}><div class="error-card" role="alert">{errorMessage(create.error, 'Channel creation failed')}</div></Show>
      <div class="form-actions right"><button type="submit" disabled={create.isPending || !formReady()}>{create.isPending ? 'Adding…' : 'Add channel'}</button></div>
    </form>
  </section>
}
