import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { PortfolioConsent, PortfolioOverview } from '../lib/types'

const STATUS_LABEL: Record<PortfolioConsent['status'], string> = {
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
      await queryClient.invalidateQueries({ queryKey: ['portfolio', props.slug] })
      setPendingId(null)
    },
    onError: (error) => {
      setPendingId(null)
      setErrorText(error instanceof Error ? error.message : 'Decision failed')
    },
  }))

  const shortWs = (id: string) => id.slice(0, 8)

  return <div class="panel">
    <Show when={props.overview}>
      {overview => <div class="kpi-grid">
        <div class="kpi"><span class="kpi-value">{overview().workspaceCount}</span><span class="kpi-label">Artists</span></div>
        <div class="kpi"><span class="kpi-value">{overview().activeFans}</span><span class="kpi-label">Active fans</span></div>
        <div class="kpi"><span class="kpi-value">+{overview().fansLast30d}</span><span class="kpi-label">New fans · 30d</span></div>
        <div class="kpi"><span class="kpi-value">{overview().activeEdges}</span><span class="kpi-label">Live edges</span></div>
        <div class="kpi"><span class="kpi-value">{overview().deliveriesLast30d}</span><span class="kpi-label">Amplified · 30d</span></div>
      </div>}
    </Show>

    <h3>Amplification edges</h3>
    <div class="form-grid">
      <label>Approving operator<input value={actor()} onInput={e => setActor(e.currentTarget.value)} placeholder="operator@label" /></label>
    </div>
    <Show when={props.consents?.length}>
      <table class="data-table">
        <thead><tr>
          <th>Purpose</th><th>Audience owner</th><th>Beneficiary</th><th>Status</th>
          <th>Campaigns / month</th><th>Cooldown</th><th>Decisions</th>
        </tr></thead>
        <tbody>
          <For each={props.consents}>{(edge: PortfolioConsent) => (
            <tr data-status={edge.status}>
              <td>{PURPOSE_LABEL[edge.purpose]}</td>
              <td title={edge.from_workspace_id}>{shortWs(edge.from_workspace_id)}…</td>
              <td title={edge.to_workspace_id}>{shortWs(edge.to_workspace_id)}…</td>
              <td>{STATUS_LABEL[edge.status]}{edge.status === 'active'
                ? ` · ${edge.campaigns_this_month}/${edge.max_campaigns_per_month}` : ''}</td>
              <td>{edge.cooldown_days}d</td>
              <td class="actions">
                <Show when={edge.status === 'proposed'}>
                  <button disabled={pendingId() !== null}
                    onClick={() => decide.mutate({ id: edge.id, action: 'approve' })}>Approve</button>
                  <button disabled={pendingId() !== null} class="danger"
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
                  <button disabled={pendingId() !== null || !revokeReason()} class="danger"
                    onClick={() => decide.mutate({ id: edge.id, action: 'revoke' })}>Revoke</button>
                </Show>
              </td>
            </tr>
          )}</For>
        </tbody>
      </table>
    </Show>
    <Show when={!props.consents?.length}><p class="muted">No consent edges yet — propose one between two roster workspaces to start routing audiences.</p></Show>
    <Show when={errorText()}><div class="error-card" role="alert">{errorText()}</div></Show>
  </div>
}
