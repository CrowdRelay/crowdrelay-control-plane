import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import type { NotifierChannel, NotifierEvent, DiscoveredEndpoint } from '../lib/types'
import { NOTIFIER_EVENTS } from '../lib/types'
import { errorMessage } from '../lib/format'

const kindLabel = (kind: NotifierChannel['kind']) =>
  kind === 'discord' ? 'Discord webhook' : kind === 'webhook' ? 'Generic webhook' : 'Email (relay)'
const eventLabel = (event: string) => event.replaceAll('.', ' ')

export function TenantNotifiersPage() {
  const params = useParams({ from: '/tenants/$slug/notifiers' })
  const slug = () => params().slug
  const queryClient = useQueryClient()
  const channels = useQuery(() => ({ queryKey: ['notifiers', slug()], queryFn: () => api.notifiers(slug()) }))
  const discovered = useQuery(() => ({ queryKey: ['notifiers-discovered', slug()], queryFn: () => api.discoveredEndpoints(slug()) }))

  const [kind, setKind] = createSignal<NotifierChannel['kind']>('discord')
  const [label, setLabel] = createSignal('')
  const [target, setTarget] = createSignal('')
  const [events, setEvents] = createSignal<string[]>([])
  const [notice, setNotice] = createSignal('')
  const [testResult, setTestResult] = createSignal<Record<string, string>>({})

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifiers', slug()] })
  const toggleEvent = (event: NotifierEvent) =>
    setEvents(current => current.includes(event) ? current.filter(item => item !== event) : [...current, event])

  const targetLabel = () => kind() === 'email_relay' ? 'Recipient email' : 'Webhook URL'
  const targetPlaceholder = () => kind() === 'discord'
    ? 'https://discord.com/api/webhooks/…'
    : kind() === 'webhook'
      ? 'https://ops.example.com/hooks/crowdrelay'
      : 'alerts@future-metal.example'
  const formReady = () => label().trim().length >= 2 && (
    kind() === 'email_relay'
      ? /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(target().trim())
      : target().trim().startsWith('https://')
  )

  const create = useMutation(() => ({
    mutationFn: () => api.createNotifier(slug(), {
      kind: kind(), label: label().trim(),
      url: kind() === 'email_relay' ? undefined : target().trim(),
      events: events(),
      enabled: true,
    }),
    onSuccess: async () => {
      await refresh()
      setNotice(`${label().trim()} added.`)
      setLabel(''); setTarget(''); setEvents([])
    },
  }))
  const update = useMutation(() => ({
    mutationFn: (input: { id: string; enabled?: boolean }) =>
      api.updateNotifier(slug(), input.id, { enabled: input.enabled }),
    onSuccess: refresh,
  }))
  const remove = useMutation(() => ({
    mutationFn: (id: string) => api.deleteNotifier(slug(), id),
    onSuccess: refresh,
  }))
  const test = useMutation(() => ({
    mutationFn: async (id: string) => {
      try {
        const result = await api.testNotifier(slug(), id)
        return result.ok ? '' : (result.error ?? 'delivery failed')
      } catch (error) {
        return errorMessage(error, 'test delivery failed')
      }
    },
    onMutate: (id) => setTestResult(current => ({ ...current, [id]: 'testing…' })),
    onSuccess: (error, id) => setTestResult(current => ({ ...current, [id]: error ? `failed: ${error}` : 'delivered ✓' })),
  }))

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">END NOTIFIERS</span>
        <h1>Notification channels</h1>
        <p>Where this tenant's alerts land: provisioning failures and runtime health changes. Delivery is best-effort with bounded retries; endpoints belong to your own infrastructure.</p>
      </div>
    </div>

    <Show when={notice()}><div class="notice-card">{notice()}</div></Show>
    <Show when={channels.error}><div class="error-card" role="alert">{errorMessage(channels.error, 'Channels could not be loaded')}</div></Show>

    <Show when={discovered.data && discovered.data.endpoints.length > 0}>
      <div class="panel">
        <div class="section-title">
          <div><span class="eyebrow">CROWDRELAY</span><h2>Discovered webhook endpoints</h2><p>Outbound webhook delivery targets already configured in this tenant's CrowdRelay instance. These are not notifier channels — they are the existing delivery infrastructure the tenant's outbox events flow through.</p></div>
        </div>
        <table class="data-table">
          <thead><tr><th>Name</th><th>Target</th><th>Active</th></tr></thead>
          <tbody>
            <For each={discovered.data?.endpoints ?? []}>{(ep: DiscoveredEndpoint) => (
              <tr>
                <td>{ep.name}</td>
                <td><code>{ep.urlHost}</code></td>
                <td><span class={`status-badge ${ep.active ? 'good' : 'muted'}`}>{ep.active ? 'active' : 'inactive'}</span></td>
              </tr>
            )}</For>
          </tbody>
        </table>
      </div>
    </Show>
    <Show when={discovered.error}>
      <div class="muted">CrowdRelay webhook endpoints unavailable: {errorMessage(discovered.error, 'read failed')}</div>
    </Show>

    <form class="tenant-create-form" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
      <div class="form-section-head"><div><span class="eyebrow">NEW CHANNEL</span><h2>Add a destination</h2></div></div>
      <div class="form-grid">
        <label>Type<select value={kind()} onChange={(e) => { setKind(e.currentTarget.value as NotifierChannel['kind']); setTarget('') }}>
          <option value="discord">Discord webhook</option>
          <option value="webhook">Generic webhook</option>
          <option value="email_relay">Email via platform relay</option>
        </select></label>
        <label>Label<input value={label()} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Ops Discord" /></label>
        <label style={{ 'grid-column': '1 / -1' }}>{targetLabel()}<input value={target()} onInput={(e) => setTarget(e.currentTarget.value)} placeholder={targetPlaceholder()} /></label>
      </div>
      <div class="check-row-group" role="group" aria-label="Subscribed events">
        <For each={[...NOTIFIER_EVENTS]}>{event =>
          <label class="check-row"><input type="checkbox" checked={events().includes(event)} onChange={() => toggleEvent(event)} /><span><strong>{eventLabel(event)}</strong><small>{events().length ? '' : 'no selection = all events'}</small></span></label>
        }</For>
      </div>
      <Show when={create.error}><div class="error-card" role="alert">{errorMessage(create.error, 'Channel creation failed')}</div></Show>
      <div class="form-actions right"><button type="submit" disabled={create.isPending || !formReady()}>{create.isPending ? 'Adding…' : 'Add channel'}</button></div>
    </form>

    <Show when={channels.data} fallback={!channels.error ? <div class="mini-skeleton"/> : null}>
      <div class="notifier-list"><For each={channels.data?.items ?? []}>{channel =>
        <div class="notifier-row">
          <div class="notifier-meta">
            <strong>{channel.label}</strong>
            <small>{kindLabel(channel.kind)} · {channel.config.to ?? channel.config.urlHost ?? 'endpoint'} · {channel.events.length ? channel.events.map(eventLabel).join(', ') : 'all events'}</small>
            <Show when={testResult()[channel.id]}><small class={testResult()[channel.id]?.includes('failed') ? 'notifier-test-bad' : 'notifier-test-ok'}>{testResult()[channel.id]}</small></Show>
          </div>
          <div class="row-health">
            <button type="button" class="ghost" disabled={test.isPending} onClick={() => test.mutateAsync(channel.id)}>Send test</button>
            <button type="button" class={`switch-control ${channel.enabled ? 'on' : ''}`} role="switch" aria-checked={channel.enabled} aria-label={`${channel.label} enabled`} onClick={() => update.mutate({ id: channel.id, enabled: !channel.enabled })}><span /></button>
            <button type="button" class="danger-ghost" onClick={() => { if (confirm(`Delete channel “${channel.label}”?`)) remove.mutate(channel.id) }}>Delete</button>
          </div>
        </div>
      }</For></div>
    </Show>
  </section>
}
