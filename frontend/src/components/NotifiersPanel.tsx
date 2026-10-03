import { For, Show, createSignal } from 'solid-js'
import { FormDrawer } from './app/form-drawer'
import { Field } from './ui/field'
import { unavailableError } from '../lib/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { toast } from '../components/app/toast'
import type { NotifierChannel, NotifierEvent, DiscoveredEndpoint, PlatformConfigItem, NotifiersOverview } from '../lib/types'
import { NOTIFIER_EVENTS, NOTIFIER_EVENT_LABELS } from '../lib/types'
import { errorMessage, formatIsoAge } from '../lib/format'
import { Send, Plus } from 'lucide-solid'
import { writeGuard } from '../lib/read-only'
import { whileIncomplete } from '../lib/incomplete'
import { NotifierIcon } from '../components/ProviderIcon'
import { EmptyState } from '../components/ui/empty-state'
import { Checkbox } from '../components/app/checkbox'
import { SkeletonNotifiersPage, SkeletonSection } from '../components/Skeleton'
import { confirmAction } from '../components/Dialog'
import { Spinner } from '../components/Spinner'
import { ErrorCard } from '../components/layout'
import { SettingsSection } from '../components/ui/settings'
import { DataTable, type ColumnDef } from '../components/app/data-table'
import { Button } from '../components/app/button'
import { Switch } from '../components/app/switch'
import { Badge } from '../components/app/badge'
import { Input } from '../components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/app/table'
import { cn } from '~/lib/utils'

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

