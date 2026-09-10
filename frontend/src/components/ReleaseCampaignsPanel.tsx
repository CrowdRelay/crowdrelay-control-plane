import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { refreshQueries } from '../lib/refresh'
import { errorMessage, formatTimestamp } from '../lib/format'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { KpiStrip, KpiCard } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'

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
  const [showAllCampaigns, setShowAllCampaigns] = createSignal(false)
  const MAX_VISIBLE = 6
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
      setError(errorMessage(err, 'Failed to launch campaign'))
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
      setError(errorMessage(err, 'Failed to close campaign'))
    } finally {
      setActing(null)
    }
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
      setError(errorMessage(caught, 'Could not create the campaign'))
    } finally {
      setActing(null)
    }
  }

  return <div class="mt-6 pt-4 border-t border-border">
    <div class="flex items-start justify-between gap-4 mb-3">
      <div>
        <h3 class="text-base font-semibold text-foreground">Release campaigns</h3>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <Show when={campaigns.data}>
          <span class="text-muted-foreground">{campaigns.data!.campaigns.length} campaigns · {campaigns.data!.pool.contactable_latarnicy} contactable</span>
        </Show>
        <Button variant="ghost" size="sm" onClick={() => setCreating(v => !v)}>
          {creating() ? 'Cancel' : 'Add release campaign'}
        </Button>
      </div>
    </div>
    <p class="text-sm text-muted-foreground leading-relaxed">Physical release delivery to beacon recipients. Launch a campaign to notify eligible beacons; close when all parcels are delivered.</p>

    <Show when={error()}>
      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{error()}</div>
    </Show>

    <Show when={creating()}>
      <form class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4" onSubmit={event => { event.preventDefault(); void createCampaign() }}>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-foreground">Title <small class="text-muted-foreground font-normal">what the beacon sees</small></span>
          <Input value={form().title} maxlength={200} required
                 onInput={e => setForm({ ...form(), title: e.currentTarget.value })} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-foreground">Slug <small class="text-muted-foreground font-normal">lowercase, used in links</small></span>
          <Input value={form().slug} maxlength={100} required
                 onInput={e => setForm({ ...form(), slug: e.currentTarget.value })} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-foreground">SKU <small class="text-muted-foreground font-normal">the physical item being sent</small></span>
          <Input value={form().sku} maxlength={100} required
                 onInput={e => setForm({ ...form(), sku: e.currentTarget.value })} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-foreground">Claim deadline <small class="text-muted-foreground font-normal">must be in the future</small></span>
          <Input type="datetime-local" value={form().claimDeadline} required
                 onInput={e => setForm({ ...form(), claimDeadline: e.currentTarget.value })} />
        </label>
        <div class="flex justify-end md:col-span-2">
          <Button size="sm" type="submit" disabled={acting() === 'create'}>
            {acting() === 'create' ? 'Creating…' : 'Create campaign'}
          </Button>
        </div>
      </form>
    </Show>

    <Show when={campaigns.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">Release campaigns unavailable: {errorMessage(campaigns.error, 'We couldn\'t reach the release campaigns. Try refreshing.')}</div></Show>
    <Show when={campaigns.data} fallback={<SkeletonRows count={3} />}>
      <Show when={campaigns.data!.pool.active_release_latarnicy > 0 || campaigns.data!.pool.missing_email > 0}>
        <KpiStrip>
          <KpiCard label="Active Latarnicy" value={campaigns.data!.pool.active_release_latarnicy} />
          <KpiCard label="Contactable" value={campaigns.data!.pool.contactable_latarnicy} />
          <KpiCard label="Missing Email" value={campaigns.data!.pool.missing_email} />
        </KpiStrip>
      </Show>

      <Show when={campaigns.data!.campaigns.length > 0} fallback={<EmptyState label="No release campaigns" hint="Release campaigns coordinate outreach around a single or album launch. Create one from the release plan." />}>
        <div class="flex flex-col gap-3 mt-4">
          <For each={showAllCampaigns() ? campaigns.data!.campaigns : campaigns.data!.campaigns.slice(0, MAX_VISIBLE)}>{(c) => (
            <Card class="p-4" classList={{ 'border-primary/30': selectedCampaign() === c.id }}>
              <div class="flex items-center justify-between gap-3">
                <strong class="text-foreground">{c.title}</strong>
                <Badge variant={toneToVariant(phaseTone(c.phase))}>{c.phase}</Badge>
              </div>
              <div class="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
                <span>{c.product_name} · {c.variant_label}</span>
                <span>SKU: {c.sku}</span>
                <span>Claim deadline: {formatDeadline(c.claim_deadline)}</span>
              </div>
              <div class="flex flex-wrap gap-3 mt-2 text-sm text-secondary-foreground">
                <span class="whitespace-nowrap">Notified: {c.notified_count}</span>
                <span class="whitespace-nowrap">Confirmed: {c.confirmed_count}</span>
                <span class="whitespace-nowrap">Prepared: {c.prepared_count}</span>
                <span class="whitespace-nowrap">Sent: {c.sent_count}</span>
                <span class="whitespace-nowrap">Delivered: {c.delivered_count}</span>
                <span class="whitespace-nowrap">Declined: {c.declined_count}</span>
                <span class="whitespace-nowrap">Expired: {c.expired_count}</span>
              </div>
              <div class="flex flex-wrap gap-2 mt-3">
                <Button variant="ghost" size="sm" onClick={() => setSelectedCampaign(selectedCampaign() === c.id ? null : c.id)}>
                  {selectedCampaign() === c.id ? 'Hide recipients' : 'Show recipients'}
                </Button>
                <Show when={c.phase === 'draft' || c.phase === 'ready'}>
                  <Button
                    size="sm"
                    disabled={acting() === c.id}
                    onClick={() => launchCampaign(c.id)}
                  >{acting() === c.id ? 'Launching…' : 'Launch'}</Button>
                </Show>
                <Show when={c.phase !== 'closed' && c.phase !== 'cancelled' && c.launched_at != null}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={acting() === c.id}
                    onClick={() => closeCampaign(c.id)}
                  >{acting() === c.id ? 'Closing…' : 'Close'}</Button>
                </Show>
              </div>

              <Show when={selectedCampaign() === c.id}>
                <Show when={recipients.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">Campaign recipients unavailable: {errorMessage(recipients.error, 'We couldn\'t reach the campaign recipients. Try refreshing.')}</div></Show>
                <Show when={recipients.data} fallback={<SkeletonRows count={3} />}>
                  <Table class="mt-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Kind</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Confirmed</TableHead>
                        <TableHead>Delivered</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <For each={recipients.data!.recipients}>{(r) => (
                        <TableRow>
                          <TableCell><strong class="text-foreground">{r.displayName}</strong>{r.recipientName ? <><br /><span class="text-muted-foreground">{r.recipientName}</span></> : null}</TableCell>
                          <TableCell>{r.beaconKind}</TableCell>
                          <TableCell>{r.city ?? '—'}</TableCell>
                          <TableCell><Badge variant={toneToVariant(recipientStatusTone(r.status))}>{r.status}</Badge></TableCell>
                          <TableCell>{formatTimestamp(r.confirmedAt)}</TableCell>
                          <TableCell>{formatTimestamp(r.deliveredAt)}</TableCell>
                        </TableRow>
                      )}</For>
                    </TableBody>
                  </Table>
                </Show>
              </Show>
            </Card>
          )}</For>
        </div>
        <Show when={campaigns.data!.campaigns.length > MAX_VISIBLE}>
          <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAllCampaigns(s => !s)}>
            {showAllCampaigns() ? 'Show less' : `Show all (${campaigns.data!.campaigns.length})`}
          </Button>
        </Show>
      </Show>
    </Show>
  </div>
}
