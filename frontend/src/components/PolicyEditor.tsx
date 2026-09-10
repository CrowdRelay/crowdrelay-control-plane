import { Show, createEffect, createSignal } from 'solid-js'
import type { AutopilotPolicy, AutonomyLevel } from '../lib/types'
import { CONTEXT_LABELS, labelOr } from '../lib/opportunity-labels'
import { StatusBadge } from './StatusBadge'
import { Button } from './ui/button'
import { cn } from '../lib/cn'

// Shared autopilot policy editor — used by both AuthorityPoliciesPanel
// and GrowthIntelligencePanel. The two copies had already drifted in
// casing and label vocabulary, so this is the one implementation.

const contextLabel = (context: string) => labelOr(CONTEXT_LABELS, context)

export function PolicyEditor(props: {
  policy: AutopilotPolicy
  pending: boolean
  onSave: (input: Pick<AutopilotPolicy, 'enabled'|'autonomy_level'|'minimum_confidence'|'max_actions_24h'>) => Promise<void>
}) {
  const [enabled, setEnabled] = createSignal(props.policy.enabled)
  const [level, setLevel] = createSignal<AutonomyLevel>(props.policy.autonomy_level)
  const [confidence, setConfidence] = createSignal(props.policy.minimum_confidence / 100)
  const [maxActions, setMaxActions] = createSignal(props.policy.max_actions_24h)

  createEffect(() => {
    const policy = props.policy
    setEnabled(policy.enabled)
    setLevel(policy.autonomy_level)
    setConfidence(policy.minimum_confidence / 100)
    setMaxActions(policy.max_actions_24h)
  })

  const confidenceBasisPoints = () => Math.round(Math.max(0, Math.min(100, confidence())) * 100)
  const valid = () => Number.isFinite(confidence()) && confidence() >= 0 && confidence() <= 100 && Number.isInteger(maxActions()) && maxActions() >= 1 && maxActions() <= 1000
  const dirty = () => enabled() !== props.policy.enabled
    || level() !== props.policy.autonomy_level
    || confidenceBasisPoints() !== props.policy.minimum_confidence
    || maxActions() !== props.policy.max_actions_24h
  const guarded = () => props.policy.guarded_until && new Date(props.policy.guarded_until).getTime() > Date.now()

  return <div class="grid gap-3 items-center py-2.5 border-b border-border grid-cols-[1.4fr_auto_1fr_1.2fr_auto_auto]">
    <div>
      <div class="flex flex-wrap items-center gap-2">
        <strong>{contextLabel(props.policy.context)}</strong>
        <Show when={guarded()}><StatusBadge status="guarded" tone="warn" /></Show>
      </div>
      <small class="text-muted-foreground mt-0.5 block">v{props.policy.version}{props.policy.guardrail_reason ? ` · ${props.policy.guardrail_reason}` : ''}</small>
    </div>
    <label class="grid gap-1.5 text-muted-foreground text-sm items-center">
      <span>Enabled</span>
      <button
        type="button"
        class={cn('switch-control', enabled() && 'on')}
        role="switch"
        aria-checked={enabled()}
        aria-label={`${contextLabel(props.policy.context)} enabled`}
        disabled={props.pending}
        onClick={() => setEnabled((current) => !current)}
      ><span /></button>
    </label>
    <label class="grid gap-1.5 text-muted-foreground text-sm">
      <span>Mode</span>
      <select class="bg-background border border-border-strong text-white px-2.5 py-2 rounded-md outline-none transition-[border-color,box-shadow] duration-100 focus:border-primary focus:shadow-[0_0_0_3px_rgba(118,99,216,0.15),0_0_12px_rgba(155,135,245,0.1)]" disabled={props.pending} value={level()} onChange={(event) => setLevel(event.currentTarget.value as AutonomyLevel)}>
        <option value="observe">Observe</option>
        <option value="recommend">Recommend</option>
        <option value="require_approval">Require approval</option>
        <option value="bounded_auto">Bounded auto</option>
      </select>
    </label>
    <label class="grid gap-1.5 text-muted-foreground text-sm">
      <div class="flex justify-between gap-2 items-center">
        <span>Min confidence</span>
        <strong>{Math.round(confidence())}%</strong>
      </div>
      <input
        class="w-full accent-primary"
        disabled={props.pending}
        type="range"
        min="0"
        max="100"
        step="1"
        value={confidence()}
        onInput={(event) => setConfidence(event.currentTarget.valueAsNumber)}
        aria-label={`${contextLabel(props.policy.context)} minimum confidence`}
      />
    </label>
    <label class="grid gap-1.5 text-muted-foreground text-sm">
      <span>Max / 24h</span>
      <input class="bg-background border border-border-strong text-white px-2.5 py-2 rounded-md outline-none transition-[border-color,box-shadow] duration-100 focus:border-primary focus:shadow-[0_0_0_3px_rgba(118,99,216,0.15),0_0_12px_rgba(155,135,245,0.1)] w-20 text-right" disabled={props.pending} type="number" min="1" max="1000" step="1" value={maxActions()} onInput={(event) => setMaxActions(event.currentTarget.valueAsNumber)} />
    </label>
    <Button
      variant="ghost"
      size="sm"
      class="h-9"
      disabled={!dirty() || !valid() || props.pending}
      onClick={() => props.onSave({
        enabled: enabled(),
        autonomy_level: level(),
        minimum_confidence: confidenceBasisPoints(),
        max_actions_24h: maxActions(),
      })}
    >{props.pending ? 'Saving…' : 'Apply'}</Button>
  </div>
}
