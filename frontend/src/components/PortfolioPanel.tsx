import { AmplifyEdgeAction } from './AmplifyEdgeAction'
import { SurfaceAction } from './capabilities/SurfaceAction'
import { capabilityAction } from '../lib/capabilities'
import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { TechIdList } from './ui/TechnicalDetails'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { PortfolioConsent, PortfolioConsentStatus, PortfolioOverview } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './ui/empty-state'
import { Button } from './app/button'
import { Input } from './ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { ErrorCard, KpiCard, KpiStrip, Section } from './layout'
import { writeGuard } from '../lib/read-only'

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
  // The amplification section failed upstream — `consents` is also undefined
  // for a real zero, so the absence alone cannot tell the two apart. Without
  // this flag the empty state invites "create an edge" on a dead section.
  consentsUnavailable?: boolean
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

  // Workspace ids are only meaningful against the tenant registry — admins
  // share the ['tenants'] cache Shell/Overview already fill; an operator
  // without it sees the id behind the details affordance, not a hex stub.
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: () => api.tenants(),
    enabled: authState.isPlatformLevel(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    reconcile: 'id',
  }))
  const workspaceLabel = (workspaceId: string) =>
    tenants.data?.items.find(t => t.workspaceId === workspaceId)?.displayName
  const WorkspaceCell = (props: { workspaceId: string }) => (
    <Show when={workspaceLabel(props.workspaceId)} fallback={
      <TechIdList ids={[{ label: 'workspace', value: props.workspaceId }]} />
    }>{name => <span>{name()}</span>}</Show>
  )

  const edges = () => props.consents ?? []
  const proposedCount = () => edges().filter(edge => edge.status === 'proposed').length
  const activeCount = () => edges().filter(edge => edge.status === 'active').length
  const boardTone = () => proposedCount() > 0 ? 'warn' : activeCount() > 0 ? 'good' : 'muted'
  const boardLabel = () => proposedCount() > 0
    ? `${proposedCount()} to review`
    : activeCount() > 0 ? `${activeCount()} live` : (authState.isPlatformLevel() ? 'no live edges' : 'nothing live yet')

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

  return <Section
    flush
    title="Roster and amplification"
    icon={<SectionIcon name="megaphone" />}
    description="Route one artist's release or show in front of another artist's consenting fans, per edge. Not a shared list: a permission, capped, revocable and audited."
    action={<StatusBadge status={boardLabel()} tone={boardTone()} />}
  >
    {/* The same metric rail every page uses; these were five boxed cards. */}
    <Show when={props.overview} keyed>{overview => <KpiStrip class="mb-0" min="9rem">
      <KpiCard label="Artists" value={metric(overview.workspaceCount)} />
      <KpiCard label="Active fans" value={metric(overview.activeFans)} />
      <KpiCard label="New fans" value={`+${metric(overview.fansLast30d)}`} sub="last 30 days" />
      <KpiCard label="Live edges" value={metric(overview.activeEdges)} />
      <KpiCard label="Amplified" value={metric(overview.deliveriesLast30d)} sub="last 30 days" />
    </KpiStrip>}</Show>

    <div class="mt-6 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="link" />{authState.isPlatformLevel() ? 'Amplification edges' : 'Amplification agreements'}</h3>
      {/* An agreement is proposed by the act whose fans are asked — the
          other act accepts or declines it here. */}
      <SurfaceAction slug={props.slug} action={capabilityAction('amplification', 'Propose')} label="Propose an agreement" onDone={props.onChanged} />
    </div>
    <Show when={sortedEdges().length}>
      <Table aria-label="Amplification edges">
        <TableHeader><TableRow>
          <TableHead>Purpose</TableHead><TableHead>{authState.isPlatformLevel() ? 'Audience owner' : 'Whose fans'}</TableHead><TableHead>{authState.isPlatformLevel() ? 'Beneficiary' : 'Who gets them'}</TableHead><TableHead>Status</TableHead>
          <TableHead>Campaigns / month</TableHead><TableHead>Cooldown</TableHead><TableHead>Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          <For each={sortedEdges()}>{(edge: PortfolioConsent) => (
            <>
            <TableRow>
              <TableCell>{PURPOSE_LABEL[edge.purpose]}</TableCell>
              <TableCell><WorkspaceCell workspaceId={edge.from_workspace_id} /></TableCell>
              <TableCell><WorkspaceCell workspaceId={edge.to_workspace_id} /></TableCell>
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
                    <Button writes size="sm" disabled={pendingId() !== null} onClick={() => expand(edge.id)}>Approve</Button>
                    <Button writes variant="destructive" size="sm" disabled={pendingId() !== null} onClick={() => expand(edge.id)}>Decline</Button>
                  </Show>
                  <Show when={edge.status === 'active'}>
                    <AmplifyEdgeAction slug={props.slug} consentId={edge.id} onDone={props.onChanged} />
                    <Button writes size="sm" disabled={pendingId() !== null} onClick={() => decide.mutate({ id: edge.id, action: 'pause' })}>Pause</Button>
                    <Button writes variant="destructive" size="sm" disabled={pendingId() !== null} onClick={() => expand(edge.id)}>Revoke</Button>
                  </Show>
                  <Show when={edge.status === 'paused'}>
                    <Button writes size="sm" disabled={pendingId() !== null} onClick={() => decide.mutate({ id: edge.id, action: 'resume' })}>Resume</Button>
                    <Button writes variant="destructive" size="sm" disabled={pendingId() !== null} onClick={() => expand(edge.id)}>Revoke</Button>
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
                  <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end px-4 py-4 bg-background border border-primary/30 rounded-b-lg -mt-px">
                    <Show when={edge.status === 'proposed'}>
                      <label class="grid gap-1.5 text-muted-foreground text-sm">
                        <span>{authState.isPlatformLevel() ? 'Approving operator' : 'Your name'}</span>
                        <Input value={rowActor()} onInput={e => setRowActor(e.currentTarget.value)} placeholder={authState.isPlatformLevel() ? 'operator@label' : 'you@yourband'} {...writeGuard()} />
                        <small class="text-xs text-muted-foreground">Recorded against the edge in the audit trail.</small>
                      </label>
                    </Show>
                    <Show when={edge.status === 'proposed' || edge.status === 'active' || edge.status === 'paused'}>
                      <label class="grid gap-1.5 text-muted-foreground text-sm">
                        <span>Reason</span>
                        <Input value={rowReason()} onInput={e => setRowReason(e.currentTarget.value)} placeholder="duplicate edge / artist withdrew consent" {...writeGuard()} />
                        <small class="text-xs text-muted-foreground">Required for revocation. Stored with the decision.</small>
                      </label>
                    </Show>
                    <div class="flex items-center gap-2 flex-wrap">
                      <Show when={edge.status === 'proposed'}>
                        <Button writes size="sm" disabled={pendingId() !== null || !canSubmit('approve')}
                          onClick={() => decide.mutate({ id: edge.id, action: 'approve', actor: rowActor(), reason: rowReason() })}>
                          {pendingId() === edge.id ? 'Approving…' : 'Confirm approve'}
                        </Button>
                        <Button writes variant="destructive" size="sm" disabled={pendingId() !== null || !canSubmit('revoke')}
                          onClick={() => decide.mutate({ id: edge.id, action: 'revoke', actor: rowActor(), reason: rowReason() })}>
                          {pendingId() === edge.id ? 'Declining…' : 'Confirm decline'}
                        </Button>
                      </Show>
                      <Show when={edge.status === 'active' || edge.status === 'paused'}>
                        <Button writes variant="destructive" size="sm" disabled={pendingId() !== null || !canSubmit('revoke')}
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
        when={!props.consentsUnavailable}
        fallback={<EmptyState label={authState.isPlatformLevel() ? 'Amplification edges unavailable' : 'Amplification unavailable'} hint="This section could not be loaded — see the alert above. The rest of the page keeps working." />}
      >
        <Show
          when={(props.overview?.workspaceCount ?? 0) >= 2}
          fallback={<EmptyState label="No amplification yet" hint="Amplification needs at least two artists sharing the roster — including band-to-band crossbill, which stays a manual ask inside each show's partner relay until a second artist joins." />}
        >
          <EmptyState label={authState.isPlatformLevel() ? 'No amplification edges' : 'No amplification agreements'} hint={authState.isPlatformLevel() ? "Create an edge from either artist's page to start routing." : 'Ask the crew to set one up from either artist’s page.'} />
        </Show>
      </Show>
    </Show>
    <Show when={errorText()}><ErrorCard>{errorText()}</ErrorCard></Show>
  </Section>
}