// Where this tenant's alerts go: the destinations they own, the ones the
// platform sets for everybody, and the ones automation routes — plus the
// delivery log. Mounted by the /notifiers page and by Settings →
// Destinations; it fetches its own read model when the tab mounts.
export function NotifiersPanel(props: { slug: string }) {
  const slug = () => props.slug
  const qc = useQueryClient()
  const [adding, setAdding] = createSignal(false)
  // The add form is a three-step guide — where alerts go, name and point
  // it, what reaches it — ending on the save, then a test the operator
  // fires on the channel just written rather than hoping the URL was right.
  const [addStep, setAddStep] = createSignal(0)
  const [createdId, setCreatedId] = createSignal<string | null>(null)
  // Each section carries its own `error` inside a 200 — this model's degraded
  // list — so a section that failed once is never retried without this.
  const overview = useQuery(() => ({
    queryKey: ['notifiers-overview', slug()],
    queryFn: () => api.notifiersOverview(slug()),
    refetchOnWindowFocus: false,
    staleTime: 20_000,
    refetchInterval: whileIncomplete((m: NotifiersOverview) => [m.channels, m.platformConfig, m.discovered].some(s => s?.error != null)),
  }))

  const section = <T,>(pick: (o: NotifiersOverview) => { error?: string } | undefined, take: (o: NotifiersOverview) => T | undefined) => ({
    get data() { const o = overview.data; return o && !pick(o)?.error ? take(o) : undefined },
    get error() { const o = overview.data; return overview.error ?? (o && pick(o)?.error ? unavailableError(pick(o)!.error) : undefined) },
    get isPending() { return overview.isPending },
  })
  const channels = section(o => o.channels, o => ({ items: o.channels.items ?? [] }))
  const discovered = section(o => o.discovered, o => ({ endpoints: o.discovered.endpoints ?? [] }))
  const platformConfig = section(o => o.platformConfig, o => ({ items: o.platformConfig.items ?? [] }))

  // The outbox is the control plane's own delivery queue — what actually
  // left (or died trying), per channel. It lives outside the read model
  // because it changes faster than the 20s aggregate is worth refreshing.
  const outbox = useQuery(() => ({
    queryKey: ['notifier-outbox', slug()],
    queryFn: () => api.notifierOutbox(slug()),
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  }))

  const [kind, setKind] = createSignal<NotifierChannel['kind']>('discord')
  const [label, setLabel] = createSignal('')
  const [target, setTarget] = createSignal('')
  const [events, setEvents] = createSignal<string[]>([])
  const [testResult, setTestResult] = createSignal<Record<string, string>>({})

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifiers-overview', slug()] })
    qc.invalidateQueries({ queryKey: ['notifier-outbox', slug()] })
  }
  const toggleEvent = (e: NotifierEvent) => setEvents(c => c.includes(e) ? c.filter(i => i !== e) : [...c, e])
  const targetLabel = () => kind() === 'email_relay' ? 'Recipient email' : 'Webhook URL'
  const targetPh = () => kind() === 'discord' ? 'https://discord.com/api/webhooks/…' : kind() === 'webhook' ? 'https://ops.example.com/hooks/crowdrelay' : 'alerts@future-metal.example'
  const targetHint = () => kind() === 'discord'
    ? 'Discord → Server settings → Integrations → Webhooks → New webhook → Copy webhook URL. It stays secret: anyone holding it can post to that channel.'
    : kind() === 'webhook'
      ? 'Must be HTTPS and reachable from the internet. Delivery is best-effort with bounded retries, so the endpoint should tolerate a repeat of the same event.'
      : 'One mailbox. Distribution lists work, but each address you want reached separately needs its own channel.'

  const create = useMutation(() => ({ mutationFn: () => api.createNotifier(slug(), { kind: kind(), label: label().trim(), url: target().trim(), events: events(), enabled: true }), onSuccess: async ch => { await refresh(); toast.success(`${label().trim()} added.`); setCreatedId(ch.id); setLabel(''); setTarget(''); setEvents([]) } }))
  const update = useMutation(() => ({ mutationFn: (i: { id: string; enabled?: boolean }) => api.updateNotifier(slug(), i.id, { enabled: i.enabled }), onSuccess: refresh }))
  const remove = useMutation(() => ({ mutationFn: (id: string) => api.deleteNotifier(slug(), id), onSuccess: () => { refresh(); toast.success('Notifier removed.') } }))
  const test = useMutation(() => ({ mutationFn: async (id: string) => { try { const r = await api.testNotifier(slug(), id); return r.ok ? '' : (r.error ?? 'delivery failed') } catch (e) { return errorMessage(e, 'test delivery failed') } }, onMutate: (id) => setTestResult(c => ({ ...c, [id]: 'testing…' })), onSuccess: (err, id) => { setTestResult(c => ({ ...c, [id]: err ? `failed: ${err}` : 'delivered ✓' })); if (err) toast.error(`Test delivery failed: ${err}`) } }))

  const items = () => channels.data?.items ?? []
  const platformItems = () => platformConfig.data?.items ?? []
  
  const confirmDelete = async (ch: NotifierChannel) => {
    const ok = await confirmAction({
      title: `Delete channel "${ch.label}"?`,
      body: 'Alerts routed to this channel stop being delivered.',
      confirmLabel: 'Delete channel',
      destructive: true,
    })
    if (ok) remove.mutate(ch.id)
  }
  const channelColumns: ColumnDef<NotifierChannel, any>[] = [
    {
      id: 'channel', header: 'Channel', accessorFn: ch => ch.label,
      cell: c => {
        const ch = c.row.original
        return <div class="flex items-center gap-3 min-w-0">
          <NotifierIcon kind={ch.kind} size={20} class="provider-icon flex-shrink-0" />
          <div class="min-w-0">
            <strong class="block font-medium text-foreground">{ch.label}</strong>
            <small class="block text-xs text-muted-foreground">{kindLabel(ch.kind)} · {ch.config.to ?? ch.config.urlHost ?? 'endpoint'}</small>
            <Show when={testResult()[ch.id]}>
              <small classList={{ 'block text-xs text-destructive': testResult()[ch.id]?.includes('failed'), 'block text-xs text-success-foreground': !testResult()[ch.id]?.includes('failed') }}>{testResult()[ch.id]}</small>
            </Show>
          </div>
        </div>
      },
    },
    { id: 'events', header: 'Events', accessorFn: ch => ch.events.length, cell: c => <span class="text-muted-foreground">{c.row.original.events.length ? c.row.original.events.map(evLabel).join(', ') : 'All events'}</span> },
    {
      id: 'enabled', header: 'On', accessorFn: ch => (ch.enabled ? 1 : 0),
      cell: c => <Switch checked={c.row.original.enabled} label={`${c.row.original.label} enabled`} disabled={update.isPending} onChange={() => update.mutate({ id: c.row.original.id, enabled: !c.row.original.enabled })} />,
    },
    {
      id: 'actions', header: '', enableSorting: false, enableHiding: false, meta: { class: 'text-right whitespace-nowrap' },
      cell: c => <>
        <Button writes variant="ghost" size="sm" disabled={test.isPending} onClick={() => test.mutateAsync(c.row.original.id)}>Send test</Button>
        <Button writes variant="destructive-ghost" size="sm" disabled={remove.isPending} onClick={() => void confirmDelete(c.row.original)}>Delete</Button>
      </>,
    },
  ]
  type Delivery = NonNullable<typeof outbox.data>['items'][number]
  const deliveryColumns: ColumnDef<Delivery, any>[] = [
    { id: 'event', header: 'Event', accessorFn: d => d.event, cell: c => <code class="text-xs">{c.row.original.event}</code> },
    { id: 'channel', header: 'Channel', accessorFn: d => d.channel.label, cell: c => <>{c.row.original.channel.label}<span class="ml-1.5 text-xs text-muted-foreground">{kindLabel(c.row.original.channel.kind)}</span></> },
    { id: 'status', header: 'Status', accessorFn: d => d.status, cell: c => <Badge variant={c.row.original.phase === 'failed' ? 'destructive' : c.row.original.phase === 'accepted' ? 'muted' : 'outline'}>{c.row.original.status}</Badge> },
    { id: 'attempts', header: 'Attempts', accessorFn: d => d.attempts, meta: { numeric: true } },
    { id: 'error', header: 'Last error', accessorFn: d => d.lastError ?? '', cell: c => <Show when={c.row.original.lastError} fallback="—"><span class="text-xs text-destructive">{c.row.original.lastError}</span></Show> },
    { id: 'queued', header: 'Queued', accessorFn: d => d.createdAt, cell: c => <span class="text-xs text-muted-foreground">{formatIsoAge(c.row.original.createdAt)}</span> },
  ]

  return <>

    {/* ── Create form ────────────────────────────────────────────── */}
    <Show when={channels.error}><ErrorCard title="Couldn't load channels" error={channels.error} /></Show>
    <Show when={!channels.error && !channels.data}><SkeletonNotifiersPage /></Show>


    {/* ── This tenant's destinations, with the add form on demand ── */}
    <Show when={channels.data} fallback={!channels.error ? null : undefined}>
      <SettingsSection
        plain
        title="Channels"
        description="Where this tenant's alerts go. Send a test after saving; a wrong URL only fails at delivery time."
        actions={<Button writes size="sm" onClick={() => { create.reset(); setAddStep(0); setCreatedId(null); setAdding(true) }}><Plus aria-hidden="true" /> Add channel</Button>}
      >
        <FormDrawer
          open={adding()}
          onOpenChange={open => { setAdding(open); if (!open) { setAddStep(0); setCreatedId(null) } }}
          title={createdId() ? 'Channel added' : 'Add channel'}
          description="Where alerts go when something needs a person."
          size="lg"
          submitLabel={createdId() ? 'Done' : addStep() < 2 ? 'Continue' : 'Add channel'}
          pendingLabel="Saving…"
          pending={create.isPending}
          error={create.error}
          errorTitle="Couldn't add the channel"
          secondaryAction={createdId()
            ? <Button type="button" writes variant="outline" size="sm" disabled={test.isPending} onClick={() => test.mutateAsync(createdId()!)}>{test.isPending && <Spinner />} Send test</Button>
            : addStep() > 0 ? <Button type="button" variant="ghost" size="sm" onClick={() => setAddStep(s => s - 1)}>Back</Button> : undefined}
          onSubmit={() => {
            if (createdId()) { setAdding(false); setAddStep(0); setCreatedId(null) }
            else if (addStep() === 2) create.mutate()
            else setAddStep(s => s + 1)
          }}
        >
          <Show when={createdId() === null}>
            <ol class="flex items-center gap-2 mt-1 mb-4 m-0 p-0 list-none text-xs">
              <For each={['Where alerts go', 'Name and point it', 'What reaches it']}>{(label, i) => (
                <li class={cn('flex items-center gap-1.5', addStep() === i() ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  <span class={cn('inline-flex items-center justify-center size-5 rounded-full border text-xs', addStep() === i() ? 'border-primary text-primary' : 'border-border')}>{i() < addStep() ? '✓' : i() + 1}</span>
                  {label}
                  <Show when={i() < 2}><span class="text-border mx-1">·</span></Show>
                </li>
              )}</For>
            </ol>
          </Show>
          <Show when={createdId()}>{id => (
            <div class="flex flex-col gap-3">
              <p class="m-0 text-sm text-foreground">Saved. A wrong address only fails at delivery time — send a test now to know it lands.</p>
              <Show when={testResult()[id()]}>
                <p role="status" class={testResult()[id()]?.includes('failed') ? 'm-0 text-sm text-destructive' : 'm-0 text-sm text-success-foreground'}>{testResult()[id()]}</p>
              </Show>
            </div>
          )}</Show>

          <Show when={createdId() === null}>
            {/* Step 1 — the kind. The choice drives what the target asks for. */}
            <Show when={addStep() === 0}>
              <div class="grid gap-2">
                <For each={(['discord', 'webhook', 'email_relay'] as const)}>{k => (
                  <Button type="button" variant="ghost" {...writeGuard()} onClick={() => { setKind(k); setTarget('') }}
                    class={cn('flex h-auto items-start justify-start gap-3 whitespace-normal rounded-lg border p-3.5 text-left font-normal transition-colors', kind() === k ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-input')}>
                    <NotifierIcon kind={k} size={20} class="provider-icon flex-shrink-0 mt-0.5" />
                    <span class="grid gap-0.5">
                      <span class="text-sm font-medium text-foreground">{kindLabel(k)}</span>
                      <span class="text-xs text-muted-foreground leading-relaxed">{k === 'discord' ? 'Posts a formatted message into one Discord channel. Fastest to set up and the usual choice for a crew channel.' : k === 'webhook' ? 'Posts the raw event JSON to any HTTPS endpoint — for a bridge, an n8n flow, or a tool of your own.' : 'Plain email through the platform relay. For someone who lives in their inbox.'}</span>
                    </span>
                  </Button>
                )}</For>
              </div>
            </Show>

            {/* Step 2 — a name the rows show, and the address the kind needs. */}
            <Show when={addStep() === 1}>
              <Field label="Label" hint="Your name for this destination — it is what the channel list and the delivery log show.">
                <Input required minLength={2} autocomplete="off" value={label()} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="Ops Discord" />
              </Field>
              <Field label={targetLabel()} hint={targetHint()}>
                <Show when={kind() === 'email_relay'} fallback={
                  <Input required type="url" pattern="https://.+" title="Use an https:// address." autocomplete="off" value={target()} onInput={(e) => setTarget(e.currentTarget.value)} placeholder={targetPh()} />
                }>
                  <Input required type="email" autocomplete="email" value={target()} onInput={(e) => setTarget(e.currentTarget.value)} placeholder={targetPh()} />
                </Show>
              </Field>
            </Show>

            {/* Step 3 — which events reach it, then the save. */}
            <Show when={addStep() === 2}>
              <div class="p-4 border border-border rounded-md bg-background" role="group" aria-label="Subscribed events">
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
              <p class="mt-3 mb-0 text-xs text-muted-foreground">Saving <strong class="text-foreground">{label().trim()}</strong> — {kindLabel(kind())} · {kind() === 'email_relay' ? target().trim() : 'webhook'} · {events().length ? `${events().length} events` : 'all events'}.</p>
            </Show>

          </Show>
        </FormDrawer>

        <Show when={items().length === 0} fallback={
          <DataTable
            data={items()}
            columns={channelColumns}
            getRowId={ch => ch.id}
            searchText={ch => [ch.label, kindLabel(ch.kind), ch.config.to ?? ch.config.urlHost ?? '', ...ch.events.map(evLabel)].join(' ')}
            searchPlaceholder="Search channels"
            searchLabel="Search channels"
          />
        }>
          <EmptyState icon={<Send />} label="No channels yet" hint="Add a channel to start receiving operational alerts." />
        </Show>
      </SettingsSection>
    </Show>

    {/* ── PLATFORM / CONTROL PLANE ──────────────────────────────── */}
    <Show when={platformConfig.error}><ErrorCard title="Couldn't load platform settings" error={platformConfig.error} /></Show>
    <Show when={!platformConfig.error && !platformConfig.data}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={platformConfig.data}>
      <SettingsSection
        plain
        title="Platform channels"
        description="Set once for the whole platform, not per tenant, from the control plane's deployment environment. Shown so you know where else an alert lands; an unset one names the variable to set."
      >
            <div>
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
      </SettingsSection>
    </Show>

    {/* ── AUTOMATION / N8N ──────────────────────────────────────── */}
    {/* ── Discovered webhook endpoints ───────────────────────────── */}
    <Show when={discovered.error}>
      <SettingsSection plain title="Webhooks in CrowdRelay">
        <ErrorCard title="Couldn't load webhook endpoints" error={discovered.error} />
      </SettingsSection>
    </Show>
    <Show when={!discovered.error && !discovered.data}><SkeletonSection titleWidth="200px" lines={3} minHeight="120px" /></Show>
    <Show when={discovered.data && discovered.data.endpoints.length > 0}>
      <SettingsSection plain title="Webhooks in CrowdRelay" description="Outbound webhook targets already configured in this tenant's CrowdRelay instance. Read-only here.">
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
      </SettingsSection>
    </Show>

    {/* ── Recent deliveries — the control plane's own outbox ─────── */}
    <Show when={outbox.error}>
      <SettingsSection plain title="Recent deliveries">
        <ErrorCard title="Couldn't load recent deliveries" error={outbox.error} onRetry={() => void outbox.refetch()} />
      </SettingsSection>
    </Show>
    <Show when={!outbox.error && outbox.isPending}><SkeletonSection titleWidth="180px" lines={3} minHeight="120px" /></Show>
    <Show when={outbox.data && outbox.data.items.length === 0}>
      <SettingsSection plain title="Recent deliveries" description="The last 50 notifications this tenant's channels were asked to send.">
        <EmptyState icon={<Send />} label="Nothing sent yet" hint="Notifications land here when an event fires for a channel — test deliveries included." />
      </SettingsSection>
    </Show>
    <Show when={outbox.data && outbox.data.items.length > 0}>
      <SettingsSection plain title="Recent deliveries" description="The last 50 notifications this tenant's channels were asked to send.">
        <DataTable
          data={outbox.data?.items ?? []}
          columns={deliveryColumns}
          searchText={item => [item.event, item.channel.label, kindLabel(item.channel.kind), item.status, item.lastError ?? ''].join(' ')}
          searchPlaceholder="Search event, channel or error"
          searchLabel="Search deliveries"
        />
      </SettingsSection>
    </Show>
    </>
}
