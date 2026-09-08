import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { formatTimestamp, errorMessage } from '../lib/format'
import type { PlayKindStanding } from '../lib/types'
import { EmptyState } from './EmptyState'
import { SkeletonBlock } from './Skeleton'
import { SectionIcon } from './SectionIcon'

const kindLabel = (kind: string): string => {
  switch (kind) {
    case 'track_us_ask': return 'Track Us Ask'
    case 'listing_completeness_sweep': return 'Listing Sweep'
    case 'follow_ask_ladder': return 'Follow Ladder'
    case 'dormant_revival': return 'Dormant Revival'
    case 'release_runway': return 'Release Runway'
    default: return kind.replaceAll('_', ' ')
  }
}

// Translate the raw internal vocabulary in claim rows so an operator reads
// "Effect +5.2% on Spotify followers" instead of "improved · basis_points ·
// spotify / followers". The keys come straight from the decision row.
const claimLabel = (means: string): string => {
  switch (means) {
    case 'basis_points': return 'Effect'
    case 'absolute': return 'Change'
    case 'count': return 'Count'
    default: return means.replaceAll('_', ' ')
  }
}

const metricLabel = (platform: string, key: string): string => {
  const p = platform.replaceAll('_', ' ')
  const k = key.replaceAll('_', ' ')
  return `${p} · ${k}`
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
  const ledger = useQuery(() => ({
    queryKey: ['play-ledger', props.slug],
    queryFn: () => api.playLedger(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const [showAllStandings, setShowAllStandings] = createSignal(false)
  const [showAllPlays, setShowAllPlays] = createSignal(false)
  const [expandedClaims, setExpandedClaims] = createSignal<Set<string>>(new Set())
  const MAX_VISIBLE_STANDINGS = 6
  const MAX_VISIBLE_PLAYS = 10
  const MAX_VISIBLE_CLAIMS = 5

  const toggleClaims = (playId: string) =>
    setExpandedClaims(prev => {
      const next = new Set(prev)
      if (next.has(playId)) next.delete(playId)
      else next.add(playId)
      return next
    })

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Play ledger</h3>
      <Show when={ledger.data}>
        <span class="muted">{ledger.data!.plays.length} plays · {ledger.data!.standings.length} kinds</span>
      </Show>
    </div>
    <p class="agent-section-intro">What the agent committed to, what it did, and what each number is allowed to prove. Each play is a structured experiment with claims, evidence, and effect assessment.</p>

    <Show when={ledger.error}>
      <div class="error-card">Play ledger unavailable: {errorMessage(ledger.error, 'Service unreachable')}</div>
    </Show>
    <Show when={ledger.data} fallback={<SkeletonBlock height="120px" radius="10px" />}>
      <Show when={ledger.data!.standings.length > 0}>
        <h4 class="subsection"><SectionIcon name="list-checks" />Kind Standings</h4>
        <div class="standings-grid">
          <For each={showAllStandings() ? ledger.data!.standings : ledger.data!.standings.slice(0, MAX_VISIBLE_STANDINGS)}>{(s) => (
            <div class={`standing-card standing-card-${standingTone(s)}`}>
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
                <span>Recipient cap per step: {s.effective_max_recipients_per_step}</span>
              </div>
            </div>
          )}</For>
        </div>
        <Show when={ledger.data!.standings.length > MAX_VISIBLE_STANDINGS}>
          <button class="ghost" onClick={() => setShowAllStandings(s => !s)}>
            {showAllStandings() ? 'Show less' : `Show all (${ledger.data!.standings.length})`}
          </button>
        </Show>
      </Show>

      <Show when={ledger.data!.plays.length > 0} fallback={<EmptyState label="No plays recorded" hint="The play ledger tracks every action the intelligence has executed. Plays appear here once the autopilot starts dispatching." />}>
        <h4 class="subsection"><SectionIcon name="play" />Plays</h4>
        <div class="play-list">
          <For each={showAllPlays() ? ledger.data!.plays : ledger.data!.plays.slice(0, MAX_VISIBLE_PLAYS)}>{(p) => (
            <div class={`play-card play-card-${stateTone(p.state)}`}>
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
                  <For each={expandedClaims().has(p.play_id) ? p.claims : p.claims.slice(0, MAX_VISIBLE_CLAIMS)}>{(c) => (
                    <div class="claim-row">
                      <span class={`badge tone-${effectTone(c.effect)}`}>{c.effect ?? c.status}</span>
                      <span class="muted">{claimLabel(c.claim_means)}</span>
                      <span>{metricLabel(c.success_metric_platform, c.success_metric_key)}</span>
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
                <Show when={p.claims.length > MAX_VISIBLE_CLAIMS}>
                  <button class="ghost" onClick={() => toggleClaims(p.play_id)}>
                    {expandedClaims().has(p.play_id) ? 'Show less' : `Show all (${p.claims.length})`}
                  </button>
                </Show>
              </Show>
            </div>
          )}</For>
        </div>
        <Show when={ledger.data!.plays.length > MAX_VISIBLE_PLAYS}>
          <button class="ghost" onClick={() => setShowAllPlays(s => !s)}>
            {showAllPlays() ? 'Show less' : `Show all (${ledger.data!.plays.length})`}
          </button>
        </Show>
      </Show>
    </Show>
  </div>
}
