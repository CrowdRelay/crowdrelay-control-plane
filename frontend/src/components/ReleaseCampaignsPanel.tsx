import { SurfaceAction } from './capabilities/SurfaceAction'
import { FormDrawer } from './app/form-drawer'
import { Field } from './ui/field'
import { Image, Plus } from 'lucide-solid'
import { failureLine } from '../lib/errors'
import { capabilityAction } from '../lib/capabilities'
import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshQueries } from '../lib/refresh'
import { formatTimestamp, humanizeToken } from '../lib/format'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { KpiStrip, KpiCard, ErrorCard } from './layout'
import { Card } from './app/card'
import { Button } from './app/button'
import { Input } from './ui/input'
import { Badge } from './app/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'

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

  return <div class="space-y-4">
    <div class="flex items-start justify-between gap-4">
      <p class="text-sm text-muted-foreground">Physical release delivery to amplifiers. Launch a campaign to notify eligible amplifiers; close it when every parcel is delivered.</p>
      <div class="flex shrink-0 items-center gap-2 flex-wrap">
        <Show when={campaigns.data}>
          <span class="text-sm text-muted-foreground">{campaigns.data!.campaigns.length} campaigns · {campaigns.data!.pool.contactable_latarnicy ?? '—'} contactable</span>
        </Show>
        <Button writes variant="outline" size="sm" onClick={() => { setError(null); setCreating(true) }}>
          <Plus aria-hidden="true" /> Add release campaign
        </Button>
      </div>
    </div>
    <Show when={error() && !creating()}>
      <ErrorCard>{error()}</ErrorCard>
    </Show>

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

    <Show when={campaigns.error}><ErrorCard title="Couldn't load release campaigns" error={campaigns.error} onRetry={() => void campaigns.refetch()} /></Show>
    <Show when={campaigns.data} fallback={<SkeletonRows count={3} />}>
      <Show when={campaigns.data!.pool.active_release_latarnicy > 0 || campaigns.data!.pool.missing_email > 0}>
        <KpiStrip>
          <KpiCard label="Active Latarnicy" value={campaigns.data!.pool.active_release_latarnicy} />
          <KpiCard label="Contactable" value={campaigns.data!.pool.contactable_latarnicy} />
          <KpiCard label="Missing Email" value={campaigns.data!.pool.missing_email} />
        </KpiStrip>
      </Show>

      <Show when={campaigns.data!.campaigns.length > 0} fallback={<EmptyState icon={<Image />} label="No release campaigns" hint="Release campaigns coordinate outreach around a single or album launch. Create one from the release plan." />}>
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
                  <Button writes
                    size="sm"
                    disabled={acting() === c.id}
                    onClick={() => launchCampaign(c.id)}
                  >{acting() === c.id ? 'Launching…' : 'Launch'}</Button>
                </Show>
                <Show when={c.phase !== 'closed' && c.phase !== 'cancelled' && c.launched_at != null}>
                  <Button writes
                    variant="ghost"
                    size="sm"
                    disabled={acting() === c.id}
                    onClick={() => closeCampaign(c.id)}
                  >{acting() === c.id ? 'Closing…' : 'Close'}</Button>
                </Show>
              </div>

              <Show when={selectedCampaign() === c.id}>
                <Show when={recipients.error}><ErrorCard title="Couldn't load campaign recipients" error={recipients.error} onRetry={() => void recipients.refetch()} /></Show>
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
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <For each={recipients.data!.recipients}>{(r) => (
                        <TableRow>
                          <TableCell><strong class="text-foreground">{r.displayName}</strong>{r.recipientName ? <><br /><span class="text-muted-foreground">{r.recipientName}</span></> : null}</TableCell>
                          <TableCell>{r.beaconKind}</TableCell>
                          <TableCell>{r.city ?? '—'}</TableCell>
                          <TableCell><Badge variant={toneToVariant(recipientStatusTone(r.status))}>{humanizeToken(r.status)}</Badge></TableCell>
                          <TableCell>{formatTimestamp(r.confirmedAt)}</TableCell>
                          <TableCell>{formatTimestamp(r.deliveredAt)}</TableCell>
                          <TableCell>
                            {/* The parcel's own progress — only the person
                                packing and posting it knows it moved. */}
                            <Show when={r.status !== 'delivered' && r.status !== 'cancelled'}>
                              <SurfaceAction
                                slug={props.slug}
                                size="xs"
                                variant="ghost"
                                action={capabilityAction('release-recipient', 'Update recipient')}
                                label="Mark parcel"
                                fixed={{ campaign_id: r.campaignId, beacon_id: r.beaconId }}
                                onDone={() => refreshQueries(['release-campaigns', props.slug], ['release-recipients', props.slug])}
                              />
                            </Show>
                          </TableCell>
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
            {showAllCampaigns() ? 'Show fewer' : `Show all ${campaigns.data!.campaigns.length}`}
          </Button>
        </Show>
      </Show>
    </Show>
  </div>
}
