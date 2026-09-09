import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { AutopilotOverview, AutopilotPolicy, BulkAutopilotResult } from '../lib/types'
import { errorMessage } from '../lib/format'
import { StatusBadge } from './StatusBadge'
import { SkeletonAutopilotKpis } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { SectionFailureCard } from './SectionFailureCard'
import { PolicyEditor } from './PolicyEditor'
import { CONTEXT_LABELS, labelOr } from '../lib/opportunity-labels'
import { Card } from './ui/card'

const contextLabel = (context: string) => labelOr(CONTEXT_LABELS, context)

// Authority Policies tab — the autopilot's authority controls.
// Owns its own useQuery so it loads independently of the Runtime tab.
// This is the ONLY place autopilot authority switches and sliders live.
// Operations shows read-only autopilot status and links here.
export function AuthorityPoliciesPanel(props: {
  slug: string
  degraded: readonly string[]
  sections?: import('../lib/types').SectionVerdicts
  freshness?: import('../lib/types').SectionFreshnessMap
  fetchedAt?: string
  refresh: () => Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const autopilot = useQuery(() => ({
    queryKey: ['autopilot-overview', props.slug],
    queryFn: () => api.autopilotOverview(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const [pendingMutation, setPendingMutation] = createSignal<string | null>(null)
  const [mutationError, setMutationError] = createSignal<string | null>(null)

  const mutate = async (key: string, operation: () => Promise<unknown>, refresh: () => Promise<unknown>) => {
    setMutationError(null)
    setPendingMutation(key)
    try {
      await operation()
      await refresh()
    } catch (error) {
      setMutationError(errorMessage(error, 'Tenant operation failed'))
    } finally {
      setPendingMutation(null)
    }
  }

  const updatePolicy = (policy: AutopilotPolicy, input: Pick<AutopilotPolicy, 'enabled'|'autonomy_level'|'minimum_confidence'|'max_actions_24h'>) => mutate(
    `policy:${policy.context}`,
    () => api.setAutopilotPolicy(props.slug, policy, input),
    () => autopilot.refetch(),
  )

  // The bulk mutation fans out to individual policy updates upstream.
  // A plain refetch races with those updates and can return stale policy
  // state — the killswitch appears stuck. Instead, optimistically apply
  // the authoritative BulkAutopilotResult to the query cache so the UI
  // flips immediately, then refetch in the background to reconcile.
  const bulkAutopilot = async (enabled: boolean) => {
    setMutationError(null)
    setPendingMutation('autopilot-bulk')
    try {
      const result: BulkAutopilotResult = await api.autopilotBulk(props.slug, enabled)
      // Optimistically patch the cached overview so the killswitch state
      // reflects the mutation result without waiting for a refetch that
      // may race with upstream's per-policy updates.
      queryClient.setQueryData<AutopilotOverview>(['autopilot-overview', props.slug], prev => {
        if (!prev) return prev
        const updated = new Set(result.results.filter(r => r.ok).map(r => r.context))
        return {
          ...prev,
          runtime_enabled: enabled,
          policies: prev.policies.map(p => updated.has(p.context)
            ? { ...p, enabled }
            : p),
        }
      })
      // Reconcile with upstream in the background; the optimistic patch
      // already holds the correct visible state.
      void autopilot.refetch()
    } catch (error) {
      setMutationError(errorMessage(error, 'Tenant operation failed'))
    } finally {
      setPendingMutation(null)
    }
  }

  const [confirming, setConfirming] = createSignal<'autopilot-disable' | 'autopilot-enable' | null>(null)

  const confirmCopy = (): { title: string; body: string; action: string } | null => {
    switch (confirming()) {
      case 'autopilot-disable': return {
        title: 'Disable all Autopilot policies?',
        body: 'Every context stops acting immediately — full killswitch. Queued actions stay parked until you re-enable.',
        action: 'Disable everything',
      }
      case 'autopilot-enable': return {
        title: 'Enable all Autopilot policies?',
        body: 'Every context resumes at its saved autonomy level, confidence threshold and daily cap.',
        action: 'Enable everything',
      }
      default: return null
    }
  }

  return <Card class="p-4 operations-panel">
    <div class="flex items-center justify-between gap-4 mt-6 mb-3 operations-title">
      <div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">AUTOPILOT</span><h2><SectionIcon name="shield" />Authority policies</h2><p>One row per kind of work the autopilot does. This is the only place these controls live.</p></div>
      <div class="row-health">
        <StatusBadge status={autopilot.data?.runtime_enabled ? 'runtime on' : 'runtime off'} tone={autopilot.data?.runtime_enabled ? 'good' : 'muted'} />
      </div>
    </div>

    <Show when={mutationError()}>{message => <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive operations-error" role="alert">{message()}</div>}</Show>

    <Show when={confirming()?.startsWith('autopilot')}><div class="warning-card confirm-card" role="alertdialog" aria-label="Bulk Autopilot change">
      <strong>{confirmCopy()!.title}</strong>
      <span>{confirmCopy()!.body}</span>
      <div class="row-health">
        <button class="ghost" onClick={() => setConfirming(null)}>Cancel</button>
        <button class={confirming() === 'autopilot-disable' ? 'danger-ghost' : ''} disabled={pendingMutation() !== null} onClick={() => { const enable = confirming() === 'autopilot-enable'; setConfirming(null); void bulkAutopilot(enable) }}>{pendingMutation() === 'autopilot-bulk' && <Spinner />} {confirmCopy()!.action}</button>
      </div>
    </div></Show>

    <Show when={autopilot.data} fallback={
      <Show when={autopilot.error} fallback={<SkeletonAutopilotKpis />}>
        <SectionFailureCard error={autopilot.error} fallback="Autopilot overview unavailable" onRetry={() => void autopilot.refetch()} />
      </Show>
    }>{data => <>
      <div class="autopilot-kpis">
        <div><strong>{data().needs_you.length}</strong><span>needs you</span></div>
        <div><strong>{data().queued_actions}</strong><span>queued</span></div>
        <div><strong>{data().failed_24h}</strong><span>failed 24h</span></div>
        <div><strong>{data().executor_failed_24h}</strong><span>executor fail</span></div>
      </div>
      {/* Killswitch / full-enable: one switch, one confirmation.
          Right-aligned, directly above the policy list so the operator's
          eye lands on the master control before the per-context rows. */}
      <Show when={data().policies.length > 0}>
        <div class="row-health autopilot-bulk-bar">
          <Show when={data().policies.some(policy => policy.enabled)} fallback={
            <button
              class="full-auto-btn"
              disabled={pendingMutation() !== null}
              aria-label="Enable all Autopilot policies"
              onClick={() => setConfirming('autopilot-enable')}
            >{pendingMutation() === 'autopilot-bulk' && <Spinner />} {confirming() === 'autopilot-enable' ? 'Cancel' : 'Full auto: enable all'}</button>
          }>
            <button
              class={`ghost ${confirming() === 'autopilot-disable' ? '' : 'danger-ghost'}`}
              disabled={pendingMutation() !== null}
              aria-label={confirming() === 'autopilot-disable' ? 'Cancel bulk action' : 'Disable all Autopilot policies'}
              onClick={() => setConfirming(confirming()?.startsWith('autopilot') ? null : 'autopilot-disable')}
            >{pendingMutation() === 'autopilot-bulk' && <Spinner />} {confirming() === 'autopilot-disable' ? 'Cancel' : 'Kill switch: disable all'}</button>
          </Show>
        </div>
      </Show>
      <details class="policy-legend-collapse">
        <summary>How authority policies work</summary>
        <p class="policy-legend">
          One row per kind of work the autopilot does.{' '}
          <strong>Mode</strong> is how far it may go on its own —{' '}
          <em>observe</em> records what it would do,{' '}
          <em>recommend</em> surfaces it on the opportunity board,{' '}
          <em>require approval</em> prepares the action and waits for you,{' '}
          <em>bounded auto</em> executes without asking.{' '}
          <strong>Min confidence</strong> is the score an action must reach before that mode applies; below it nothing happens.{' '}
          <strong>Max / 24h</strong> caps executions per rolling day, so a bad run stops itself.{' '}
          Changes take effect on the next cycle — <em>Apply</em> saves one row.
        </p>
      </details>
      <div class="policy-summary">
        <span><strong>{data().policies.length}</strong> policies</span>
        <span><strong>{data().policies.filter(p => p.enabled).length}</strong> enabled</span>
        <span class="policy-summary-auto"><strong>{data().policies.filter(p => p.enabled && p.autonomy_level === 'bounded_auto').length}</strong> act without asking</span>
        <span><strong>{data().policies.filter(p => p.enabled && p.autonomy_level === 'require_approval').length}</strong> wait for you</span>
        <span><strong>{data().policies.filter(p => p.enabled && (p.autonomy_level === 'observe' || p.autonomy_level === 'recommend')).length}</strong> only watching</span>
      </div>
      <div class="autopilot-policy-list">
        <For each={data().policies}>{policy => <PolicyEditor
          policy={policy}
          pending={pendingMutation() !== null}
          onSave={(input) => updatePolicy(policy, input) as Promise<void>}
        />}</For>
      </div>
      <Show when={data().rum_metrics_24h.length > 0}>
        <div class="rum-grid">
          <For each={data().rum_metrics_24h.slice(0, 6)}>{rum => <div><strong>{contextLabel(rum.metric_key)}</strong><span>{rum.surface} · {rum.samples_24h} samples</span><small>p75 {rum.p75.toFixed(1)} · p95 {rum.p95.toFixed(1)}</small></div>}</For>
        </div>
      </Show>
    </>}</Show>
  </Card>
}
