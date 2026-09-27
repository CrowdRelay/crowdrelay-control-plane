import { For, Show, createSignal } from 'solid-js'
import { PanelTitle } from './layout'
import { Button } from './ui/button'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { confidencePercent, humanizeToken } from '../lib/format'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import { EmptyState } from './ui/empty-state'
import type { OpportunityShortlistEntry } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SkeletonPanel } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Card } from './app/card'

const timeAgo = (value: string | null | undefined) => {
  if (!value) return 'never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const seconds = Math.floor((Date.now() - parsed.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const formatMinor = (minor: number | null, currency: string) =>
  minor === null ? '—' : `${currency} ${(minor / 100).toLocaleString()}`

const KIND_LABELS: Record<string, string> = {
  festival: 'Festival',
  showcase: 'Showcase',
  review_contest: 'Contest',
  support_slot: 'Support slot',
  funding: 'Funding',
  booking: 'Booking lead',
  press: 'Press',
  interview: 'Interview',
  sync: 'Sync',
}

const STALE_LABELS: Record<string, string> = {
  no_destination: 'No link',
  stale_observation: 'Stale',
  deadline_passed: 'Deadline passed',
  ineligible: 'Ineligible',
  closed: 'Closed',
}

const statusTone = (entry: OpportunityShortlistEntry): 'good' | 'warn' | 'bad' | 'muted' => {
  if (entry.stale_reason === 'closed') return entry.status === 'won' ? 'good' : 'muted'
  if (entry.stale_reason) return 'warn'
  if (entry.status === 'submitted' || entry.status === 'replied') return 'good'
  return 'muted'
}

const statusLabel = (entry: OpportunityShortlistEntry) => {
  if (entry.stale_reason === 'closed') {
    return entry.status_reason ? `${humanizeToken(entry.status)} — ${entry.status_reason}` : humanizeToken(entry.status)
  }
  if (entry.stale_reason) return STALE_LABELS[entry.stale_reason] ?? humanizeToken(entry.stale_reason)
  return humanizeToken(entry.status)
}

const moneyLine = (entry: OpportunityShortlistEntry) => {
  const parts: string[] = []
  if (entry.expected_fee_minor !== null) {
    parts.push(`fee ${formatMinor(entry.expected_fee_minor, entry.currency)}`)
  }
  if (entry.estimated_cost_minor !== null) {
    const tag = entry.costed_from_logistics ? 'costed' : 'entered'
    parts.push(`cost ${formatMinor(entry.estimated_cost_minor, entry.currency)} (${tag})`)
  }
  if (entry.application_fee_minor !== null) {
    parts.push(`applies at ${formatMinor(entry.application_fee_minor, entry.currency)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'not costed'
}

export function OpportunityShortlistPanel() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const model = useQuery(() => ({
    queryKey: ['opportunity-shortlist', params().slug],
    queryFn: () => api.opportunityShortlist(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 20_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  const data = () => model.data
  const liveEntries = () => (data()?.entries ?? []).filter(e => e.stale_reason === null)
  const restEntries = () => (data()?.entries ?? []).filter(e => e.stale_reason !== null)
  const [showRest, setShowRest] = createSignal(false)
  const MAX_LIVE = 15

  return <Card flat>
    <div class="flex items-start justify-between gap-4 mb-3">
      <div>
        <PanelTitle icon={<SectionIcon name="target" />}>Opportunity shortlist</PanelTitle>
        <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
          Everything the scout and the pipelines have found — the link, the costed figures, and what happened to it. Work a row from its link; the decision queue carries the ones needing approval.
        </p>
      </div>
      <Show when={data()}>
        <StatusBadge
          status={liveEntries().length > 0 ? `${liveEntries().length} open` : 'clear'}
          tone={liveEntries().length > 0 ? 'warn' : 'good'}
        />
      </Show>
    </div>

    <Show when={model.error}>
      <div class="rounded-lg border border-warning-foreground/30 bg-warning-foreground/10 p-4 text-sm text-warning-foreground mt-4" role="status">
        {model.error instanceof Error ? model.error.message : 'The opportunity shortlist is temporarily unavailable.'}
      </div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonPanel lines={5} /></Show>

    <Show when={data()}>{d => <>
      <Show when={d().degraded.length > 0}>
        <div class="rounded-lg border border-warning-foreground/30 bg-warning-foreground/10 p-3 text-sm text-warning-foreground mb-3" role="status">
          Some sections could not be read — the list below may be incomplete. Retrying automatically.
        </div>
      </Show>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div>
          <span class="block text-muted-foreground text-sm">Open</span>
          <strong class="block my-1.5 text-foreground">{liveEntries().length}</strong>
          <small class="block text-muted-foreground text-sm">workable now</small>
        </div>
        <div>
          <span class="block text-muted-foreground text-sm">Stale</span>
          <strong class="block my-1.5 text-foreground">{d().stale_count}</strong>
          <small class="block text-warning-foreground text-sm">no link / old / passed</small>
        </div>
        <div>
          <span class="block text-muted-foreground text-sm">Closed</span>
          <strong class="block my-1.5 text-foreground">{d().closed_count}</strong>
          <small class="block text-muted-foreground text-sm">won · lost · dismissed</small>
        </div>
        <div>
          <span class="block text-muted-foreground text-sm">Ineligible</span>
          <strong class="block my-1.5 text-foreground">{d().ineligible_count}</strong>
          <small class="block text-muted-foreground text-sm">not for the pipeline</small>
        </div>
      </div>

      <section class="mt-6 pt-4 border-t border-border">
        <Show
          when={d().entries.length > 0}
          fallback={<EmptyState label="No opportunities tracked yet" hint="When the scout or an import finds a festival, a lead or a funding call, it lands here with its link." />}
        >
          <ul class="divide-y divide-border">
            <For each={liveEntries().slice(0, MAX_LIVE)}>
              {entry => (
                <li class="py-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <Show when={entry.destination_url} fallback={<span class="font-medium text-foreground">{entry.title}</span>}>
                          {url => (
                            <a href={url()} target="_blank" rel="noopener noreferrer" class="font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground">
                              {entry.title}
                            </a>
                          )}
                        </Show>
                        <span class="text-xs text-muted-foreground">{KIND_LABELS[entry.kind] ?? entry.kind.replace(/_/g, ' ')}</span>
                      </div>
                      <p class="text-sm text-muted-foreground mt-0.5">{entry.organization}</p>
                      <p class="text-xs text-muted-foreground mt-1">
                        {moneyLine(entry)}
                        {' · '}fit {confidencePercent(entry.fit_basis_points)}
                        {' · '}confidence {confidencePercent(entry.confidence_basis_points)}
                        {entry.deadline ? ` · deadline ${timeAgo(entry.deadline)}` : ''}
                        {entry.source_observed_at ? ` · seen ${timeAgo(entry.source_observed_at)}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={statusLabel(entry)} tone={statusTone(entry)} />
                  </div>
                </li>
              )}
            </For>
          </ul>
          <Show when={liveEntries().length > MAX_LIVE}>
            <p class="text-sm text-muted-foreground mt-2">Showing {MAX_LIVE} of {liveEntries().length} open rows.</p>
          </Show>

          <Show when={restEntries().length > 0}>
            <div class="mt-4">
              <Button
                type="button"
                variant="ghost"
                class="h-auto px-0 text-sm text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
                onClick={() => setShowRest(v => !v)}
              >
                {showRest() ? 'Hide' : 'Show'} {restEntries().length} closed or stale rows
              </Button>
              <Show when={showRest()}>
                <ul class="divide-y divide-border mt-2 opacity-75">
                  <For each={restEntries()}>
                    {entry => (
                      <li class="py-2.5">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="font-medium text-foreground">{entry.title}</span>
                              <span class="text-xs text-muted-foreground">{KIND_LABELS[entry.kind] ?? entry.kind.replace(/_/g, ' ')}</span>
                            </div>
                            <p class="text-xs text-muted-foreground mt-1">
                              {entry.organization}
                              {entry.source_observed_at ? ` · seen ${timeAgo(entry.source_observed_at)}` : ''}
                            </p>
                          </div>
                          <StatusBadge status={statusLabel(entry)} tone={statusTone(entry)} />
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </Show>
        </Show>
      </section>
    </>}</Show>
  </Card>
}
