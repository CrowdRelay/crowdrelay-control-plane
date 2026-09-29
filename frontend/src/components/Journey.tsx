import { Index, Match, Show, Switch, type JSX } from 'solid-js'
import { cn } from '../lib/cn'
import { Button } from './app/button'
import { StatusBadge } from './StatusBadge'
import { AlertTriangle, Check, ChevronRight, Circle, Minus } from 'lucide-solid'

// The journey primitives — one vocabulary for every pipeline the console
// renders (booking, the brain's cycle, deliveries, relay runs): a stage
// rail on top that answers "where does the work sit", and instance cards
// below that each carry one state badge and one action.
//
// Counts are `number | null` on purpose: a degraded section renders `—`,
// never a confident zero. `waiting` is the subset parked on a person — the
// number the operator scans first.

export type JourneyStageSpec = {
  key: string
  label: string
  /** Items sitting in this stage right now. `null` = the section that
   *  would answer is degraded — the rail renders '—', not 0. `undefined`
   *  hides the number line entirely (a stage that answers in words). */
  count?: number | null
  /** A word in the number slot instead of a count — a verdict, not a
   *  tally. Wins over `count` when both are set. */
  headline?: string
  /** Of those, how many are parked on a person's answer. */
  waiting?: number
  /** One freeform line under the count — "oldest 12d", "answers in 2d",
   *  "next in 5d". Each stage writes the honest version of its own clock. */
  detail?: string | null
  /** The stage needs looking at — a destructive-tone border and a marker,
   *  taking precedence over `waiting`'s warning border. */
  stuck?: boolean
  /** Optional anchor id — the rail button scrolls to the stage's section. */
  anchor?: string
  /** Drill-through — the rail button calls this instead of scrolling to
   *  `anchor` when both are set. */
  onSelect?: () => void
}

/** The stage rail — pipeline order left to right, collapsing to a wrapped
 *  flow on narrow screens. Clicking a stage drills through (`onSelect`) or
 *  scrolls to its section (`anchor`).
 *
 *  `Index`, not `For`: callers re-derive the spec array on a clock tick,
 *  producing new objects for the same stages. `For` keys on item identity
 *  and would tear down and rebuild every button each tick — dropping
 *  keyboard focus mid-rail. `Index` keys on position (the stage order is
 *  stable), so the buttons persist and only their props update. */
