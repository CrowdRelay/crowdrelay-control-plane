import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { PortfolioConsent, PortfolioConsentStatus, PortfolioOverview } from '../lib/types'
import { StatusBadge } from './StatusBadge'

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

  return <article class="panel">
    <div class="section-title">
      <div><span class="eyebrow">PORTFOLIO</span><h2>Roster & amplification</h2><p>One artist's release or show routed in front of another artist's consenting fans. Approvals are per edge, tenant-scoped and audited; fans never leave their home workspace.</p></div>
      <div class="row-health">
        <StatusBadge status={boardLabel()} tone={boardTone()} />
      </div>
    </div>

    <Show when={props.overview} keyed>{overview => <div class="kpi-grid">
      <div class="kpi"><span class="kpi-value">{metric(overview.workspaceCount)}</span><span class="kpi-label">Artists</span></div>
      <div class="kpi"><span class="kpi-value">{metric(overview.activeFans)}</span><span class="kpi-label">Active fans</span></div>
      <div class="kpi"><span class="kpi-value">+{metric(overview.fansLast30d)}</span><span class="kpi-label">New fans · 30d</span></div>
      <div class="kpi"><span class="kpi-value">{metric(overview.activeEdges)}</span><span class="kpi-label">Live edges</span></div>
      <div class="kpi"><span class="kpi-value">{metric(overview.deliveriesLast30d)}</span><span class="kpi-label">Amplified · 30d</span></div>
    </div>}</Show>

    <div><span class="eyebrow">EDGES</span><h3>Amplification edges</h3></div>
    <Show when={sortedEdges().length}>
      <table class="data-table">
        <thead><tr>
          <th>Purpose</th><th>Audience owner</th><th>Beneficiary</th><th>Status</th>
          <th>Campaigns / month</th><th>Cooldown</th><th>Actions</th>
        </tr></thead>
        <tbody>
          <For each={sortedEdges()}>{(edge: PortfolioConsent) => (
            <>
            <tr>
              <td>{PURPOSE_LABEL[edge.purpose]}</td>
              <td title={edge.from_workspace_id}>{shortWs(edge.from_workspace_id)}…</td>
              <td title={edge.to_workspace_id}>{shortWs(edge.to_workspace_id)}…</td>
              <td>
                <span class="row-health">
                  <StatusBadge status={STATUS_LABEL[edge.status]} tone={STATUS_TONE[edge.status]} />
                  <Show when={edge.status === 'active'}>
                    <small>{edge.campaigns_this_month}/{edge.max_campaigns_per_month} this month</small>
                  </Show>
                </span>
              </td>
              <td>{edge.cooldown_days}d</td>
              <td class="actions">
                <Show when={edge.status === 'proposed'}>
                  <button disabled={pendingId() !== null} onClick={() => expand(edge.id)}>Approve</button>
                  <button disabled={pendingId() !== null} class="danger" onClick={() => expand(edge.id)}>Decline</button>
                </Show>
                <Show when={edge.status === 'active'}>
                  <button disabled={pendingId() !== null} onClick={() => decide.mutate({ id: edge.id, action: 'pause' })}>Pause</button>
                  <button disabled={pendingId() !== null} class="danger" onClick={() => expand(edge.id)}>Revoke</button>
                </Show>
                <Show when={edge.status === 'paused'}>
                  <button disabled={pendingId() !== null} onClick={() => decide.mutate({ id: edge.id, action: 'resume' })}>Resume</button>
                  <button disabled={pendingId() !== null} class="danger" onClick={() => expand(edge.id)}>Revoke</button>
                </Show>
                <Show when={edge.status === 'revoked'}><span class="muted">closed</span></Show>
              </td>
            </tr>
            {/* Inline form — expands below the row when Approve/Decline/Revoke
                is clicked. Replaces the global operator/reason fields. */}
            <Show when={expandedRow() === edge.id}>
              <tr class="edge-inline-form-row">
                <td colspan="7">
                  <div class="edge-inline-form">
                    <Show when={edge.status === 'proposed'}>
                      <label>
                        <span>Approving operator</span>
                        <input value={rowActor()} onInput={e => setRowActor(e.currentTarget.value)} placeholder="operator@label" />
                        <small>Recorded against the edge in the audit trail.</small>
                      </label>
                    </Show>
                    <Show when={edge.status === 'proposed' || edge.status === 'active' || edge.status === 'paused'}>
                      <label>
                        <span>Reason</span>
                        <input value={rowReason()} onInput={e => setRowReason(e.currentTarget.value)} placeholder="duplicate edge / artist withdrew consent" />
                        <small>Required for revocation. Stored with the decision.</small>
                      </label>
                    </Show>
                    <div class="edge-inline-actions">
                      <Show when={edge.status === 'proposed'}>
                        <button disabled={pendingId() !== null || !canSubmit('approve')}
                          onClick={() => decide.mutate({ id: edge.id, action: 'approve', actor: rowActor(), reason: rowReason() })}>
                          {pendingId() === edge.id ? 'Approving…' : 'Confirm approve'}
                        </button>
                        <button class="danger" disabled={pendingId() !== null || !canSubmit('revoke')}
                          onClick={() => decide.mutate({ id: edge.id, action: 'revoke', actor: rowActor(), reason: rowReason() })}>
                          {pendingId() === edge.id ? 'Declining…' : 'Confirm decline'}
                        </button>
                      </Show>
                      <Show when={edge.status === 'active' || edge.status === 'paused'}>
                        <button class="danger" disabled={pendingId() !== null || !canSubmit('revoke')}
                          onClick={() => decide.mutate({ id: edge.id, action: 'revoke', actor: rowActor(), reason: rowReason() })}>
                          {pendingId() === edge.id ? 'Revoking…' : 'Confirm revoke'}
                        </button>
                      </Show>
                      <button class="ghost" onClick={() => setExpandedRow(null)}>Cancel</button>
                    </div>
                  </div>
                </td>
              </tr>
            </Show>
            </>
          )}</For>
        </tbody>
      </table>
    </Show>
    {/* Two different empty states, because they mean different things.
        With fewer than two artists amplification cannot exist at all, and
        explaining an approval workflow to someone who has nothing to approve
        reads as a broken feature rather than an inapplicable one. */}
    <Show when={!edges().length}><div class="inherit-card portfolio-empty">
      <Show
        when={(props.overview?.workspaceCount ?? 0) >= 2}
        fallback={
          <>
            <p><strong>Amplification needs at least two artists. This tenant has {props.overview?.workspaceCount ?? 0}.</strong></p>
            <p>
              Amplification lends one artist's audience to another: a release or show is
              routed in front of a different artist's consenting fans, who stay in their
              own workspace throughout. With a single artist there is no second audience
              to borrow, so there is nothing for this panel to do yet.
            </p>
            <p class="muted">
              It becomes available when a second artist is added to the roster. Until then
              this is not something to configure — it is a feature waiting on a roster,
              not on you.
            </p>
          </>
        }
      >
        <p><strong>No amplification edges yet.</strong></p>
        <p>
          An edge routes one artist's release or show in front of another artist's
          consenting fans. Create one from either artist's workspace page — it arrives
          here as <em>proposed</em>, and routing only starts once you approve it.
        </p>
        <p class="muted">
          This panel is the approval gate: approve, pause or revoke. Fans never leave
          their home workspace, and every decision is recorded against the operator who
          made it.
        </p>
      </Show>
    </div></Show>
    <Show when={errorText()}><div class="error-card" role="alert">{errorText()}</div></Show>
  </article>
}
