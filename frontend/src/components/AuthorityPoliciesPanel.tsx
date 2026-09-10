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
import { Button } from './ui/button'

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
    <div class="flex items-start justify-between gap-4 mt-6 mb-3">
      <div><h2 class="text-lg font-bold text-foreground flex items-center gap-2"><SectionIcon name="shield" />Authority policies</h2><p class="mt-1 text-sm text-muted-foreground leading-relaxed">One row per kind of work the autopilot does. This is the only place these controls live.</p></div>
      <div class="flex flex-wrap items-center gap-2">
        <StatusBadge status={autopilot.data?.runtime_enabled ? 'runtime on' : 'runtime off'} tone={autopilot.data?.runtime_enabled ? 'good' : 'muted'} />
      </div>
    </div>

    <Show when={mutationError()}>{message => <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{message()}</div>}</Show>

    <Show when={confirming()?.startsWith('autopilot')}><div class="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning flex flex-col gap-2.5 my-3" role="alertdialog" aria-label="Bulk Autopilot change">
      <strong>{confirmCopy()!.title}</strong>
      <span>{confirmCopy()!.body}</span>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Button>
        <Button variant={confirming() === 'autopilot-disable' ? 'destructive-ghost' : 'default'} size="sm" disabled={pendingMutation() !== null} onClick={() => { const enable = confirming() === 'autopilot-enable'; setConfirming(null); void bulkAutopilot(enable) }}>{pendingMutation() === 'autopilot-bulk' && <Spinner />} {confirmCopy()!.action}</Button>
      </div>
    </div></Show>

    <Show when={autopilot.data} fallback={
      <Show when={autopilot.error} fallback={<SkeletonAutopilotKpis />}>
        <SectionFailureCard error={autopilot.error} fallback="Autopilot overview unavailable" onRetry={() => void autopilot.refetch()} />
      </Show>
    }>{data => <>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <div class="rounded-lg border border-border-subtle bg-surface-1 p-3.5 grid gap-0.5"><strong>{data().needs_you.length}</strong><span>needs you</span></div>
        <div class="rounded-lg border border-border-subtle bg-surface-1 p-3.5 grid gap-0.5"><strong>{data().queued_actions}</strong><span>queued</span></div>
        <div class="rounded-lg border border-border-subtle bg-surface-1 p-3.5 grid gap-0.5"><strong>{data().failed_24h}</strong><span>failed 24h</span></div>
        <div class="rounded-lg border border-border-subtle bg-surface-1 p-3.5 grid gap-0.5"><strong>{data().executor_failed_24h}</strong><span>executor fail</span></div>
      </div>
      {/* Killswitch / full-enable: one switch, one confirmation.
          Right-aligned, directly above the policy list so the operator's
          eye lands on the master control before the per-context rows. */}
      <Show when={data().policies.length > 0}>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <Show when={data().policies.some(policy => policy.enabled)} fallback={
            <Button
              size="sm"
              disabled={pendingMutation() !== null}
              aria-label="Enable all Autopilot policies"
              onClick={() => setConfirming('autopilot-enable')}
            >{pendingMutation() === 'autopilot-bulk' && <Spinner />} {confirming() === 'autopilot-enable' ? 'Cancel' : 'Full auto: enable all'}</Button>
          }>
            <Button
              variant={confirming() === 'autopilot-disable' ? 'ghost' : 'destructive-ghost'}
              size="sm"
              disabled={pendingMutation() !== null}
              aria-label={confirming() === 'autopilot-disable' ? 'Cancel bulk action' : 'Disable all Autopilot policies'}
              onClick={() => setConfirming(confirming()?.startsWith('autopilot') ? null : 'autopilot-disable')}
            >{pendingMutation() === 'autopilot-bulk' && <Spinner />} {confirming() === 'autopilot-disable' ? 'Cancel' : 'Kill switch: disable all'}</Button>
          </Show>
        </div>
      </Show>
      <details class="mb-3.5">
        <summary class="cursor-pointer text-muted-foreground text-sm font-semibold py-1.5 list-none [&::-webkit-details-marker]:hidden before:content-['ⓘ_'] before:mr-1 open:mb-2 open:text-secondary-foreground">How authority policies work</summary>
        <p class="rounded-r-md">
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
      <div class="bg-surface-1 text-muted-foreground flex flex-wrap gap-2 mb-3 p-2.5">
        <span><strong>{data().policies.length}</strong> policies</span>
        <span><strong>{data().policies.filter(p => p.enabled).length}</strong> enabled</span>
        <span><strong class="text-warning">{data().policies.filter(p => p.enabled && p.autonomy_level === 'bounded_auto').length}</strong> act without asking</span>
        <span><strong>{data().policies.filter(p => p.enabled && p.autonomy_level === 'require_approval').length}</strong> wait for you</span>
        <span><strong>{data().policies.filter(p => p.enabled && (p.autonomy_level === 'observe' || p.autonomy_level === 'recommend')).length}</strong> only watching</span>
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-1">
        <For each={data().policies}>{policy => <PolicyEditor
          policy={policy}
          pending={pendingMutation() !== null}
          onSave={(input) => updatePolicy(policy, input) as Promise<void>}
        />}</For>
      </div>
      <Show when={data().rum_metrics_24h.length > 0}>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mt-4">
          <For each={data().rum_metrics_24h.slice(0, 6)}>{rum => <div class="min-w-0 p-3 border border-border rounded-lg bg-surface-3"><strong>{contextLabel(rum.metric_key)}</strong><span>{rum.surface} · {rum.samples_24h} samples</span><small>p75 {rum.p75.toFixed(1)} · p95 {rum.p95.toFixed(1)}</small></div>}</For>
        </div>
      </Show>
    </>}</Show>
  </Card>
}
