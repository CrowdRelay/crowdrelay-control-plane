import { For, Show } from 'solid-js'
import type { UnpublishedDraftChannel } from '../lib/attention'
import { SectionIcon } from './SectionIcon'
import { Card } from './ui/card'
import { Badge } from './ui/badge'

// Drafted posts waiting for a person to publish them.
//
// Every outbound channel drafts and waits: Reddit is read-only by policy,
// Telegram, Discord and social default to manual. This is the one queue on the
// attention page where the system is blocked on the operator rather than the
// reverse, and until now it was the only part of the growth loop the
// exception-first view could not see.
//
// A draft nobody publishes reaches nobody. The brain no longer learns a false
// zero from it — the measurement is abandoned rather than recorded — but the
// post is still spent work and the fan it would have brought does not arrive.
//
// Absent is not empty. When the tenant does not report the queue at all, the
// panel says so instead of showing a zero nobody measured.

const CHANNEL_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  telegram: 'Telegram',
  discord: 'Discord',
  social: 'Social',
}

const channelLabel = (channel: string) => CHANNEL_LABELS[channel] ?? channel

// Telegram and Discord publish through first-party Bot APIs and are manual
// only because their auto-post flag defaults off. Reddit is manual by policy.
// The distinction is the whole action an operator can take, so it is shown.
const CHANNEL_REASONS: Record<string, string> = {
  reddit: 'read-only by policy — publish and register the URL',
  telegram: 'awaiting CROWDRELAY_TELEGRAM_AUTO_POST',
  discord: 'awaiting CROWDRELAY_DISCORD_AUTO_POST',
  social: 'no automatic path implemented',
}

const ageInDays = (iso: string | null): number | null => {
  if (!iso) return null
  const drafted = new Date(iso)
  if (Number.isNaN(drafted.getTime())) return null
  return Math.floor((Date.now() - drafted.getTime()) / 86_400_000)
}

// A day-old queue is normal. A week-old one is a channel nobody is running.
const STALE_AFTER_DAYS = 3

export function UnpublishedDraftsPanel(props: {
  drafts: UnpublishedDraftChannel[]
  notReported: string[]
}) {
  const reported = () => !props.notReported.includes('unpublished_drafts')
  const total = () => props.drafts.reduce((sum, channel) => sum + channel.drafts, 0)
  const oldestDays = () => {
    const ages = props.drafts
      .map(channel => ageInDays(channel.oldest_drafted_at))
      .filter((age): age is number => age !== null)
    return ages.length > 0 ? Math.max(...ages) : null
  }

  return <Card class="p-4 unpublished-drafts-panel">
    <div class="learning-loop-head">
      <div>
        <h2><SectionIcon name="inbox" />Waiting on you to publish</h2>
        <p class="text-muted-foreground text-sm">
          The brain drafted these. Nobody has posted them, so they have reached nobody.
        </p>
      </div>
    </div>

    <Show when={reported()} fallback={
      <p class="learning-loop-pending">This tenant does not report the draft queue.</p>
    }>
      <Show when={total() > 0} fallback={
        <p class="text-muted-foreground text-sm">No drafts waiting. Everything the brain wrote is published.</p>
      }>
        <div class="learning-loop-summary">
          <div class="learning-loop-stat">
            <span>Drafts waiting</span>
            <strong>{total()}</strong>
          </div>
          <Show when={oldestDays() !== null}>
            <div class="learning-loop-stat learning-loop-stat-highlight">
              <span>Oldest</span>
              <strong>{oldestDays()}d</strong>
            </div>
          </Show>
        </div>

        <div class="learning-proof-list">
          <For each={props.drafts}>{(channel) => {
            const age = ageInDays(channel.oldest_drafted_at)
            const stale = age !== null && age >= STALE_AFTER_DAYS
            return <div class="learning-proof-cause">
              <Badge variant={stale ? 'warning' : 'muted'}>{channelLabel(channel.channel)}</Badge>
              <strong>{channel.drafts} draft{channel.drafts === 1 ? '' : 's'}</strong>
              <Show when={age !== null}>
                <span class={stale ? 'learning-loop-outcome-worsened' : 'text-muted-foreground'}>
                  oldest {age}d
                </span>
              </Show>
              <span class="text-muted-foreground">
                {CHANNEL_REASONS[channel.channel] ?? 'awaiting an operator'}
              </span>
            </div>
          }}</For>
        </div>
      </Show>
    </Show>
  </Card>
}
