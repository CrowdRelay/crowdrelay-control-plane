import { For, Show, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { refreshTick, triggerRefresh } from '../lib/refresh'
import { errorMessage, formatTimestamp } from '../lib/format'
import type { AdminReleaseCampaignsResponse, AdminReleaseRecipientsResponse } from '../lib/types'

const phaseTone = (phase: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (phase) {
    case 'delivering': case 'delivered': return 'good'
    case 'preparing': case 'claiming': return 'warn'
    case 'cancelled': case 'expired': return 'bad'
    default: return 'muted'
  }
}

const recipientStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' => {
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
  const [selectedCampaign, setSelectedCampaign] = createSignal<string | null>(null)
  const refreshSource = () => refreshTick()

  const [campaigns] = createResource(refreshSource, async () => {
    try {
      return await api.beaconReleaseCampaigns(props.slug)
    } catch {
      return null
    }
  })

  const [recipients] = createResource(selectedCampaign, async (campaignId) => {
    if (!campaignId) return null
    try {
      return await api.beaconReleaseRecipients(props.slug, campaignId)
    } catch {
      return null
    }
  })

  const launchCampaign = async (campaignId: string) => {
    setActing(campaignId)
    setError(null)
    try {
      await api.launchBeaconReleaseCampaign(props.slug, campaignId)
      triggerRefresh()
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
      triggerRefresh()
    } catch (err) {
      setError(errorMessage(err, 'Failed to close campaign'))
    } finally {
      setActing(null)
    }
  }

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Release Campaigns</h3>
      <Show when={campaigns()}>
        <span class="muted">{campaigns()!.campaigns.length} campaigns · {campaigns()!.pool.contactable_latarnicy} contactable</span>
      </Show>
    </div>
    <p class="agent-section-intro">Physical release delivery to beacon recipients. Launch a campaign to notify eligible beacons; close when all parcels are delivered.</p>

    <Show when={error()}>
      <div class="error-card">{error()}</div>
    </Show>

    <Show when={campaigns()} fallback={<p class="muted">Loading release campaigns…</p>}>
      <Show when={campaigns()!.pool.active_release_latarnicy > 0 || campaigns()!.pool.missing_email > 0}>
        <div class="kpi-strip">
          <div class="kpi"><span class="kpi-value">{campaigns()!.pool.active_release_latarnicy}</span><span class="kpi-label">Active Latarnicy</span></div>
          <div class="kpi"><span class="kpi-value">{campaigns()!.pool.contactable_latarnicy}</span><span class="kpi-label">Contactable</span></div>
          <div class="kpi"><span class="kpi-value">{campaigns()!.pool.missing_email}</span><span class="kpi-label">Missing Email</span></div>
        </div>
      </Show>

      <Show when={campaigns()!.campaigns.length > 0} fallback={<p class="muted">No release campaigns yet.</p>}>
        <div class="campaign-list">
          <For each={campaigns()!.campaigns}>{(c) => (
            <div class="campaign-card" classList={{ selected: selectedCampaign() === c.id }}>
              <div class="campaign-card-head">
                <strong>{c.title}</strong>
                <span class={`badge tone-${phaseTone(c.phase)}`}>{c.phase}</span>
              </div>
              <div class="campaign-meta">
                <span>{c.product_name} · {c.variant_label}</span>
                <span>SKU: {c.sku}</span>
                <span>Claim deadline: {formatDeadline(c.claim_deadline)}</span>
              </div>
              <div class="campaign-progress">
                <span>Notified: {c.notified_count}</span>
                <span>Confirmed: {c.confirmed_count}</span>
                <span>Prepared: {c.prepared_count}</span>
                <span>Sent: {c.sent_count}</span>
                <span>Delivered: {c.delivered_count}</span>
                <span>Declined: {c.declined_count}</span>
                <span>Expired: {c.expired_count}</span>
              </div>
              <div class="campaign-actions">
                <button class="ghost" onClick={() => setSelectedCampaign(selectedCampaign() === c.id ? null : c.id)}>
                  {selectedCampaign() === c.id ? 'Hide recipients' : 'Show recipients'}
                </button>
                <Show when={c.phase === 'draft' || c.phase === 'ready'}>
                  <button
                    class="primary"
                    disabled={acting() === c.id}
                    onClick={() => launchCampaign(c.id)}
                  >{acting() === c.id ? 'Launching…' : 'Launch'}</button>
                </Show>
                <Show when={c.phase !== 'closed' && c.phase !== 'cancelled' && c.launched_at != null}>
                  <button
                    class="ghost"
                    disabled={acting() === c.id}
                    onClick={() => closeCampaign(c.id)}
                  >{acting() === c.id ? 'Closing…' : 'Close'}</button>
                </Show>
              </div>

              <Show when={selectedCampaign() === c.id}>
                <Show when={recipients()} fallback={<p class="muted">Loading recipients…</p>}>
                  <div class="table-wrap">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Recipient</th>
                          <th>Kind</th>
                          <th>City</th>
                          <th>Status</th>
                          <th>Confirmed</th>
                          <th>Delivered</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={recipients()!.recipients}>{(r) => (
                          <tr>
                            <td><strong>{r.displayName}</strong>{r.recipientName ? <><br /><span class="muted">{r.recipientName}</span></> : null}</td>
                            <td>{r.beaconKind}</td>
                            <td>{r.city ?? '—'}</td>
                            <td><span class={`badge tone-${recipientStatusTone(r.status)}`}>{r.status}</span></td>
                            <td>{formatTimestamp(r.confirmedAt)}</td>
                            <td>{formatTimestamp(r.deliveredAt)}</td>
                          </tr>
                        )}</For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </Show>
            </div>
          )}</For>
        </div>
      </Show>
    </Show>
  </div>
}
