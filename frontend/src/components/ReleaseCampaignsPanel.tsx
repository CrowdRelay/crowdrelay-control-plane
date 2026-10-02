import { FormDrawer } from './app/form-drawer'
import { Field } from './ui/field'
import { Image, MoreHorizontal, Plus, X } from 'lucide-solid'
import { failureLine } from '../lib/errors'
import { capabilityAction } from '../lib/capabilities'
import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { READ_ONLY_REASON } from '../lib/read-only'
import { refreshQueries } from '../lib/refresh'
import { formatTimestamp, humanizeToken, tokenLabel } from '../lib/format'
import type { AdminReleaseRecipientView, ReleaseCampaignView } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { SectionFailureCard } from './SectionFailureCard'
import { ErrorCard, Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { confirmAction } from './Dialog'
import { Tile, Tiles } from './ui/dash'
import { Button } from './app/button'
import { Input } from './ui/input'
import { Badge } from './app/badge'
import { DataTable, type ColumnDef } from './app/data-table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { ActionSheet, type OpenWrite } from './capabilities/ActionSheet'

type Tone = 'good' | 'warn' | 'bad' | 'muted'
type BadgeVariant = 'success' | 'warning' | 'destructive' | 'muted'

const toneToVariant = (tone: Tone): BadgeVariant =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

const phaseTone = (phase: string): Tone => {
  switch (phase) {
    case 'delivering': case 'delivered': return 'good'
    case 'preparing': case 'claiming': return 'warn'
    case 'cancelled': case 'expired': return 'bad'
    default: return 'muted'
  }
}

const recipientStatusTone = (status: string): Tone => {
  switch (status) {
    case 'delivered': case 'confirmed': case 'sent': return 'good'
    case 'pending': case 'prepared': case 'queued': return 'warn'
    case 'declined': case 'expired': case 'suppressed': return 'bad'
    default: return 'muted'
  }
}

const LIVE_PHASES = new Set(['active', 'claiming', 'preparing', 'delivering'])

const formatDeadline = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days < 30) return `${days}d left`
  return formatTimestamp(iso)
}

