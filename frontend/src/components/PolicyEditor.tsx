import { Show, createEffect, createSignal } from 'solid-js'
import { AuthorityScale, type AuthorityRung } from './ui/authority-scale'
import type { AutopilotPolicy, AutonomyLevel } from '../lib/types'
import { CONTEXT_LABELS, labelOr } from '../lib/opportunity-labels'
import { StatusBadge } from './StatusBadge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Switch } from './ui/switch'
import { readOnly, writeGuard } from '../lib/read-only'

// Shared autopilot policy editor — used by both AuthorityPoliciesPanel
// and GrowthIntelligencePanel. The two copies had already drifted in
// casing and label vocabulary, so this is the one implementation.
//
// Twenty-two of these render at once. Every row used to carry its own
// "Enabled / Mode / Min confidence / Max 24h" captions — the same four words
// printed twenty-two times — and the list sat in two columns, so each row had
// half the page width. That truncated the Mode select to "Requ…": the one
// control whose current value the operator most needs to read.
//
// One shared header, one row per policy, full width. `POLICY_GRID` is exported
// so the header and the rows cannot drift out of alignment.
//
// On mobile the 6-column grid overflows (28.5rem minimum > 375px screen), so
// each policy collapses to a stacked card: context + switch on top, then mode,
// then confidence slider, then cap + save — all full-width. `md:contents`
// dissolves the wrapper divs on desktop so their children become grid items.

const contextLabel = (context: string) => labelOr(CONTEXT_LABELS, context)

/** The four rungs, cautious to trusting. Order is the ladder. */
const AUTHORITY_RUNGS: readonly AuthorityRung<AutonomyLevel>[] = [
  { value: 'observe', label: 'Watch', detail: 'Records what it would have done. Nothing leaves the workspace.' },
  { value: 'recommend', label: 'Suggest', detail: 'Puts the work on your board. You start it.' },
  { value: 'require_approval', label: 'Ask', detail: 'Prepares the action and waits for your approval.' },
  { value: 'bounded_auto', label: 'Alone', detail: 'Acts without asking, inside the confidence floor and the daily cap.' },
] as const

/** Column track shared by `PolicyHeader` and every `PolicyEditor` row. */
export const POLICY_GRID =
  'flex flex-col gap-3 md:grid md:items-center md:gap-x-4 md:grid-cols-[minmax(0,1.6fr)_auto_11rem_minmax(8rem,1fr)_5rem_4.5rem]'

export function PolicyHeader() {
  return (
    <div class="hidden md:grid md:items-center md:gap-x-4 md:grid-cols-[minmax(0,1.6fr)_auto_11rem_minmax(8rem,1fr)_5rem_4.5rem] border-b border-border px-1 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      <span>Kind of work</span>
      <span>On</span>
      <span>How far it may go</span>
      <span>Confidence needed</span>
      <span class="text-right">Cap / day</span>
      <span />
    </div>
  )
}

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

  return <div class={`${POLICY_GRID} border-b border-border-subtle px-1 py-2.5 last:border-0`}>
    {/* Context label + switch — header row on mobile, columns 1-2 on desktop */}
    <div class="flex items-center justify-between gap-2 md:contents">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <strong class="text-sm text-foreground">{contextLabel(props.policy.context)}</strong>
          <Show when={guarded()}><StatusBadge status="held" tone="warn" /></Show>
        </div>
        {/* The version number was the only thing on this line for most rows, and
            "v1" tells an operator nothing. The guardrail reason is why a policy is
            held, which is the one thing here worth reading. */}
        <Show when={props.policy.guardrail_reason}>
          <small class="mt-0.5 block text-xs text-warning">{props.policy.guardrail_reason}</small>
        </Show>
      </div>
      <Switch
        checked={enabled()}
        label={`${contextLabel(props.policy.context)} enabled`}
        disabled={props.pending}
        onChange={() => setEnabled((current) => !current)}
      />
    </div>

    {/* Authority ladder — labeled row on mobile, column 3 on desktop.

        This was a `<select>`, so the operator saw one rung at a time and could
        not tell there are four, which end is cautious, or how far along it this
        context already sits. Those are the questions being asked. The public
        site draws the same four as a scale; this is that, with the console's
        own wording, which says what the operator is agreeing to rather than
        naming the authority model. */}
    <div class="flex flex-col gap-1 md:contents">
      <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground md:hidden">How far it may go</span>
      <AuthorityScale
        rungs={AUTHORITY_RUNGS}
        value={level()}
        disabled={props.pending || !enabled() || readOnly()}
        label={`${contextLabel(props.policy.context)} — how far it may go`}
        onChange={setLevel}
      />
    </div>

    {/* Confidence slider — labeled row on mobile, column 4 on desktop */}
    <div class="flex flex-col gap-1 md:contents">
      <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground md:hidden">Confidence needed</span>
      <div class="flex items-center gap-2">
        <input
          class="min-w-0 flex-1 accent-primary"
          disabled={props.pending || !enabled()}
          {...writeGuard()}
          type="range"
          min="0"
          max="100"
          step="1"
          value={confidence()}
          onInput={(event) => setConfidence(event.currentTarget.valueAsNumber)}
          aria-label={`${contextLabel(props.policy.context)} minimum confidence`}
        />
        <strong class="w-9 shrink-0 text-right text-sm tabular-nums text-foreground">{Math.round(confidence())}%</strong>
      </div>
    </div>

    {/* Cap + save — footer row on mobile, columns 5-6 on desktop */}
    <div class="flex items-center gap-2 md:contents">
      <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground md:hidden shrink-0">Cap / day</span>
      <Input
        class="h-8 w-full text-right text-sm"
        disabled={props.pending || !enabled()}
        {...writeGuard()}
        type="number"
        min="1"
        max="1000"
        step="1"
        value={maxActions()}
        aria-label={`${contextLabel(props.policy.context)} — most actions per day`}
        onInput={(event) => setMaxActions(event.currentTarget.valueAsNumber)}
      />
      {/* A permanently disabled ghost button is indistinguishable from a label.
          The row has nothing to save until it is edited, so it offers nothing
          until then. */}
      <Show when={dirty()} fallback={<span />}>
        <Button
          size="sm"
          writes
          disabled={!valid() || props.pending}
          onClick={() => props.onSave({
            enabled: enabled(),
            autonomy_level: level(),
            minimum_confidence: confidenceBasisPoints(),
            max_actions_24h: maxActions(),
          })}
        >{props.pending ? 'Saving…' : 'Save'}</Button>
      </Show>
    </div>
  </div>
}
