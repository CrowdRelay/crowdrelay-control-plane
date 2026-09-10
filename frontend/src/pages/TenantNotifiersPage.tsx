import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import type { NotifierChannel, NotifierEvent, DiscoveredEndpoint, PlatformConfigItem, AutomationRoutingItem, NotifiersOverview } from '../lib/types'
import { NOTIFIER_EVENTS, NOTIFIER_EVENT_LABELS } from '../lib/types'
import { SectionIcon } from '../components/SectionIcon'
import { errorMessage } from '../lib/format'
import { NotifierIcon } from '../components/ProviderIcon'
import { EmptyState } from '../components/EmptyState'
import { SkeletonNotifiersPage, SkeletonSection } from '../components/Skeleton'
import { confirmAction } from '../components/Dialog'
import { Spinner } from '../components/Spinner'
import { PageShell, PageHeader, ErrorCard, SectionPanel } from '../components/layout'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'

const kindLabel = (k: NotifierChannel['kind']) => k === 'discord' ? 'Discord app' : k === 'webhook' ? 'Webhook' : 'Email (relay)'
const evLabel = (e: string) => NOTIFIER_EVENT_LABELS[e as NotifierEvent] ?? e.replaceAll('.', ' ')

const platformTypeLabel = (t: string) => {
  switch (t) {
    case 'discord_automation_webhook': return 'Discord automation webhook'
    case 'email_relay': return 'Email relay'
    case 'n8n_base_url': return 'n8n base URL'
    default: return t
  }
}

const PLATFORM_ENV_VAR: Record<string, string> = {
  discord_automation_webhook: 'CONTROL_PLANE_DISCORD_AUTOMATION_WEBHOOK_URL',
  email_relay: 'CONTROL_PLANE_NOTIFY_EMAIL_RELAY_URL',
  n8n_base_url: 'CONTROL_PLANE_N8N_BASE_URL',
}

