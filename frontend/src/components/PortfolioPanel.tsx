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
  const [actor, setActor] = createSignal('')
  const [revokeReason, setRevokeReason] = createSignal('')
  const [pendingId, setPendingId] = createSignal<string | null>(null)
  const [errorText, setErrorText] = createSignal<string | null>(null)

  const decide = useMutation(() => ({
    mutationFn: async (input: { id: string; action: 'approve'|'pause'|'resume'|'revoke' }) => {
      setPendingId(input.id)
      setErrorText(null)
      return api.decidePortfolioEdge(props.slug, input.id, input.action, {
        actor: actor() || undefined,
        revokeReason: revokeReason() || undefined,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      props.onChanged()
      setPendingId(null)
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
    <div class="form-grid">
      <label>Approving operator<input value={actor()} onInput={e => setActor(e.currentTarget.value)} placeholder="operator@label" /></label>
      <label>Revoke reason<input value={revokeReason()} onInput={e => setRevokeReason(e.currentTarget.value)} placeholder="required before Revoke / Decline fires" /></label>
    </div>
    <Show when={edges().length}>
      <table class="data-table">
        <thead><tr>
          <th>Purpose</th><th>Audience owner</th><th>Beneficiary</th><th>Status</th>
          <th>Campaigns / month</th><th>Cooldown</th><th>Decisions</th>
        </tr></thead>
        <tbody>
          <For each={edges()}>{(edge: PortfolioConsent) => (
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
                  <button disabled={pendingId() !== null || !actor().trim()}
                    title="Upstream requires a named approver before an activation"
                    onClick={() => decide.mutate({ id: edge.id, action: 'approve' })}>Approve</button>
                  <button disabled={pendingId() !== null || !revokeReason()} class="danger"
                    title="Declining records a revocation, so the reason field above is required"
                    onClick={() => decide.mutate({ id: edge.id, action: 'revoke' })}>Decline</button>
                </Show>
                <Show when={edge.status === 'active'}>
                  <button disabled={pendingId() !== null}
                    onClick={() => decide.mutate({ id: edge.id, action: 'pause' })}>Pause</button>
                  <button disabled={pendingId() !== null || !revokeReason()} class="danger" title="A revocation needs the reason written above"
                    onClick={() => decide.mutate({ id: edge.id, action: 'revoke' })}>Revoke</button>
                </Show>
                <Show when={edge.status === 'paused'}>
                  <button disabled={pendingId() !== null}
                    onClick={() => decide.mutate({ id: edge.id, action: 'resume' })}>Resume</button>
                  <button disabled={pendingId() !== null || !revokeReason()} class="danger" title="A revocation needs the reason written above"
                    onClick={() => decide.mutate({ id: edge.id, action: 'revoke' })}>Revoke</button>
                </Show>
                <Show when={edge.status === 'revoked'}><span class="muted">closed</span></Show>
              </td>
            </tr>
          )}</For>
        </tbody>
      </table>
    </Show>
    <Show when={!edges().length}><p class="muted">No consent edges yet — propose one between two roster workspaces to start routing audiences.</p></Show>
    <Show when={errorText()}><div class="error-card" role="alert">{errorText()}</div></Show>
  </article>
}
