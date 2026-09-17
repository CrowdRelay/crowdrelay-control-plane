import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { toast } from '../components/app/toast'
import type { NotifierChannel, NotifierEvent, DiscoveredEndpoint, PlatformConfigItem, AutomationRoutingItem, NotifiersOverview } from '../lib/types'
import { NOTIFIER_EVENTS, NOTIFIER_EVENT_LABELS } from '../lib/types'
import { SectionIcon } from '../components/SectionIcon'
import { errorMessage, relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { ChevronDown, RefreshCw } from 'lucide-solid'
import { writeGuard } from '../lib/read-only'
import { whileIncomplete } from '../lib/incomplete'
import { NotifierIcon } from '../components/ProviderIcon'
import { EmptyState } from '../components/ui/empty-state'
import { Checkbox } from '../components/app/checkbox'
import { SkeletonNotifiersPage, SkeletonSection } from '../components/Skeleton'
import { confirmAction } from '../components/Dialog'
import { Spinner } from '../components/Spinner'
import { ErrorCard, PageHeader, PageShell, Section } from '../components/layout'
import { Button } from '../components/app/button'
import { Switch } from '../components/app/switch'
import { Badge } from '../components/app/badge'
import { Input } from '../components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/app/table'
import { NativeSelect } from '../components/ui/native-select'

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
  const [adding, setAdding] = createSignal(false)
  // Each section carries its own `error` inside a 200 — this model's degraded
  // list — so a section that failed once is never retried without this.
  const overview = useQuery(() => ({
    queryKey: ['notifiers-overview', slug()],
    queryFn: () => api.notifiersOverview(slug()),
    refetchOnWindowFocus: false,
    staleTime: 20_000,
    refetchInterval: whileIncomplete((m: NotifiersOverview) => [m.channels, m.platformConfig, m.automationRouting, m.discovered].some(s => s?.error != null)),
  }))

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

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => { now(); return overview.dataUpdatedAt ? relativeTime(overview.dataUpdatedAt) : null })

  return <PageShell>
    <PageHeader
      title="Notifiers"
      description="Where this tenant's alerts go: the destinations you own, the ones the platform sets for everybody, and the ones automation routes."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={overview.isFetching} aria-label="Refresh">
            <RefreshCw class={cn(overview.isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    {/* ── Create form ────────────────────────────────────────────── */}
    <Show when={channels.error}><ErrorCard>{errorMessage(channels.error, 'Channels could not be loaded')}</ErrorCard></Show>
    <Show when={!channels.error && !channels.data}><SkeletonNotifiersPage /></Show>


    {/* ── This tenant's destinations, with the add form on demand ── */}
    <Show when={channels.data} fallback={!channels.error ? null : undefined}>
      <Section
        flush
        title="Destinations"
        icon={<SectionIcon name="bell" />}
        count={items().length}
        description="The places you added for this tenant's alerts. Send a test after saving; a wrong URL only fails at delivery time."
        action={<Button writes size="sm" onClick={() => setAdding(v => !v)}>{adding() ? 'Cancel' : 'Add channel'}</Button>}
      >
        <Show when={adding()}>
        <form class="rounded-lg border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <label class="grid gap-1.5 text-muted-foreground text-sm">
              <span>Type</span>
              <NativeSelect value={kind()} onChange={(e) => { setKind(e.currentTarget.value as NotifierChannel['kind']); setTarget('') }} {...writeGuard()}>
                <option value="discord">Discord app</option>
                <option value="webhook">Generic webhook</option>
                <option value="email_relay">Email via platform relay</option>
              </NativeSelect>
              <small class="text-xs text-muted-foreground">{typeHint()}</small>
            </label>
            <label class="grid gap-1.5 text-muted-foreground text-sm">
              <span>Label</span>
              <Input value={label()} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Ops Discord" {...writeGuard()} />
              <small class="text-xs text-muted-foreground">Your name for this destination — it is what the rows above and the delivery log show.</small>
            </label>
            <label class="grid gap-1.5 text-muted-foreground text-sm md:col-span-2">
              <span>{targetLabel()}</span>
              <Input value={target()} onInput={(e) => setTarget(e.currentTarget.value)} placeholder={targetPh()} {...writeGuard()} />
              <small class="text-xs text-muted-foreground">{targetHint()}</small>
            </label>
          </div>

          <div class="mt-4 p-4 border border-border rounded-md bg-background" role="group" aria-label="Subscribed events">
            <p class="text-sm text-secondary-foreground leading-relaxed mb-2">Which events reach this destination. Leave every box clear to receive all of them — that is the default, and new event kinds are included automatically.</p>
            <div class="grid gap-2" style={{ 'grid-template-columns': 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <For each={[...NOTIFIER_EVENTS]}>{ev => (
                <Checkbox
                  class="items-start gap-3 py-1.5 px-2.5 rounded-sm hover:bg-muted transition-colors cursor-pointer"
                  checked={events().includes(ev)}
                  onChange={() => toggleEvent(ev)}
                  {...writeGuard()}
                  label={evLabel(ev)}
                />
              )}</For>
            </div>
            <Show when={!events().length}><small class="block mt-2 text-xs text-muted-foreground">Nothing selected — this channel receives every event.</small></Show>
          </div>

          <Show when={create.error}><div class="mt-3"><ErrorCard>{errorMessage(create.error, 'Channel creation failed')}</ErrorCard></div></Show>
          <div class="flex justify-end gap-2 mt-5">
            <Button variant="ghost" size="sm" type="button" onClick={() => setAdding(false)}>Cancel</Button>
            <Button writes type="submit" size="sm" disabled={create.isPending || !formReady()}>{create.isPending && <Spinner />} {create.isPending ? 'Saving…' : 'Save channel'}</Button>
          </div>
        </form>
        </Show>

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
                      <small classList={{ 'text-destructive text-sm': testResult()[ch.id]?.includes('failed'), 'text-success-foreground text-sm': !testResult()[ch.id]?.includes('failed') }}>{testResult()[ch.id]}</small>
                    </Show>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <Button writes variant="ghost" size="sm" disabled={test.isPending} onClick={() => test.mutateAsync(ch.id)}>Send test</Button>
                  <Switch
                    checked={ch.enabled}
                    label={`${ch.label} enabled`}
                    disabled={update.isPending}
                    onChange={() => update.mutate({ id: ch.id, enabled: !ch.enabled })}
                  />
                  <Button writes variant="destructive-ghost" size="sm" disabled={remove.isPending} onClick={async () => {
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
          <EmptyState label="No destinations yet" hint="Add a channel to start receiving operational alerts." />
        </Show>
      </Section>
    </Show>

    {/* ── PLATFORM / CONTROL PLANE ──────────────────────────────── */}
    <Show when={platformConfig.error}><ErrorCard>{errorMessage(platformConfig.error, 'Platform config could not be loaded')}</ErrorCard></Show>
    <Show when={!platformConfig.error && !platformConfig.data}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={platformConfig.data}>
      <section class="border-t border-border pt-6">
        <details class="group">
          <summary class="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-4">
            <h2 class="flex items-center gap-2 text-base font-semibold text-foreground"><span class="text-muted-foreground"><SectionIcon name="server" /></span>Platform notification config<ChevronDown class="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" /></h2>
          </summary>

          <div class="mt-2">
            <p class="text-sm text-muted-foreground leading-relaxed">Set once for the whole platform, not per tenant. Shown so you know where else an alert lands; changing these is a platform admin job.</p>
            <p class="text-sm text-muted-foreground leading-relaxed mt-2">These are separate from any Discord or n8n you have configured elsewhere — each is read from its own variable in the control plane's deployment environment, and an unset one shows the variable to set.</p>

            <div class="mt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Source</TableHead><TableHead>Owner</TableHead><TableHead>Path</TableHead><TableHead>Destination</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  <For each={platformItems()}>{(item: PlatformConfigItem) => <TableRow>
                    <TableCell>{platformTypeLabel(item.type)}</TableCell>
                    <TableCell><small class="text-muted-foreground">{item.source}</small></TableCell>
                    <TableCell><small class="text-muted-foreground">{item.owner}</small></TableCell>
                    <TableCell><small class="text-muted-foreground">{item.path}</small></TableCell>
                    <TableCell>
                      <Show when={item.destination} fallback={
                        <small class="text-muted-foreground">set <code class="text-xs bg-muted px-1.5 py-0.5 rounded-sm">{PLATFORM_ENV_VAR[item.type] ?? item.type}</code> in the deployment's <code class="text-xs bg-muted px-1.5 py-0.5 rounded-sm">.env</code></small>
                      }>
                        <code class="text-xs">{item.destination}</code>
                      </Show>
                    </TableCell>
                    <TableCell>
                      <Show when={item.configured && item.enabled} fallback={
                        <Badge variant="muted">{item.configured ? 'disabled' : 'not configured'}</Badge>
                      }>
                        <Badge variant="success">enabled</Badge>
                      </Show>
                    </TableCell>
                  </TableRow>}</For>
                </TableBody>
              </Table>
            </div>
          </div>
        </details>
      </section>
    </Show>

    {/* ── AUTOMATION / N8N ──────────────────────────────────────── */}
    <Show when={automationRouting.error}><ErrorCard>{errorMessage(automationRouting.error, 'Automation routing could not be loaded')}</ErrorCard></Show>
    <Show when={!automationRouting.error && !automationRouting.data}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={automationRouting.data}>
      <section class="border-t border-border pt-6">
        <details class="group">
          <summary class="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-4">
            <h2 class="flex items-center gap-2 text-base font-semibold text-foreground"><span class="text-muted-foreground"><SectionIcon name="workflow" /></span>Workflow routing configs<ChevronDown class="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" /></h2>
            <div class="flex items-center gap-2">
              <Show when={routingItems().length > 0}><small class="text-sm text-muted-foreground">{routingItems().length} workflows</small></Show>
              <Button writes variant="outline" size="sm" disabled={syncRouting.isPending} onClick={(e) => { e.preventDefault(); syncRouting.mutate() }}>{syncRouting.isPending && <Spinner />} {syncRouting.isPending ? 'Syncing…' : 'Sync from n8n'}</Button>
            </div>
          </summary>

          <div class="mt-2">
            <p class="text-sm text-muted-foreground leading-relaxed">Automation forwards its own workflow results to Discord. Mute a workflow here to stop its messages without stopping the workflow.</p>

            <Show when={routingItems().length === 0}>
              <EmptyState
                label="No workflows synced yet"
                hint="Automation owns the workflows; this is our copy of the list. Sync to pull it in, then mute anything you do not want reported."
              />
            </Show>

            <Show when={routingItems().length > 0}>
              <div class="mt-4">
                <Table>
                  <TableHeader><TableRow><TableHead>Workflow</TableHead><TableHead>Label</TableHead><TableHead>Category</TableHead><TableHead>Discord</TableHead><TableHead>Muted</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <For each={visibleRoutingItems()}>{(item: AutomationRoutingItem) => <TableRow>
                      <TableCell><code class="text-xs">{item.workflowId}</code></TableCell>
                      <TableCell>{item.label}</TableCell>
                      <TableCell><small class="text-muted-foreground">{item.category}</small></TableCell>
                      <TableCell>{item.discordEnabled ? '✓' : '—'}</TableCell>
                      <TableCell>{item.muted ? 'muted' : '—'}</TableCell>
                      <TableCell>
                        <Show when={item.enabled} fallback={<Badge variant="muted">muted</Badge>}>
                          <Badge variant="success">enabled</Badge>
                        </Show>
                      </TableCell>
                    </TableRow>}</For>
                  </TableBody>
                </Table>
              </div>
              <Show when={routingItems().length > MAX_VISIBLE_ROUTING}>
                <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAllRouting(s => !s)}>
                  {showAllRouting() ? 'Show fewer' : `Show all ${routingItems().length}`}
                </Button>
              </Show>
            </Show>
          </div>
        </details>
      </section>
    </Show>

    {/* ── Discovered webhook endpoints ───────────────────────────── */}
    <Show when={discovered.error}>
      <Section title="Discovered webhook endpoints" icon={<SectionIcon name="link" />}>
        <p class="text-sm text-muted-foreground">CrowdRelay webhook endpoints unavailable: {errorMessage(discovered.error, 'We couldn\'t read the webhook endpoints. Try refreshing.')}</p>
      </Section>
    </Show>
    <Show when={!discovered.error && !discovered.data}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={discovered.data && discovered.data.endpoints.length > 0}>
      <Section title="Discovered webhook endpoints" icon={<SectionIcon name="link" />} count={discovered.data?.endpoints.length} description="Outbound webhook delivery targets already configured in this tenant's CrowdRelay instance.">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Target</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
          <TableBody>
            <For each={discovered.data?.endpoints ?? []}>{(ep: DiscoveredEndpoint) => <TableRow>
              <TableCell>{ep.name}</TableCell>
              <TableCell><code class="text-xs">{ep.urlHost}</code></TableCell>
              <TableCell>
                <Show when={ep.active} fallback={<Badge variant="muted">inactive</Badge>}>
                  <Badge variant="success">active</Badge>
                </Show>
              </TableCell>
            </TableRow>}</For>
          </TableBody>
        </Table>
      </Section>
    </Show>
  </PageShell>
}
