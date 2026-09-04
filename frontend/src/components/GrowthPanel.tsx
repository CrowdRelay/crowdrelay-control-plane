import { For, Show } from 'solid-js'
import type { GrowthCampaignProgress, GrowthOverview } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './EmptyState'
import { errorMessage } from '../lib/format'
import { SectionIcon } from './SectionIcon'

// CrowdRelay only queues growth campaigns; the sends happen in external n8n
// workers. The panel therefore reports whether those workers are draining the
// queue, which is the part an operator cannot see from CrowdRelay's own health.
const templateLabels: Record<string, string> = {
  'show.growth.free_fan_push.v1': 'Free fan push',
  'autopilot.spotify.follow.v1': 'Spotify follow',
  'autopilot.bandsintown.follow.v1': 'Bandsintown follow',
}

const templateLabel = (key: string) => templateLabels[key] ?? key
const count = (value: number | undefined) => value == null ? '—' : value.toLocaleString()

const formatTimestamp = (value: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString()
}

const deliveryTone = (data: GrowthOverview | undefined): 'good'|'warn'|'bad'|'muted' => {
  if (!data) return 'muted'
  if (data.totals.stalled_campaigns > 0) return 'bad'
  // Campaigns exist but delivery is switched off: nothing will ever drain.
  if (!data.campaigns_enabled && data.totals.scheduled_campaigns > 0) return 'bad'
  if (data.totals.failed > 0 || data.totals.pending > 0) return 'warn'
  return 'good'
}

const deliveryLabel = (data: GrowthOverview | undefined) => {
  if (!data) return 'loading'
  if (data.totals.stalled_campaigns > 0) return 'stalled'
  if (!data.campaigns_enabled) return data.totals.scheduled_campaigns > 0 ? 'delivery disabled' : 'disabled'
  if (data.totals.scheduled_campaigns > 0) return 'delivering'
  return 'idle'
}

const campaignTone = (campaign: GrowthCampaignProgress): 'good'|'warn'|'bad'|'muted' => {
  if (campaign.stalled) return 'bad'
  if (campaign.status === 'cancelled') return 'muted'
  if (campaign.status === 'completed') return campaign.failed_count > 0 ? 'warn' : 'good'
  return campaign.failed_count > 0 ? 'warn' : 'good'
}

const campaignStatus = (campaign: GrowthCampaignProgress) =>
  campaign.stalled ? 'stalled' : campaign.status

// Delivered vs. the frozen recipient snapshot. Campaigns with no recipients
// read as complete rather than dividing by zero.
const progressPercent = (campaign: GrowthCampaignProgress) => {
  if (campaign.recipient_count <= 0) return 100
  const done = campaign.delivered_count + campaign.failed_count
  return Math.min(100, Math.round((done / campaign.recipient_count) * 100))
}

