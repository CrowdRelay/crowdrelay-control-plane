import { For, Show, type JSX } from 'solid-js'
import { cn } from '../lib/cn'
import { Button } from './app/button'
import { StatusBadge } from './StatusBadge'
import { ChevronRight } from 'lucide-solid'

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
   *  would answer is degraded — the rail renders '—', not 0. */
  count: number | null
  /** Of those, how many are parked on a person's answer. */
  waiting?: number
  /** One freeform line under the count — "oldest 12d", "answers in 2d",
   *  "next in 5d". Each stage writes the honest version of its own clock. */
  detail?: string | null
  /** Optional anchor id — the rail button scrolls to the stage's section. */
  anchor?: string
}

/** The stage rail — pipeline order left to right, collapsing to a wrapped
 *  flow on narrow screens. Clicking a stage scrolls to its section. */
export function JourneyRail(props: { stages: JourneyStageSpec[] }) {
  const go = (stage: JourneyStageSpec) => {
    if (!stage.anchor) return
    document.getElementById(stage.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <ol class="flex flex-wrap items-stretch gap-1.5" aria-label="Pipeline stages">
      <For each={props.stages}>
        {(stage, i) => (
          <>
            <Show when={i() > 0}>
              <li aria-hidden="true" class="flex items-center text-muted-foreground/50">
                <ChevronRight class="size-3.5" />
              </li>
            </Show>
            <li>
              <Button
                variant="ghost"
                type="button"
                disabled={!stage.anchor}
                onClick={() => go(stage)}
                class={cn(
                  'flex h-full min-w-24 flex-col items-start justify-start gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left font-normal whitespace-normal',
                  stage.anchor && 'transition-colors hover:bg-accent/40',
                  (stage.waiting ?? 0) > 0 && 'border-warning/50',
                )}
              >
                <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stage.label}
                </span>
                <span class="flex items-baseline gap-1.5">
                  <span class="text-lg font-bold tabular-nums text-foreground">
                    {stage.count == null ? '—' : stage.count}
                  </span>
                  <Show when={(stage.waiting ?? 0) > 0}>
                    <span class="text-xs font-medium text-warning-foreground">
                      {stage.waiting} need{stage.waiting === 1 ? 's' : ''} you
                    </span>
                  </Show>
                </span>
                <Show when={stage.detail}>
                  {detail => <span class="text-xs text-muted-foreground">{detail()}</span>}
                </Show>
              </Button>
            </li>
          </>
        )}
      </For>
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