export function TenantNotifiersPage() {
  const params = useParams({ from: '/tenants/$slug/notifiers' })
  const slug = () => params().slug
  const qc = useQueryClient()
  const overview = useQuery(() => ({ queryKey: ['notifiers-overview', slug()], queryFn: () => api.notifiersOverview(slug()), refetchOnWindowFocus: false, staleTime: 20_000 }))

  const section = <T,>(pick: (o: NotifiersOverview) => { error?: string } | undefined, take: (o: NotifiersOverview) => T | undefined) => ({
    get data() { const o = overview.data; return o && !pick(o)?.error ? take(o) : undefined },
    get error() { const o = overview.data; return overview.error ?? (o && pick(o)?.error ? new Error(pick(o)!.error) : undefined) },
    get isPending() { return overview.isPending },
  })
  const channels = section(o => o.channels, o => ({ items: o.channels.items ?? [] }))
  const discovered = section(o => o.discovered, o => ({ endpoints: o.discovered.endpoints ?? [] }))
  const platformConfig = section(o => o.platformConfig, o => ({ items: o.platformConfig.items ?? [] }))
  const automationRouting = section(o => o.automationRouting, o => ({ items: o.automationRouting.items ?? [] }))

  const [kind, setKind] = createSignal<NotifierChannel['kind']>('discord')
  const [label, setLabel] = createSignal('')
  const [target, setTarget] = createSignal('')
  const [events, setEvents] = createSignal<string[]>([])
  const [testResult, setTestResult] = createSignal<Record<string, string>>({})

  const refresh = () => qc.invalidateQueries({ queryKey: ['notifiers-overview', slug()] })
  const toggleEvent = (e: NotifierEvent) => setEvents(c => c.includes(e) ? c.filter(i => i !== e) : [...c, e])
  const targetLabel = () => kind() === 'email_relay' ? 'Recipient email' : 'Webhook URL'
  const targetPh = () => kind() === 'discord' ? 'https://discord.com/api/webhooks/…' : kind() === 'webhook' ? 'https://ops.example.com/hooks/crowdrelay' : 'alerts@future-metal.example'
  const typeHint = () => kind() === 'discord'
    ? 'Posts a formatted message into one Discord channel. Fastest to set up and the usual choice for a crew channel.'
    : kind() === 'webhook'
      ? 'POSTs a JSON body to any HTTPS endpoint you control — your own on-call tooling, a Slack workflow, an n8n trigger.'
      : 'Sends mail through the platform relay. No mail server of your own required, but delivery is slower than a webhook.'
  const targetHint = () => kind() === 'discord'
    ? 'Discord → Server settings → Integrations → Webhooks → New webhook → Copy webhook URL. It stays secret: anyone holding it can post to that channel.'
    : kind() === 'webhook'
      ? 'Must be HTTPS and reachable from the internet. Delivery is best-effort with bounded retries, so the endpoint should tolerate a repeat of the same event.'
      : 'One mailbox. Distribution lists work, but each address you want reached separately needs its own channel.'
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
  const [showAllRouting, setShowAllRouting] = createSignal(false)
  const MAX_VISIBLE_ROUTING = 5
  const visibleRoutingItems = () => showAllRouting() ? routingItems() : routingItems().slice(0, MAX_VISIBLE_ROUTING)

  return <PageShell>
    <PageHeader eyebrow="SYSTEM" title="Notification topology" description="Where this tenant's alerts land. Three layers: channels, platform config, and automation routing." />

    {/* ── Create form ────────────────────────────────────────────── */}
    <Show when={channels.error}><ErrorCard>{errorMessage(channels.error, 'Channels could not be loaded')}</ErrorCard></Show>
    <Show when={!channels.error && !channels.data}><SkeletonNotifiersPage /></Show>

    <Card class="p-5">
      <div class="flex items-center gap-2 mb-1">
        <SectionIcon name="bell" />
        <div>
          <h2 class="text-lg font-bold text-foreground">Add a destination</h2>
        </div>
      </div>
      <p class="mt-1 text-sm text-muted-foreground leading-relaxed">Add a destination for this tenant's alerts. Send a test after saving — a wrong URL only fails at delivery time.</p>

      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-4">
          <label class="grid gap-1.5 text-muted-foreground text-sm">
            <span>Type</span>
            <select class="w-full bg-background border border-border text-foreground px-3 py-2.5 rounded-md outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" value={kind()} onChange={(e) => { setKind(e.currentTarget.value as NotifierChannel['kind']); setTarget('') }}>
              <option value="discord">Discord app</option>
              <option value="webhook">Generic webhook</option>
              <option value="email_relay">Email via platform relay</option>
            </select>
            <small class="text-xs text-muted-foreground">{typeHint()}</small>
          </label>
          <label class="grid gap-1.5 text-muted-foreground text-sm">
            <span>Label</span>
            <Input value={label()} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Ops Discord" />
            <small class="text-xs text-muted-foreground">Your name for this destination — it is what the rows above and the delivery log show.</small>
          </label>
          <label class="grid gap-1.5 text-muted-foreground text-sm md:col-span-2">
            <span>{targetLabel()}</span>
            <Input value={target()} onInput={(e) => setTarget(e.currentTarget.value)} placeholder={targetPh()} />
            <small class="text-xs text-muted-foreground">{targetHint()}</small>
          </label>
        </div>

        <div class="mt-4 p-3.5 border border-border-subtle rounded-md bg-surface-1" role="group" aria-label="Subscribed events">
          <p class="text-sm text-secondary-foreground leading-relaxed mb-2">Which events reach this destination. Leave every box clear to receive all of them — that is the default, and new event kinds are included automatically.</p>
          <div class="grid gap-2" style={{ 'grid-template-columns': 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <For each={[...NOTIFIER_EVENTS]}>{ev => (
              <label class="flex items-start gap-3 py-1.5 px-2.5 rounded-sm hover:bg-surface-3 transition-colors cursor-pointer">
                <input type="checkbox" class="mt-0.5 w-4 h-4" style={{ 'accent-color': 'var(--color-primary)' }} checked={events().includes(ev)} onChange={() => toggleEvent(ev)} />
                <span class="text-sm text-foreground"><strong>{evLabel(ev)}</strong></span>
              </label>
            )}</For>
          </div>
          <Show when={!events().length}><small class="block mt-2 text-xs text-muted-foreground">Nothing selected — this channel receives every event.</small></Show>
        </div>

        <Show when={create.error}><div class="mt-3"><ErrorCard>{errorMessage(create.error, 'Channel creation failed')}</ErrorCard></div></Show>
        <div class="flex justify-end mt-5">
          <Button type="submit" size="sm" disabled={create.isPending || !formReady()}>{create.isPending && <Spinner />} {create.isPending ? 'Adding…' : 'Add channel'}</Button>
        </div>
      </form>
    </Card>

    {/* ── TENANT / VIRYA — Active destinations ──────────────────── */}
    <Show when={channels.data} fallback={!channels.error ? null : undefined}>
      <SectionPanel>
        <div class="flex items-center justify-between gap-4 mb-3">
          <div class="flex items-center gap-2">
            <SectionIcon name="bell" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">Active destinations</h2>
            </div>
          </div>
          <Show when={items().length > 0}><small class="text-sm text-muted-foreground">{items().length} configured</small></Show>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">Per-tenant notifier channels. <strong class="text-secondary-foreground">source:</strong> database · <strong class="text-secondary-foreground">owner:</strong> tenant · <strong class="text-secondary-foreground">path:</strong> direct or relay</p>

        <Show when={items().length === 0} fallback={
          <div class="grid gap-2.5 mt-4">
            <For each={items()}>{ch => (
              <div class="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0">
                <div class="flex items-center gap-3 min-w-0">
                  <NotifierIcon kind={ch.kind} size={20} class="provider-icon flex-shrink-0" />
                  <div class="grid gap-1 min-w-0">
                    <strong class="text-foreground">{ch.label}</strong>
                    <small class="text-sm text-muted-foreground">{kindLabel(ch.kind)} · {ch.config.to ?? ch.config.urlHost ?? 'endpoint'} · {ch.events.length ? ch.events.map(evLabel).join(', ') : 'all events'}</small>
                    <Show when={testResult()[ch.id]}>
                      <small classList={{ 'text-destructive text-sm': testResult()[ch.id]?.includes('failed'), 'text-success text-sm': !testResult()[ch.id]?.includes('failed') }}>{testResult()[ch.id]}</small>
                    </Show>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <Button variant="ghost" size="sm" disabled={test.isPending} onClick={() => test.mutateAsync(ch.id)}>Send test</Button>
                  <button
                    type="button"
                    class={`switch-control ${ch.enabled ? 'on' : ''}`}
                    role="switch"
                    aria-checked={ch.enabled}
                    aria-label={`${ch.label} enabled`}
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: ch.id, enabled: !ch.enabled })}
                  ><span /></button>
                  <Button variant="destructive-ghost" size="sm" disabled={remove.isPending} onClick={async () => {
                    const ok = await confirmAction({
                      title: `Delete channel "${ch.label}"?`,
                      body: 'Alerts routed to this channel stop being delivered.',
                      confirmLabel: 'Delete channel',
                      destructive: true,
                    })
                    if (ok) remove.mutate(ch.id)
                  }}>Delete</Button>
                </div>
              </div>
            )}</For>
          </div>
        }>
          <div class="p-4 mt-4 rounded-lg border border-border bg-surface-1"><EmptyState label="No notification channels" hint="Add a destination above to start receiving operational alerts." /></div>
        </Show>
      </SectionPanel>
    </Show>

    {/* ── PLATFORM / CONTROL PLANE ──────────────────────────────── */}
    <Show when={platformConfig.error}><SectionPanel><ErrorCard>{errorMessage(platformConfig.error, 'Platform config could not be loaded')}</ErrorCard></SectionPanel></Show>
    <Show when={!platformConfig.error && !platformConfig.data}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={platformConfig.data}>
      <SectionPanel>
        <details open>
          <summary class="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-4 mb-3">
            <div class="flex items-center gap-2">
              <SectionIcon name="server" />
              <div>
                <h2 class="text-lg font-semibold text-foreground">Platform notification config</h2>
              </div>
            </div>
          </summary>

          <div class="mt-2">
            <p class="text-sm text-muted-foreground leading-relaxed">Environment-level notification routing. <strong class="text-secondary-foreground">source:</strong> environment · <strong class="text-secondary-foreground">owner:</strong> platform · <strong class="text-secondary-foreground">path:</strong> direct, relay, or workflow</p>
            <p class="text-sm text-muted-foreground leading-relaxed mt-2">These are separate from any Discord or n8n you have configured elsewhere — each is read from its own variable in the control plane's deployment environment, and an unset one shows the variable to set.</p>

            <div class="mt-4 overflow-x-auto">
              <table class="data-table">
                <thead><tr><th>Type</th><th>Source</th><th>Owner</th><th>Path</th><th>Destination</th><th>Status</th></tr></thead>
                <tbody>
                  <For each={platformItems()}>{(item: PlatformConfigItem) => <tr>
                    <td>{platformTypeLabel(item.type)}</td>
                    <td><small class="text-muted-foreground">{item.source}</small></td>
                    <td><small class="text-muted-foreground">{item.owner}</small></td>
                    <td><small class="text-muted-foreground">{item.path}</small></td>
                    <td>
                      <Show when={item.destination} fallback={
                        <small class="text-muted-foreground">set <code class="text-xs bg-surface-3 px-1.5 py-0.5 rounded-sm">{PLATFORM_ENV_VAR[item.type] ?? item.type}</code> in the deployment's <code class="text-xs bg-surface-3 px-1.5 py-0.5 rounded-sm">.env</code></small>
                      }>
                        <code class="text-xs">{item.destination}</code>
                      </Show>
                    </td>
                    <td>
                      <Show when={item.configured && item.enabled} fallback={
                        <Badge variant="muted">{item.configured ? 'disabled' : 'not configured'}</Badge>
                      }>
                        <Badge variant="success">enabled</Badge>
                      </Show>
                    </td>
                  </tr>}</For>
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </SectionPanel>
    </Show>

    {/* ── AUTOMATION / N8N ──────────────────────────────────────── */}
    <Show when={automationRouting.error}><SectionPanel><ErrorCard>{errorMessage(automationRouting.error, 'Automation routing could not be loaded')}</ErrorCard></SectionPanel></Show>
    <Show when={!automationRouting.error && !automationRouting.data}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={automationRouting.data}>
      <SectionPanel>
        <details open>
          <summary class="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-4 mb-3">
            <div class="flex items-center gap-2">
              <SectionIcon name="workflow" />
              <div>
                <h2 class="text-lg font-semibold text-foreground">Workflow routing configs</h2>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Show when={routingItems().length > 0}><small class="text-sm text-muted-foreground">{routingItems().length} workflows</small></Show>
              <Button variant="ghost" size="sm" disabled={syncRouting.isPending} onClick={(e) => { e.preventDefault(); syncRouting.mutate() }}>{syncRouting.isPending && <Spinner />} {syncRouting.isPending ? 'Syncing…' : 'Sync from n8n'}</Button>
            </div>
          </summary>

          <div class="mt-2">
            <p class="text-sm text-muted-foreground leading-relaxed">n8n workflow routing with Discord forwarding and mute controls. <strong class="text-secondary-foreground">source:</strong> database · <strong class="text-secondary-foreground">owner:</strong> automation · <strong class="text-secondary-foreground">path:</strong> workflow</p>

            <Show when={routingItems().length === 0}>
              <Card class="p-4 mt-4">
                <EmptyState
                  label="No workflows mirrored yet"
                  hint="n8n owns the workflows; this table is the control plane's copy. Sync to pull the live list in, then mute the ones you do not want reported."
                />
              </Card>
            </Show>

            <Show when={routingItems().length > 0}>
              <div class="mt-4 overflow-x-auto">
                <table class="data-table">
                  <thead><tr><th>Workflow</th><th>Label</th><th>Category</th><th>Discord</th><th>Muted</th><th>Status</th></tr></thead>
                  <tbody>
                    <For each={visibleRoutingItems()}>{(item: AutomationRoutingItem) => <tr>
                      <td><code class="text-xs">{item.workflowId}</code></td>
                      <td>{item.label}</td>
                      <td><small class="text-muted-foreground">{item.category}</small></td>
                      <td>{item.discordEnabled ? '✓' : '—'}</td>
                      <td>{item.muted ? 'muted' : '—'}</td>
                      <td>
                        <Show when={item.enabled} fallback={<Badge variant="muted">muted</Badge>}>
                          <Badge variant="success">enabled</Badge>
                        </Show>
                      </td>
                    </tr>}</For>
                  </tbody>
                </table>
              </div>
              <Show when={routingItems().length > MAX_VISIBLE_ROUTING}>
                <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAllRouting(s => !s)}>
                  {showAllRouting() ? 'Show less' : `Show all (${routingItems().length})`}
                </Button>
              </Show>
            </Show>
          </div>
        </details>
      </SectionPanel>
    </Show>

    {/* ── Discovered webhook endpoints ───────────────────────────── */}
    <Show when={discovered.error}><SectionPanel>
      <div class="flex items-center gap-2 mb-3">
        <SectionIcon name="link" />
        <div>
          <h2 class="text-lg font-semibold text-foreground">Discovered webhook endpoints</h2>
        </div>
      </div>
      <div class="p-4 rounded-lg border border-border bg-surface-1"><p class="text-sm text-muted-foreground">CrowdRelay webhook endpoints unavailable: {errorMessage(discovered.error, 'read failed')}</p></div>
    </SectionPanel></Show>
    <Show when={!discovered.error && !discovered.data}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={discovered.data && discovered.data.endpoints.length > 0}>
      <SectionPanel>
        <div class="mb-3">
          <div class="flex items-center gap-2 mb-2">
            <SectionIcon name="link" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">Discovered webhook endpoints</h2>
            </div>
          </div>
          <p class="text-sm text-muted-foreground">Outbound webhook delivery targets already configured in this tenant's CrowdRelay instance.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Target</th><th>Active</th></tr></thead>
            <tbody>
              <For each={discovered.data?.endpoints ?? []}>{(ep: DiscoveredEndpoint) => <tr>
                <td>{ep.name}</td>
                <td><code class="text-xs">{ep.urlHost}</code></td>
                <td>
                  <Show when={ep.active} fallback={<Badge variant="muted">inactive</Badge>}>
                    <Badge variant="success">active</Badge>
                  </Show>
                </td>
              </tr>}</For>
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </Show>
  </PageShell>
}