export function GrowthPanel(props: { growth: GrowthOverview | null | undefined; degraded: boolean }) {
  // The Operations subpage owns the single read-model request; this panel only
  // renders its `growth` section. Keeping the rendering vocabulary as a small
  // shim keeps the degraded path local: a failed growth section leaves the rest
  // of the subpage intact.
  const growth = {
    get data() { return props.growth ?? undefined },
    get error() { return props.degraded ? new Error('Growth delivery telemetry is temporarily unavailable.') : undefined },
  }

  const totals = () => growth.data?.totals
  const outreach = () => growth.data?.outreach

  // Actionable guidance: when something is wrong, tell the operator what to do
  // instead of just showing a badge that says "stalled" or "disabled".
  const needsAction = () => {
    const t = totals()
    if (!t) return null
    if (t.stalled_campaigns > 0) return 'stalled'
    if (!growth.data?.campaigns_enabled && t.scheduled_campaigns > 0) return 'disabled'
    if (t.failed > 0) return 'failed'
    return null
  }

  const actionGuidance = () => {
    switch (needsAction()) {
      case 'stalled': return 'Campaigns are queued with recipients snapshotted but no delivery worker is claiming them. Check that the n8n growth delivery workflows are imported, active, and pointed at this tenant. The campaigns will start draining automatically once a worker picks them up.'
      case 'disabled': return 'Campaign delivery is switched off. Toggle the communication_campaigns_enabled switch in the Runtime switches section above to let n8n workers pick up the queue.'
      case 'failed': return 'Some deliveries failed permanently. Open the Operator Attention page to inspect dead deliveries and retry them individually.'
      default: return null
    }
  }

  return <article class="panel operations-panel">
    <div class="section-title operations-title">
      <div>
        <span class="eyebrow">AUTOPILOT GROWTH</span>
        <h2><SectionIcon name="trending-up" />Campaign delivery & outreach</h2>
        <p>CrowdRelay queues consented growth campaigns; external n8n workers deliver them. These counters come from the delivery ledger, so a campaign that nobody is draining stays visible.</p>
      </div>
      <StatusBadge status={deliveryLabel(growth.data)} tone={deliveryTone(growth.data)} />
    </div>

      <Show when={growth.error}>
        <div class="warning-card operations-warning" role="status">
          {errorMessage(growth.error, 'Growth delivery telemetry is temporarily unavailable.')}
        </div>
      </Show>

      <Show when={growth.data} fallback={!growth.error ? <div class="mini-skeleton"/> : null}>{data => <>
        <Show when={data().totals.stalled_campaigns > 0}>
          <div class="operations-attention">
            <strong>Growth delivery is stalled</strong>
            <span>{data().totals.stalled_campaigns} campaign(s) are due with recipients snapshotted but no delivery claimed. Check that the n8n growth delivery workflows are imported, active, and pointed at this tenant.</span>
          </div>
        </Show>
        <Show when={!data().campaigns_enabled && data().totals.scheduled_campaigns > 0}>
          <div class="operations-attention">
            <strong>Campaign delivery is disabled</strong>
            <span>{data().totals.scheduled_campaigns} scheduled growth campaign(s) cannot be delivered while <code>communication_campaigns_enabled</code> is off.</span>
          </div>
        </Show>

        {/* Actionable guidance — what to do when the badge is not "good". */}
        <Show when={needsAction()}>
          <div class="growth-action-guidance">
            <strong>What to do</strong>
            <p>{actionGuidance()}</p>
          </div>
        </Show>

        <div class="operations-metrics">
          <div><span>Delivered</span><strong>{count(totals()?.delivered)}</strong><small>{count(totals()?.failed)} failed</small></div>
          <div><span>Pending</span><strong>{count(totals()?.pending)}</strong><small>{count(totals()?.claimed)} claimed</small></div>
          <div><span>Scheduled</span><strong>{count(totals()?.scheduled_campaigns)}</strong><small>{count(totals()?.completed_campaigns)} completed</small></div>
          <div><span>Stalled</span><strong>{count(totals()?.stalled_campaigns)}</strong><small>no delivery claimed</small></div>
        </div>

        <section class="operations-section">
          <div class="operations-section-head">
            <div><span class="eyebrow">OUTREACH</span><h3><SectionIcon name="megaphone" />Playlist & press pitching</h3><p>Opportunities are seeded from verified, consenting targets only. Reply counts are what stop automated follow-ups.</p></div>
          </div>
          <div class="autopilot-kpis">
            <div><strong>{count(outreach()?.active_opportunities)}</strong><span>active opportunities</span></div>
            <div><strong>{count(outreach()?.playlist_opportunities)}</strong><span>playlist pitches</span></div>
            <div><strong>{count(outreach()?.awaiting_reply)}</strong><span>awaiting reply</span></div>
            <div><strong>{count(outreach()?.replies_14d)}</strong><span>replies · 14d</span></div>
          </div>
          <div class="rum-grid">
            <div><strong>{count(outreach()?.eligible_playlist_targets)}</strong><span>eligible playlist targets</span><small>active, verified, accepting outreach</small></div>
            <div><strong>{count(outreach()?.suppressed_targets)}</strong><span>suppressed targets</span><small>never contacted automatically</small></div>
          </div>
          <Show when={outreach() && outreach()!.eligible_playlist_targets === 0 && outreach()!.playlist_opportunities === 0}>
            <div class="inherit-card outreach-empty-state"><EmptyState label="No playlist targets" hint="The intelligence identifies eligible playlists for pitching. Targets appear here once the detector scans for them." /></div>
          </Show>
        </section>

        <section class="operations-section">
          <div class="operations-section-head">
            <div><span class="eyebrow">CAMPAIGNS</span><h3><SectionIcon name="megaphone" />Recent growth campaigns</h3></div>
          </div>
          <Show when={data().campaigns.length > 0} fallback={<div class="inherit-card"><EmptyState label="No growth campaigns" hint="Growth campaigns coordinate multi-step outreach. They appear here once the intelligence creates them." /></div>}>
            <div class="flag-list">
              <For each={data().campaigns}>{campaign => <div class="flag-row release-component-row">
                <div>
                  <strong>{campaign.name}</strong>
                  <small>{templateLabel(campaign.template_key)} · {campaign.recipient_count.toLocaleString()} recipient(s) · {progressPercent(campaign)}% resolved</small>
                  <small>
                    {campaign.delivered_count.toLocaleString()} delivered · {campaign.failed_count.toLocaleString()} failed · {campaign.pending_count.toLocaleString()} pending
                    <Show when={campaign.claimed_count > 0}>{` · ${campaign.claimed_count.toLocaleString()} claimed`}</Show>
                  </small>
                  <Show when={formatTimestamp(campaign.completed_at) ?? formatTimestamp(campaign.scheduled_at)}>{when =>
                    <small>{campaign.completed_at ? 'completed' : 'scheduled'} {when()}</small>
                  }</Show>
                </div>
                <div class="row-health">
                  <StatusBadge status={campaignStatus(campaign)} tone={campaignTone(campaign)} />
                </div>
              </div>}</For>
            </div>
          </Show>
        </section>
      </>}</Show>
  </article>
}
