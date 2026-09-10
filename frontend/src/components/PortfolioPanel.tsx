import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { PortfolioConsent, PortfolioConsentStatus, PortfolioOverview } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { KpiValue } from './KpiValue'
import { EmptyState } from './ui/empty-state'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'

const STATUS_TONE: Record<PortfolioConsentStatus, 'good' | 'warn' | 'bad' | 'muted'> = {
  proposed: 'warn',
  active: 'good',
  paused: 'muted',
  revoked: 'bad',
}

const STATUS_LABEL: Record<PortfolioConsentStatus, string> = {
  proposed: 'Proposed',
  active: 'Active',
  paused: 'Paused',
  revoked: 'Revoked',
}

const PURPOSE_LABEL: Record<PortfolioConsent['purpose'], string> = {
  cross_promote: 'Cross-promote',
  release_feature: 'Release feature',
  event_crossbill: 'Event cross-bill',
}

const metric = (value: number | undefined) => value == null ? '—' : value.toLocaleString()

// One decision per row at a time; the button that started it disables the rest
// until the query settles.
export function PortfolioPanel(props: {
  slug: string
  overview: PortfolioOverview | undefined
  consents: PortfolioConsent[] | undefined
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [pendingId, setPendingId] = createSignal<string | null>(null)
  const [errorText, setErrorText] = createSignal<string | null>(null)
  // The row currently showing its inline form. Clicking Approve/Decline/Revoke
  // expands a small form below that row instead of requiring global fields.
  const [expandedRow, setExpandedRow] = createSignal<string | null>(null)
  const [rowActor, setRowActor] = createSignal('')
  const [rowReason, setRowReason] = createSignal('')

  const decide = useMutation(() => ({
    mutationFn: async (input: { id: string; action: 'approve'|'pause'|'resume'|'revoke'; actor?: string; reason?: string }) => {
      setPendingId(input.id)
      setErrorText(null)
      return api.decidePortfolioEdge(props.slug, input.id, input.action, {
        actor: input.actor || undefined,
        revokeReason: input.reason || undefined,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      props.onChanged()
      setPendingId(null)
      setExpandedRow(null)
      setRowActor('')
      setRowReason('')
    },
    onError: (error) => {
      setPendingId(null)
      setErrorText(error instanceof Error ? error.message : 'Decision failed')
    },
  }))

  const shortWs = (id: string) => id.slice(0, 8)

  const edges = () => props.consents ?? []
  const proposedCount = () => edges().filter(edge => edge.status === 'proposed').length
  const activeCount = () => edges().filter(edge => edge.status === 'active').length
  const boardTone = () => proposedCount() > 0 ? 'warn' : activeCount() > 0 ? 'good' : 'muted'
  const boardLabel = () => proposedCount() > 0
    ? `${proposedCount()} to review`
    : activeCount() > 0 ? `${activeCount()} live` : 'no live edges'

  // Sort edges: proposed first (actionable), then active, paused, revoked.
  const STATUS_ORDER: Record<PortfolioConsentStatus, number> = { proposed: 0, active: 1, paused: 2, revoked: 3 }
  const sortedEdges = () => edges().slice().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  const needsActor = (action: 'approve'|'pause'|'resume'|'revoke') => action === 'approve'
  const needsReason = (action: 'approve'|'pause'|'resume'|'revoke') => action === 'revoke'
  const canSubmit = (action: 'approve'|'pause'|'resume'|'revoke') =>
    (!needsActor(action) || rowActor().trim().length > 0) &&
    (!needsReason(action) || rowReason().trim().length > 0)

  const expand = (edgeId: string) => {
    if (expandedRow() === edgeId) { setExpandedRow(null); return }
    setExpandedRow(edgeId)
    setRowActor('')
    setRowReason('')
  }

  return <Card class="p-4">
    <div class="flex items-center justify-between gap-4 mt-6 mb-3">
      <div><h2 class="text-lg font-semibold text-foreground flex items-center gap-2"><SectionIcon name="megaphone" />Roster & amplification</h2><p class="mt-1 text-sm text-muted-foreground leading-relaxed">Route one artist's release or show in front of another artist's consenting fans, per edge.</p></div>
      <div class="flex flex-wrap items-center gap-2">
        <StatusBadge status={boardLabel()} tone={boardTone()} />
      </div>
    </div>

    <Show when={props.overview} keyed>{overview => <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <div class="rounded-lg border border-border bg-card p-4 text-foreground flex flex-col gap-1"><KpiValue value={metric(overview.workspaceCount)} /><span class="text-muted-foreground">Artists</span></div>
      <div class="rounded-lg border border-border bg-card p-4 text-foreground flex flex-col gap-1"><KpiValue value={metric(overview.activeFans)} /><span class="text-muted-foreground">Active fans</span></div>
      <div class="rounded-lg border border-border bg-card p-4 text-foreground flex flex-col gap-1"><KpiValue value={`+${metric(overview.fansLast30d)}`} /><span class="text-muted-foreground">New fans · 30d</span></div>
      <div class="rounded-lg border border-border bg-card p-4 text-foreground flex flex-col gap-1"><KpiValue value={metric(overview.activeEdges)} /><span class="text-muted-foreground">Live edges</span></div>
      <div class="rounded-lg border border-border bg-card p-4 text-foreground flex flex-col gap-1"><KpiValue value={metric(overview.deliveriesLast30d)} /><span class="text-muted-foreground">Amplified · 30d</span></div>
    </div>}</Show>

    <div class="mt-6 pt-4 border-t border-border"><h3 class="text-sm font-semibold text-foreground flex items-center gap-2"><SectionIcon name="link" />Amplification edges</h3></div>
    <Show when={sortedEdges().length}>
      <Table aria-label="Amplification edges">
        <TableHeader><TableRow>
          <TableHead>Purpose</TableHead><TableHead>Audience owner</TableHead><TableHead>Beneficiary</TableHead><TableHead>Status</TableHead>
          <TableHead>Campaigns / month</TableHead><TableHead>Cooldown</TableHead><TableHead>Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          <For each={sortedEdges()}>{(edge: PortfolioConsent) => (
            <>
            <TableRow>
              <TableCell>{PURPOSE_LABEL[edge.purpose]}</TableCell>
              <TableCell>{shortWs(edge.from_workspace_id)}</TableCell>
              <TableCell>{shortWs(edge.to_workspace_id)}</TableCell>
              <TableCell>
                <span class="flex flex-wrap items-center gap-2">
                  <StatusBadge status={STATUS_LABEL[edge.status]} tone={STATUS_TONE[edge.status]} />
                  <Show when={edge.status === 'active'}>
                    <small class="text-xs text-muted-foreground">{edge.campaigns_this_month}/{edge.max_campaigns_per_month} this month</small>
                  </Show>
                </span>
              </TableCell>
              <TableCell>{edge.cooldown_days}d</TableCell>
              <TableCell class="whitespace-nowrap">
                <div class="flex gap-2 flex-wrap">
                  <Show when={edge.status === 'proposed'}>
                    <Button size="sm" disabled={pendingId() !== null} onClick={() => expand(edge.id)}>Approve</Button>
                    <Button variant="destructive" size="sm" disabled={pendingId() !== null} onClick={() => expand(edge.id)}>Decline</Button>
                  </Show>
                  <Show when={edge.status === 'active'}>
                    <Button size="sm" disabled={pendingId() !== null} onClick={() => decide.mutate({ id: edge.id, action: 'pause' })}>Pause</Button>
                    <Button variant="destructive" size="sm" disabled={pendingId() !== null} onClick={() => expand(edge.id)}>Revoke</Button>
                  </Show>
                  <Show when={edge.status === 'paused'}>
                    <Button size="sm" disabled={pendingId() !== null} onClick={() => decide.mutate({ id: edge.id, action: 'resume' })}>Resume</Button>
                    <Button variant="destructive" size="sm" disabled={pendingId() !== null} onClick={() => expand(edge.id)}>Revoke</Button>
                  </Show>
                  <Show when={edge.status === 'revoked'}><span class="text-muted-foreground">closed</span></Show>
                </div>
              </TableCell>
            </TableRow>
            {/* Inline form — expands below the row when Approve/Decline/Revoke
                is clicked. Replaces the global operator/reason fields. */}
            <Show when={expandedRow() === edge.id}>
              <TableRow class="p-0 border-t-0">
                <TableCell colspan="7" class="p-0 border-t-0">
                  <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3.5 items-end px-4.5 py-4 bg-surface-1 border border-primary/30 rounded-b-lg -mt-px">
                    <Show when={edge.status === 'proposed'}>
                      <label class="grid gap-1.5 text-muted-foreground text-sm">
                        <span>Approving operator</span>
                        <Input value={rowActor()} onInput={e => setRowActor(e.currentTarget.value)} placeholder="operator@label" />
                        <small class="text-xs text-muted-foreground">Recorded against the edge in the audit trail.</small>
                      </label>
                    </Show>
                    <Show when={edge.status === 'proposed' || edge.status === 'active' || edge.status === 'paused'}>
                      <label class="grid gap-1.5 text-muted-foreground text-sm">
                        <span>Reason</span>
                        <Input value={rowReason()} onInput={e => setRowReason(e.currentTarget.value)} placeholder="duplicate edge / artist withdrew consent" />
                        <small class="text-xs text-muted-foreground">Required for revocation. Stored with the decision.</small>
                      </label>
                    </Show>
                    <div class="flex items-center gap-2 flex-wrap">
                      <Show when={edge.status === 'proposed'}>
                        <Button size="sm" disabled={pendingId() !== null || !canSubmit('approve')}
                          onClick={() => decide.mutate({ id: edge.id, action: 'approve', actor: rowActor(), reason: rowReason() })}>
                          {pendingId() === edge.id ? 'Approving…' : 'Confirm approve'}
                        </Button>
                        <Button variant="destructive" size="sm" disabled={pendingId() !== null || !canSubmit('revoke')}
                          onClick={() => decide.mutate({ id: edge.id, action: 'revoke', actor: rowActor(), reason: rowReason() })}>
                          {pendingId() === edge.id ? 'Declining…' : 'Confirm decline'}
                        </Button>
                      </Show>
                      <Show when={edge.status === 'active' || edge.status === 'paused'}>
                        <Button variant="destructive" size="sm" disabled={pendingId() !== null || !canSubmit('revoke')}
                          onClick={() => decide.mutate({ id: edge.id, action: 'revoke', actor: rowActor(), reason: rowReason() })}>
                          {pendingId() === edge.id ? 'Revoking…' : 'Confirm revoke'}
                        </Button>
                      </Show>
                      <Button variant="ghost" size="sm" onClick={() => setExpandedRow(null)}>Cancel</Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            </Show>
            </>
          )}</For>
        </TableBody>
      </Table>
    </Show>
    {/* Two different empty states, because they mean different things.
        With fewer than two artists amplification cannot exist at all, and
        explaining an approval workflow to someone who has nothing to approve
        reads as a broken feature rather than an inapplicable one. */}
    <Show when={!edges().length}>
      <Show
        when={(props.overview?.workspaceCount ?? 0) >= 2}
        fallback={<EmptyState label="No amplification yet" hint="Amplification needs at least two artists on the roster." />}
      >
        <EmptyState label="No amplification edges" hint="Create an edge from either artist's workspace to start routing." />
      </Show>
    </Show>
    <Show when={errorText()}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{errorText()}</div></Show>
  </Card>
}