export function ReleaseCampaignsPanel(props: { slug: string }) {
  const [error, setError] = createSignal<string | null>(null)
  const [acting, setActing] = createSignal<string | null>(null)
  // Creating a campaign. The panel could launch and close campaigns but never
  // make one, and its empty state pointed at a "release plan" surface that does
  // not exist anywhere in the control plane.
  const [creating, setCreating] = createSignal(false)
  const [form, setForm] = createSignal({ slug: '', title: '', sku: '', claimDeadline: '' })
  const [selectedCampaign, setSelectedCampaign] = createSignal<string | null>(null)
  const [phase, setPhase] = createSignal('all')
  // Marking a parcel opens beside the recipients, not inside the row.
  const [write, setWrite] = createSignal<OpenWrite | null>(null)
  const campaigns = useQuery(() => ({
    queryKey: ['release-campaigns', props.slug],
    queryFn: () => api.beaconReleaseCampaigns(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const recipients = useQuery(() => ({
    queryKey: ['release-recipients', props.slug, selectedCampaign()],
    queryFn: async () => {
      const campaignId = selectedCampaign()
      if (!campaignId) return null
      return api.beaconReleaseRecipients(props.slug, campaignId)
    },
    enabled: selectedCampaign() !== null,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const launchCampaign = async (campaignId: string) => {
    setActing(campaignId)
    setError(null)
    try {
      await api.launchBeaconReleaseCampaign(props.slug, campaignId)
      refreshQueries(['release-campaigns', props.slug], ['release-recipients', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't launch the campaign", err))
    } finally {
      setActing(null)
    }
  }

  const closeCampaign = async (campaignId: string) => {
    setActing(campaignId)
    setError(null)
    try {
      await api.closeBeaconReleaseCampaign(props.slug, campaignId)
      refreshQueries(['release-campaigns', props.slug], ['release-recipients', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't close the campaign", err))
    } finally {
      setActing(null)
    }
  }

  // Launching notifies every eligible amplifier and closing ends the
  // campaign; neither can be taken back, so both ask first.
  const confirmLaunch = async (campaign: ReleaseCampaignView) => {
    if (await confirmAction({
      title: `Launch ${campaign.title}?`,
      body: 'Every eligible amplifier is notified right away. This can\'t be undone.',
      confirmLabel: 'Launch campaign',
    })) await launchCampaign(campaign.id)
  }
  const confirmClose = async (campaign: ReleaseCampaignView) => {
    if (await confirmAction({
      title: `Close ${campaign.title}?`,
      body: 'The campaign stops taking claims and parcels can no longer be updated. Close it once every parcel is delivered.',
      confirmLabel: 'Close campaign',
      destructive: true,
    })) await closeCampaign(campaign.id)
  }

  const createCampaign = async () => {
    if (acting() !== null) return
    setActing('create')
    setError(null)
    try {
      const values = form()
      await api.createBeaconReleaseCampaign(props.slug, {
        slug: values.slug.trim(),
        title: values.title.trim(),
        sku: values.sku.trim(),
        // `datetime-local` yields a local wall time with no zone. The tenant
        // parses RFC3339 and rejects anything else, so convert rather than
        // append a Z that would silently shift the deadline.
        claimDeadline: new Date(values.claimDeadline).toISOString(),
      })
      setForm({ slug: '', title: '', sku: '', claimDeadline: '' })
      setCreating(false)
      refreshQueries(['release-campaigns', props.slug])
    } catch (caught) {
      setError(failureLine("Couldn't create the campaign", caught))
    } finally {
      setActing(null)
    }
  }

  const all = () => campaigns.data?.campaigns ?? []
  const phases = () => [...new Set(all().map(c => c.phase))]
  const visible = () => phase() === 'all' ? all() : all().filter(c => c.phase === phase())
  // Launched and still moving parcels — the phases between launch and close.
  const live = () => all().filter(c => LIVE_PHASES.has(c.phase)).length
  const selected = () => all().find(c => c.id === selectedCampaign()) ?? null
  const refresh = () => refreshQueries(['release-campaigns', props.slug], ['release-recipients', props.slug])

  const columns: ColumnDef<ReleaseCampaignView, any>[] = [
    {
      id: 'campaign', header: 'Campaign', accessorFn: c => c.title,
      meta: { class: 'min-w-56' },
      cell: c => <>
        <span class="font-medium text-foreground">{c.row.original.title}</span>
        <span class="block text-muted-foreground">{c.row.original.product_name} · {c.row.original.variant_label}</span>
        <span class="block text-xs text-muted-foreground">SKU {c.row.original.sku}</span>
      </>,
    },
    {
      id: 'phase', header: 'Phase', accessorFn: c => c.phase,
      cell: c => <Badge variant={toneToVariant(phaseTone(c.row.original.phase))}>{tokenLabel(c.row.original.phase)}</Badge>,
    },
    {
      id: 'deadline', header: 'Claim deadline', accessorFn: c => new Date(c.claim_deadline).getTime() || 0, meta: { class: 'whitespace-nowrap' },
      cell: c => <span title={formatTimestamp(c.row.original.claim_deadline)}>{formatDeadline(c.row.original.claim_deadline)}</span>,
    },
    { id: 'notified', header: 'Notified', accessorFn: c => c.notified_count, meta: { numeric: true } },
    { id: 'confirmed', header: 'Confirmed', accessorFn: c => c.confirmed_count, meta: { numeric: true } },
    {
      id: 'delivered', header: 'Delivered', accessorFn: c => c.delivered_count, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => <>
        {c.row.original.delivered_count}
        <span class="block text-xs text-muted-foreground">of {c.row.original.sent_count} sent</span>
      </>,
    },
    {
      id: 'lost', header: 'Lost', accessorFn: c => c.declined_count + c.expired_count, meta: { numeric: true, label: 'Declined or expired', class: 'whitespace-nowrap' },
      cell: c => <>
        {c.row.original.declined_count + c.row.original.expired_count}
        <span class="block text-xs text-muted-foreground">{c.row.original.declined_count} declined · {c.row.original.expired_count} expired</span>
      </>,
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'w-12 text-right' },
      cell: c => {
        const row = c.row.original
        const canLaunch = row.phase === 'draft' || row.phase === 'ready'
        const canClose = row.phase !== 'closed' && row.phase !== 'cancelled' && row.launched_at != null
        return (
          <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-8" disabled={acting() === row.id}>
              <span class="sr-only">Open menu for {row.title}</span>
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-44">
              <DropdownMenuItem onSelect={() => setSelectedCampaign(row.id)}>Show recipients</DropdownMenuItem>
              <Show when={canLaunch}>
                <DropdownMenuItem disabled={authState.readOnly()} title={authState.readOnly() ? READ_ONLY_REASON : undefined} onSelect={() => void confirmLaunch(row)}>
                  Launch campaign…
                </DropdownMenuItem>
              </Show>
              <Show when={canClose}>
                <DropdownMenuItem disabled={authState.readOnly()} title={authState.readOnly() ? READ_ONLY_REASON : undefined} onSelect={() => void confirmClose(row)}>
                  Close campaign…
                </DropdownMenuItem>
              </Show>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const recipientColumns: ColumnDef<AdminReleaseRecipientView, any>[] = [
    {
      id: 'recipient', header: 'Recipient', accessorFn: r => r.displayName,
      cell: c => <>
        <span class="font-medium text-foreground">{c.row.original.displayName}</span>
        <Show when={c.row.original.recipientName}><span class="block text-muted-foreground">{c.row.original.recipientName}</span></Show>
      </>,
    },
    { id: 'kind', header: 'Kind', accessorFn: r => humanizeToken(r.beaconKind) },
    { id: 'city', header: 'City', accessorFn: r => r.city ?? '—' },
    {
      id: 'status', header: 'Status', accessorFn: r => r.status,
      cell: c => <Badge variant={toneToVariant(recipientStatusTone(c.row.original.status))}>{tokenLabel(c.row.original.status)}</Badge>,
    },
    {
      id: 'confirmed', header: 'Confirmed', accessorFn: r => r.confirmedAt ?? '', meta: { class: 'whitespace-nowrap' },
      cell: c => formatTimestamp(c.row.original.confirmedAt),
    },
    {
      id: 'delivered', header: 'Delivered', accessorFn: r => r.deliveredAt ?? '', meta: { class: 'whitespace-nowrap' },
      cell: c => formatTimestamp(c.row.original.deliveredAt),
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'w-28 text-right' },
      // The parcel's own progress — only the person packing and posting it
      // knows it moved.
      cell: c => <Show when={c.row.original.status !== 'delivered' && c.row.original.status !== 'cancelled'}>
        <Button writes variant="ghost" size="xs" onClick={() => setWrite({
          title: 'Mark parcel',
          description: c.row.original.displayName,
          action: capabilityAction('release-recipient', 'Update recipient'),
          fixed: { campaign_id: c.row.original.campaignId, beacon_id: c.row.original.beaconId },
        })}>Mark parcel</Button>
      </Show>,
    },
  ]

  return <div class="space-y-6">
    <div class="rounded-xl border border-border bg-card p-4 sm:p-5">
      <Section
        flush
        title="Release campaigns"
        icon={<SectionIcon name="megaphone" />}
        count={campaigns.data?.campaigns.length}
        description="Physical release delivery to amplifiers. Launch a campaign to notify eligible amplifiers; close it when every parcel is delivered."
      >
        <Show when={error() && !creating()}>
          <ErrorCard>{error()}</ErrorCard>
        </Show>

        <Show when={!campaigns.error} fallback={<SectionFailureCard error={campaigns.error} title="Couldn't load release campaigns" onRetry={() => void campaigns.refetch()} />}>
          <Show when={campaigns.data} fallback={<SkeletonRows count={3} />}>
            <Tiles>
              <Tile label="Active Latarnicy" value={campaigns.data!.pool.active_release_latarnicy} sub="amplifiers in the release pool" />
              <Tile
                label="Contactable"
                value={campaigns.data!.pool.contactable_latarnicy}
                sub={campaigns.data!.pool.active_release_latarnicy > 0
                  ? `${Math.round(campaigns.data!.pool.contactable_latarnicy / campaigns.data!.pool.active_release_latarnicy * 100)}% of the pool can be notified`
                  : 'can be notified'}
              />
              <Tile
                label="Missing email"
                value={campaigns.data!.pool.missing_email}
                valueTone={campaigns.data!.pool.missing_email > 0 ? 'warn' : undefined}
                sub={campaigns.data!.pool.missing_email > 0 ? 'won\'t hear about a launch' : 'everyone can be reached'}
              />
              <Tile label="Active campaigns" value={live()} sub={`of ${all().length} in total`} />
            </Tiles>

            <DataTable
              data={visible()}
              columns={columns}
              getRowId={c => c.id}
              bordered={false}
              initialSorting={[{ id: 'deadline', desc: false }]}
              searchText={c => [c.title, c.product_name, c.variant_label, c.sku, c.phase].join(' ')}
              searchPlaceholder="Search by title, product or SKU"
              toolbar={
                <Show when={phases().length > 1}>
                  <div role="group" aria-label="Phase" class="flex flex-wrap items-center gap-1">
                    <For each={['all', ...phases()]}>{id => (
                      <Button variant={phase() === id ? 'secondary' : 'ghost'} size="sm" aria-pressed={phase() === id} onClick={() => setPhase(id)}>
                        {id === 'all' ? 'All' : tokenLabel(id)}
                        <span class="tabular-nums text-muted-foreground">{id === 'all' ? all().length : all().filter(c => c.phase === id).length}</span>
                      </Button>
                    )}</For>
                  </div>
                </Show>
              }
              actions={
                <Button writes variant="outline" size="sm" onClick={() => { setError(null); setCreating(true) }}>
                  <Plus aria-hidden="true" /> Add release campaign
                </Button>
              }
              empty={<EmptyState icon={<Image />} label="No release campaigns" hint="A release campaign sends a physical copy of a release to your amplifiers. Add one, then launch it to notify everyone eligible." />}
            />
          </Show>
        </Show>
      </Section>
    </div>

    {/* Keyed, so picking another campaign mounts it afresh and the ref
        brings it into view under the table each time. */}
    <Show when={selected()} keyed>{campaign => (
      <div ref={el => requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))} class="scroll-mt-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <Section
          flush
          title={`Recipients — ${campaign.title}`}
          icon={<SectionIcon name="users" />}
          count={recipients.data?.recipients.length}
          description={`${campaign.product_name} · ${campaign.variant_label}. Mark each parcel as it is packed, posted and delivered.`}
          action={<Button variant="ghost" size="sm" onClick={() => setSelectedCampaign(null)}><X aria-hidden="true" /> Hide recipients</Button>}
        >
          <Show when={!recipients.error} fallback={<SectionFailureCard error={recipients.error} title="Couldn't load campaign recipients" onRetry={() => void recipients.refetch()} />}>
            <Show when={recipients.data} fallback={<SkeletonRows count={3} />}>
              <DataTable
                data={recipients.data!.recipients}
                columns={recipientColumns}
                getRowId={r => r.beaconId}
                bordered={false}
                searchText={r => [r.displayName, r.recipientName, r.city, r.beaconKind, r.status].filter(Boolean).join(' ')}
                searchPlaceholder="Search recipients"
                empty={<EmptyState icon={<Image />} label="No recipients yet" hint="Recipients appear once the campaign is launched and amplifiers claim a copy." />}
              />
            </Show>
          </Show>
        </Section>
      </div>
    )}</Show>

    <FormDrawer
      open={creating()}
      onOpenChange={setCreating}
      title="New release campaign"
      description="Physical release delivery to amplifiers. Launching it later notifies everyone eligible."
      submitLabel="Create campaign"
      pendingLabel="Creating…"
      pending={acting() === 'create'}
      error={error()}
      validate={() => new Date(form().claimDeadline).getTime() > Date.now() ? undefined : 'Pick a claim deadline in the future.'}
      onSubmit={() => void createCampaign()}
    >
      <Field label="Title" hint="What the recipient sees.">
        <Input value={form().title} maxlength={200} required autocomplete="off"
               onInput={e => setForm({ ...form(), title: e.currentTarget.value })} />
      </Field>
      <Field label={authState.isPlatformLevel() ? 'Slug' : 'Link name'} hint="Lowercase letters, digits and dashes — used in links.">
        <Input value={form().slug} maxlength={100} required autocomplete="off"
               pattern="[a-z0-9][a-z0-9\-]*" title="Lowercase letters, digits and dashes."
               onInput={e => setForm({ ...form(), slug: e.currentTarget.value })} />
      </Field>
      <Field label="SKU" hint="The physical item being sent.">
        <Input value={form().sku} maxlength={100} required autocomplete="off"
               onInput={e => setForm({ ...form(), sku: e.currentTarget.value })} />
      </Field>
      <Field label="Claim deadline" hint="Must be in the future.">
        <Input type="datetime-local" value={form().claimDeadline} required
               onInput={e => setForm({ ...form(), claimDeadline: e.currentTarget.value })} />
      </Field>
    </FormDrawer>

    <ActionSheet
      slug={props.slug}
      write={write()}
      onClose={() => setWrite(null)}
      onDone={() => { setWrite(null); refresh() }}
    />
  </div>
}
