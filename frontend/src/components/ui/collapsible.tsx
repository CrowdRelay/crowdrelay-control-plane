import { Show, type Component, type JSX, createSignal, splitProps } from 'solid-js'
import { Collapsible as CollapsiblePrimitive } from '@kobalte/core'
import { cn } from '~/lib/cn'

/**
 * Collapsible — Kobalte-based accessible collapsible section. Replaces the
 * hand-rolled CollapsibleSection.tsx. Provides ARIA roles and keyboard
 * navigation out of the box.
 */

export const Collapsible = CollapsiblePrimitive.Root
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger
export const CollapsibleContent = CollapsiblePrimitive.Content

// ─── High-level wrapper matching the old CollapsibleSection API ─────────
// This preserves the existing import shape so callers don't need to change
// until the page migration phase.

// Hoisted: this was rebuilt on every render of every collapsible on the page,
// to answer a four-way lookup that never changes.
const BADGE_TONE_CLASS: Record<string, string> = {
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
  muted: 'text-muted-foreground',
}

export function CollapsibleSection(props: {
  eyebrow?: string
  title: string
  badge?: string
  badgeTone?: 'good' | 'warn' | 'bad' | 'muted'
  defaultOpen?: boolean
  class?: string
  children: JSX.Element
}) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false)
  const badgeToneClass = BADGE_TONE_CLASS

  return (
    <Collapsible open={open()} onOpenChange={setOpen} class={cn('border border-border bg-card', props.class)}>
      <CollapsibleTrigger class="flex w-full items-center justify-between gap-4 p-4 text-left">
        <div class="flex flex-col gap-1">
          <Show when={props.eyebrow}>
            <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{props.eyebrow}</span>
          </Show>
          <h3 class="text-sm font-semibold text-foreground">{props.title}</h3>
        </div>
        <div class="flex items-center gap-2">
          <Show when={props.badge}>
            <span class={cn('text-xs font-medium', props.badgeTone ? badgeToneClass[props.badgeTone] : badgeToneClass.muted)}>
              {props.badge}
            </span>
          </Show>
          <svg
            class={cn('h-4 w-4 text-muted-foreground transition-transform', open() && 'rotate-180')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </CollapsibleTrigger>
      {/* Kobalte keeps collapsed content mounted. On a page carrying a dozen
          of these, that is a dozen panels' worth of queries and DOM built for
          sections nobody has opened. `Show` mounts a body the first time it is
          opened and unmounts it when closed. */}
      <CollapsibleContent class="overflow-hidden">
        <Show when={open()}>
          <div class="p-4 pt-0">
            {props.children}
          </div>
        </Show>
      </CollapsibleContent>
    </Collapsible>
  )
}
