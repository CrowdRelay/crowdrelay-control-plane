import { Show, type JSX } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { cn } from '../lib/utils'

// The redesign's shared page pieces (CONSOLE_REDESIGN_PLAN §6). Every view
// built from a mockup opens the same way — a header pill with one sentence,
// a ranked list with one button per row, outcomes as a label and a result
// word — so these are drawn once here rather than per page.

export type ViewTone = 'good' | 'warn' | 'bad' | 'muted'

const PILL_TONE: Record<ViewTone, string> = {
  good: 'bg-success text-success-foreground',
  warn: 'bg-warning text-warning-foreground',
  bad: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
}

/** The header's state: one tone, one sentence. */
export function StatusPill(props: { tone: ViewTone; children: JSX.Element; class?: string }) {
  return (
    <span class={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', PILL_TONE[props.tone], props.class)}>
      {props.children}
    </span>
  )
}

/** A small label pill in front of a work row: what kind of move it is. */
export function RowTag(props: { tone?: ViewTone; children: JSX.Element }) {
  return (
    <span class={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', PILL_TONE[props.tone ?? 'muted'])}>
      {props.children}
    </span>
  )
}

/** One row of a ranked work list: tag, title, one line of why, one control.
 *  `to`/`params`/`search` open the real control; `href` is for links out. */
export function WorkRow(props: {
  tag?: JSX.Element
  title: JSX.Element
  why?: JSX.Element
  action?: string
  to?: string
  params?: Record<string, string>
  search?: Record<string, string>
  href?: string
}) {
  const body = (
    <>
      {props.tag}
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm text-foreground group-hover:underline">{props.title}</p>
        <Show when={props.why}>
          <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{props.why}</p>
        </Show>
      </div>
      <Show when={props.action}>
        <span class="shrink-0 text-xs font-medium text-primary">{props.action}</span>
      </Show>
    </>
  )
  const rowClass = 'group flex items-center gap-3 border-t border-border py-2.5 first:border-t-0'
  return (
    <Show when={props.to} fallback={
      <Show when={props.href} fallback={<div class={rowClass}>{body}</div>}>
        <a href={props.href} target="_blank" rel="noreferrer" class={rowClass}>{body}</a>
      </Show>
    }>
      <Link to={props.to!} params={props.params} search={props.search} class={rowClass}>{body}</Link>
    </Show>
  )
}

/** "Is it working": a plain outcome label and its result word. */
export function OutcomeRow(props: { label: JSX.Element; result: JSX.Element; tone?: ViewTone; action?: JSX.Element }) {
  return (
    <div class="flex items-center gap-3 border-t border-border py-2 text-sm first:border-t-0">
      <span class="min-w-0 flex-1 text-foreground">{props.label}</span>
      <RowTag tone={props.tone}>{props.result}</RowTag>
      {props.action}
    </div>
  )
}

/** One labelled share bar — "what there is", "rooms by assessment". */
export function BarRow(props: { label: string; value: number | null; max: number; tone?: ViewTone; display?: string }) {
  const width = () => (props.value == null || props.max <= 0 ? 0 : Math.max(2, Math.round((props.value / props.max) * 100)))
  const fill: Record<ViewTone, string> = {
    good: 'bg-success-foreground',
    warn: 'bg-warning-foreground',
    bad: 'bg-destructive',
    muted: 'bg-primary/75',
  }
  return (
    <div class="flex items-center gap-3 border-t border-border py-2 text-xs first:border-t-0">
      <span class="w-24 shrink-0 text-foreground">{props.label}</span>
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div class={cn('h-full rounded-full', fill[props.tone ?? 'muted'])} style={{ width: `${width()}%` }} />
      </div>
      <span class="w-10 shrink-0 text-right tabular-nums text-foreground">{props.display ?? (props.value == null ? '—' : props.value.toLocaleString())}</span>
    </div>
  )
}
