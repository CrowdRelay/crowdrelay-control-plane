import { For, Show, createResource } from 'solid-js'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { formatTimestamp } from '../lib/format'
import type { PlayLedger, PlayKindStanding } from '../lib/types'
import { EmptyState } from './EmptyState'
import { SkeletonBlock } from './Skeleton'

const kindLabel = (kind: string): string => {
  switch (kind) {
    case 'track_us_ask': return 'Track Us Ask'
    case 'listing_completeness_sweep': return 'Listing Sweep'
    case 'follow_ask_ladder': return 'Follow Ladder'
    case 'dormant_revival': return 'Dormant Revival'
    case 'release_runway': return 'Release Runway'
    default: return kind
  }
}

const stateTone = (state: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (state) {
    case 'completed': return 'good'
    case 'running': return 'warn'
    case 'failed': case 'cancelled': return 'bad'
    default: return 'muted'
  }
}

const standingLabel = (s: PlayKindStanding): string => {
  const st = s.standing
  switch (st.standing) {
    case 'untested': return `Untested (${st.measured} measured)`
    case 'weighted': return `Weighted ${Math.round(st.basis_points / 100)}% (${st.measured} measured)`
    case 'retired': return `Retired (${st.reason})`
  }
}

const standingTone = (s: PlayKindStanding): 'good' | 'warn' | 'bad' | 'muted' => {
  const st = s.standing
  switch (st.standing) {
    case 'weighted': return st.basis_points >= 5000 ? 'good' : 'warn'
    case 'retired': return 'bad'
    default: return 'muted'
  }
}

const effectTone = (effect: string | null): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (effect) {
    case 'improved': return 'good'
    case 'neutral': return 'muted'
    case 'worsened': return 'bad'
    default: return 'muted'
  }
}

export function PlayLedgerPanel(props: { slug: string }) {
  const refreshSource = () => refreshTick()

  const [ledger] = createResource(refreshSource, async () => {
    try {
      return await api.playLedger(props.slug)
    } catch {
      return null
    }
  })

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Play Ledger</h3>
      <Show when={ledger()}>
        <span class="muted">{ledger()!.plays.length} plays · {ledger()!.standings.length} kinds</span>
      </Show>
    </div>
    <p class="agent-section-intro">What the agent committed to, what it did, and what each number is allowed to prove. Each play is a structured experiment with claims, evidence, and effect assessment.</p>

    <Show when={ledger()} fallback={<SkeletonBlock height="120px" radius="10px" />}>
      <Show when={ledger()!.standings.length > 0}>
        <h4 class="subsection">Kind Standings</h4>
        <div class="standings-grid">
          <For each={ledger()!.standings}>{(s) => (
            <div class="standing-card">
              <div class="standing-head">
                <strong>{kindLabel(s.kind)}</strong>
                <span class={`badge tone-${standingTone(s)}`}>{s.standing.standing}</span>
              </div>
              <div class="standing-meta">
                <span>{standingLabel(s)}</span>
              </div>
              <div class="standing-record">
                <span class="tone-good">↑{s.record.improved}</span>
                <span class="tone-muted">={s.record.neutral}</span>
                <span class="tone-bad">↓{s.record.worsened}</span>
                <span class="muted">?{s.record.insufficient}</span>
              </div>
              <div class="standing-meta">
                <span>Max recipients/step: {s.effective_max_recipients_per_step}</span>
              </div>
            </div>
          )}</For>
        </div>
      </Show>

      <Show when={ledger()!.plays.length > 0} fallback={<EmptyState label="No plays recorded" hint="The play ledger tracks every action the intelligence has executed. Plays appear here once the autopilot starts dispatching." />}>
        <h4 class="subsection">Plays</h4>
        <div class="play-list">
          <For each={ledger()!.plays}>{(p) => (
            <div class="play-card">
              <div class="play-card-head">
                <strong>{kindLabel(p.kind)}</strong>
                <span class={`badge tone-${stateTone(p.state)}`}>{p.state}</span>
              </div>
              <div class="play-meta">
                <span>Started: {formatTimestamp(p.started_at)}</span>
                <Show when={p.completed_at}><span>Completed: {formatTimestamp(p.completed_at)}</span></Show>
                <span>Steps: {p.steps_settled}/{p.steps_total} settled, {p.steps_skipped} skipped</span>
                <span>Recipients reached: {p.recipients_reached}</span>
              </div>
              <Show when={p.hypothesis}>
                <p class="play-hypothesis">{p.hypothesis}</p>
              </Show>
              <Show when={p.claims.length > 0}>
                <div class="claims-list">
                  <For each={p.claims}>{(c) => (
                    <div class="claim-row">
                      <span class={`badge tone-${effectTone(c.effect)}`}>{c.effect ?? c.status}</span>
                      <span class="muted">{c.claim_means}</span>
                      <span>{c.success_metric_platform}/{c.success_metric_key}</span>
                      <Show when={c.delta_basis_points != null}>
                        {(() => { const delta = c.delta_basis_points!; return (
                        <span class={delta > 0 ? 'tone-good' : 'tone-bad'}>
                          {delta > 0 ? '+' : ''}{(delta / 100).toFixed(1)}%
                        </span>
                        ) })()}
                      </Show>
                    </div>
                  )}</For>
                </div>
              </Show>
            </div>
          )}</For>
        </div>
      </Show>
    </Show>
  </div>
}