export function JourneyRail(props: { stages: JourneyStageSpec[] }) {
  const go = (stage: JourneyStageSpec) => {
    if (stage.onSelect) {
      stage.onSelect()
      return
    }
    if (!stage.anchor) return
    document.getElementById(stage.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <ol class="flex flex-wrap items-stretch gap-1.5" aria-label="Pipeline stages">
      <Index each={props.stages}>
        {(stage, i) => (
          <>
            <Show when={i > 0}>
              <li aria-hidden="true" class="flex items-center text-muted-foreground/50">
                <ChevronRight class="size-3.5" />
              </li>
            </Show>
            <li>
              <Button
                variant="ghost"
                type="button"
                disabled={!stage().anchor && !stage().onSelect}
                onClick={() => go(stage())}
                class={cn(
                  'flex h-full min-w-24 flex-col items-start justify-start gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left font-normal whitespace-normal',
                  (stage().anchor || stage().onSelect) && 'transition-colors hover:bg-accent/40',
                  stage().stuck ? 'border-destructive/50' : (stage().waiting ?? 0) > 0 && 'border-warning/50',
                )}
              >
                <span class="flex w-full items-center justify-between gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {stage().label}
                  <Show when={stage().stuck}>
                    <AlertTriangle class="size-3.5 text-destructive" aria-hidden="true" />
                    <span class="sr-only">needs attention</span>
                  </Show>
                </span>
                <Show when={stage().headline !== undefined || stage().count !== undefined}>
                  <span class="flex items-baseline gap-1.5">
                    <span class="text-lg font-bold tabular-nums text-foreground">
                      {stage().headline ?? (stage().count == null ? '—' : stage().count)}
                    </span>
                    <Show when={(stage().waiting ?? 0) > 0}>
                      <span class="text-xs font-medium text-warning-foreground">
                        {stage().waiting} need{stage().waiting === 1 ? 's' : ''} you
                      </span>
                    </Show>
                  </span>
                </Show>
                <Show when={stage().detail}>
                  {detail => <span class="text-xs text-muted-foreground">{detail()}</span>}
                </Show>
              </Button>
            </li>
          </>
        )}
      </Index>
    </ol>
  )
}

// ─── JourneySteps ─────────────────────────────────────────────────────
// The rail above counts work sitting in each stage; this tracks ONE
// instance — a tenant deployment, a booking — moving through ordered
// steps. Where the rail asks "where does the work sit", this asks "how
// far did this one get".

export type JourneyStepStatus = 'done' | 'current' | 'stuck' | 'pending' | 'skipped'

export type JourneyStepSpec = {
  key: string
  label: string
  status: JourneyStepStatus
  /** One freeform line under the label — "finished 2h ago",
   *  "lease expired 10m ago". */
  detail?: string | null
}

const STEP_STATUS_SR: Record<JourneyStepStatus, string> = {
  done: 'done',
  current: 'in progress',
  stuck: 'needs attention',
  pending: 'pending',
  skipped: 'skipped',
}

function StepIcon(props: { status: JourneyStepStatus }) {
  const cls = 'size-4 shrink-0'
  // Switch/Match, not a JS switch: under `Index` the status changes in place
  // and a component body runs once — a plain switch would freeze the icon.
  return (
    <Switch fallback={<Circle class={cn(cls, 'text-muted-foreground')} aria-hidden="true" />}>
      <Match when={props.status === 'done'}><Check class={cn(cls, 'text-success-foreground')} aria-hidden="true" /></Match>
      <Match when={props.status === 'current'}><Circle class={cn(cls, 'fill-current text-primary')} aria-hidden="true" /></Match>
      <Match when={props.status === 'stuck'}><AlertTriangle class={cn(cls, 'text-destructive')} aria-hidden="true" /></Match>
      <Match when={props.status === 'skipped'}><Minus class={cn(cls, 'text-muted-foreground')} aria-hidden="true" /></Match>
    </Switch>
  )
}

/** One process instance through ordered steps — wraps on narrow screens
 *  the way the rail does. `aria-current="step"` marks the step the
 *  instance sits on (or is stuck at). `Index` for the same reason as the
 *  rail: callers re-derive the spec on a clock tick and the step order is
 *  stable. */
export function JourneySteps(props: { steps: JourneyStepSpec[]; label: string }) {
  return (
    <ol class="flex flex-wrap items-stretch gap-1.5" aria-label={props.label}>
      <Index each={props.steps}>
        {(step, i) => (
          <>
            <Show when={i > 0}>
              <li aria-hidden="true" class="flex items-center text-muted-foreground/50">
                <ChevronRight class="size-3.5" />
              </li>
            </Show>
            <li
              aria-current={step().status === 'current' || step().status === 'stuck' ? 'step' : undefined}
              class={cn(
                'flex min-w-24 flex-col items-start gap-0.5 rounded-md border border-border bg-card px-3 py-2',
                step().status === 'stuck' && 'border-destructive/50',
              )}
            >
              <span class="flex items-center gap-1.5">
                <StepIcon status={step().status} />
                <span class={cn(
                  'text-xs font-semibold',
                  step().status === 'skipped' ? 'text-muted-foreground line-through'
                    : step().status === 'pending' ? 'text-muted-foreground'
                    : 'text-foreground',
                )}>
                  {step().label}
                </span>
                <span class="sr-only">{STEP_STATUS_SR[step().status]}</span>
              </span>
              <Show when={step().detail}>
                {detail => <span class="text-xs text-muted-foreground">{detail()}</span>}
              </Show>
            </li>
          </>
        )}
      </Index>
    </ol>
  )
}

/** One instance in a journey — a candidate, a negotiation, a night. The
 *  title is the thing itself; `meta` is the one line that explains where it
 *  sits; `action` is the single button or link that moves it. Everything
 *  else drills through. */
export function JourneyCard(props: {
  title: JSX.Element
  meta?: JSX.Element
  badge?: { label: string; tone?: 'good' | 'warn' | 'bad' | 'muted' }
  action?: JSX.Element
  children?: JSX.Element
}) {
  return (
    <article class="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h3 class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{props.title}</h3>
          <Show when={props.badge}>
            {badge => <StatusBadge status={badge().label} tone={badge().tone} />}
          </Show>
        </div>
        <Show when={props.meta}>
          <p class="mt-0.5 truncate text-xs text-muted-foreground">{props.meta}</p>
        </Show>
        <Show when={props.children}>{props.children}</Show>
      </div>
      <Show when={props.action}>
        <div class="shrink-0 self-center">{props.action}</div>
      </Show>
    </article>
  )
}
