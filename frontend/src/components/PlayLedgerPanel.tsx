import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { formatTimestamp, errorMessage } from '../lib/format'
import type { PlayKindStanding } from '../lib/types'
import { EmptyState } from './EmptyState'
import { SkeletonBlock } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

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

// Map the legacy `tone-*` vocabulary onto shadCN Badge variants and Tailwind
// text/border utilities. The tones are the same good/warn/bad/muted the
// decision row emits; the Badge primitive owns the actual colours.
const toneVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

const toneBorder = (tone: 'good' | 'warn' | 'bad' | 'muted'): string =>
  tone === 'good' ? 'border-l-success' : tone === 'warn' ? 'border-l-warning' : tone === 'bad' ? 'border-l-destructive' : 'border-l-border'

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

  return <Card class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3 class="text-base font-semibold text-foreground m-0">Play ledger</h3>
      <Show when={ledger.data}>
        <span class="text-muted-foreground">{ledger.data!.plays.length} plays · {ledger.data!.standings.length} kinds</span>
      </Show>
    </div>
    <p class="text-muted-foreground text-sm leading-relaxed mt-2">What the agent committed to, what it did, and what each number is allowed to prove. Each play is a structured experiment with claims, evidence, and effect assessment.</p>

    <Show when={ledger.error}>
      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">Play ledger unavailable: {errorMessage(ledger.error, 'Service unreachable')}</div>
    </Show>
    <Show when={ledger.data} fallback={<SkeletonBlock height="120px" radius="10px" />}>
      <Show when={ledger.data!.standings.length > 0}>
        <h4 class="text-sm font-semibold text-foreground flex items-center gap-2 mt-6 pt-6 border-t border-border"><SectionIcon name="list-checks" />Kind Standings</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 mb-4">
          <For each={showAllStandings() ? ledger.data!.standings : ledger.data!.standings.slice(0, MAX_VISIBLE_STANDINGS)}>{(s) => (
            <div class={`p-4 rounded-lg border border-border border-l-2 ${toneBorder(standingTone(s))} bg-card`}>
              <div class="flex justify-between items-center mb-1.5">
                <strong class="text-foreground">{kindLabel(s.kind)}</strong>
                <Badge variant={toneVariant(standingTone(s))}>{s.standing.standing}</Badge>
              </div>
              <div class="text-sm text-muted-foreground mb-1">
                <span>{standingLabel(s)}</span>
              </div>
              <div class="flex gap-2.5 text-sm font-semibold">
                <span class="text-success">↑{s.record.improved}</span>
                <span class="text-muted-foreground">={s.record.neutral}</span>
                <span class="text-destructive">↓{s.record.worsened}</span>
                <span class="text-muted-foreground">?{s.record.insufficient}</span>
              </div>
              <div class="text-sm text-muted-foreground mt-1">
                <span>Recipient cap per step: {s.effective_max_recipients_per_step}</span>
              </div>
            </div>
          )}</For>
        </div>
        <Show when={ledger.data!.standings.length > MAX_VISIBLE_STANDINGS}>
          <Button variant="ghost" size="sm" onClick={() => setShowAllStandings(s => !s)}>
            {showAllStandings() ? 'Show less' : `Show all (${ledger.data!.standings.length})`}
          </Button>
        </Show>
      </Show>

      <Show when={ledger.data!.plays.length > 0} fallback={<EmptyState label="No plays recorded" hint="The play ledger tracks every action the intelligence has executed. Plays appear here once the autopilot starts dispatching." />}>
        <h4 class="text-sm font-semibold text-foreground flex items-center gap-2 mt-6 pt-6 border-t border-border"><SectionIcon name="play" />Plays</h4>
        <div class="flex flex-col gap-3 mt-3">
          <For each={showAllPlays() ? ledger.data!.plays : ledger.data!.plays.slice(0, MAX_VISIBLE_PLAYS)}>{(p) => (
            <div class={`p-4 rounded-lg border border-border border-l-2 ${toneBorder(stateTone(p.state))} bg-card`}>
              <div class="flex justify-between items-center mb-2">
                <strong class="text-foreground">{kindLabel(p.kind)}</strong>
                <Badge variant={toneVariant(stateTone(p.state))}>{p.state}</Badge>
              </div>
              <div class="flex gap-4 text-sm text-muted-foreground mb-2 flex-wrap">
                <span>Started: {formatTimestamp(p.started_at)}</span>
                <Show when={p.completed_at}><span>Completed: {formatTimestamp(p.completed_at)}</span></Show>
                <span>Steps: {p.steps_settled}/{p.steps_total} settled, {p.steps_skipped} skipped</span>
                <span>Recipients reached: {p.recipients_reached}</span>
              </div>
              <Show when={p.hypothesis}>
                <p class="text-sm text-secondary-foreground italic my-1.5 px-2 py-1.5 rounded-md bg-surface-1 border border-border-subtle">{p.hypothesis}</p>
              </Show>
              <Show when={p.claims.length > 0}>
                <div class="flex flex-col gap-1.5 mt-2">
                  <For each={expandedClaims().has(p.play_id) ? p.claims : p.claims.slice(0, MAX_VISIBLE_CLAIMS)}>{(c) => (
                    <div class="flex gap-2.5 items-center text-sm py-1 px-1.5 rounded-md bg-surface-1 border border-border-subtle">
                      <Badge variant={toneVariant(effectTone(c.effect))}>{c.effect ?? c.status}</Badge>
                      <span class="text-muted-foreground">{claimLabel(c.claim_means)}</span>
                      <span>{metricLabel(c.success_metric_platform, c.success_metric_key)}</span>
                      <Show when={c.delta_basis_points != null}>
                        {(() => { const delta = c.delta_basis_points!; return (
                        <span class={delta > 0 ? 'text-success' : 'text-destructive'}>
                          {delta > 0 ? '+' : ''}{(delta / 100).toFixed(1)}%
                        </span>
                        ) })()}
                      </Show>
                    </div>
                  )}</For>
                </div>
                <Show when={p.claims.length > MAX_VISIBLE_CLAIMS}>
                  <Button variant="ghost" size="sm" class="mt-2" onClick={() => toggleClaims(p.play_id)}>
                    {expandedClaims().has(p.play_id) ? 'Show less' : `Show all (${p.claims.length})`}
                  </Button>
                </Show>
              </Show>
            </div>
          )}</For>
        </div>
        <Show when={ledger.data!.plays.length > MAX_VISIBLE_PLAYS}>
          <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAllPlays(s => !s)}>
            {showAllPlays() ? 'Show less' : `Show all (${ledger.data!.plays.length})`}
          </Button>
        </Show>
      </Show>
    </Show>
  </Card>
}
