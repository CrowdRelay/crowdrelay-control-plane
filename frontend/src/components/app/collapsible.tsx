import { Show, type JSX, createSignal } from 'solid-js'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { Eyebrow } from '../layout'
import { cn } from '~/lib/cn'
import { ChevronDown } from 'lucide-solid'

export { Collapsible, CollapsibleContent, CollapsibleTrigger }

const BADGE_TONE_CLASS: Record<string, string> = {
  good: 'text-success-foreground',
  warn: 'text-warning-foreground',
  bad: 'text-destructive',
  muted: 'text-muted-foreground',
}

/**
 * A titled section that opens and closes, over the stock collapsible. The body
 * mounts the first time it opens and unmounts when closed, so a page of these
 * does not run queries for sections nobody has opened.
 */
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
  return (
    <Collapsible open={open()} onOpenChange={setOpen} class={cn('rounded-lg border bg-card text-card-foreground', props.class)}>
      <CollapsibleTrigger class="flex w-full items-center justify-between gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <div class="flex flex-col gap-1">
          <Show when={props.eyebrow}>
            <Eyebrow>{props.eyebrow}</Eyebrow>
          </Show>
          <h3 class="text-sm font-semibold">{props.title}</h3>
        </div>
        <div class="flex items-center gap-2">
          <Show when={props.badge}>
            <span class={cn('text-xs font-medium', BADGE_TONE_CLASS[props.badgeTone ?? 'muted'])}>{props.badge}</span>
          </Show>
          <ChevronDown class={cn('size-4 text-muted-foreground transition-transform', open() && 'rotate-180')} aria-hidden="true" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent class="overflow-hidden">
        <Show when={open()}>
          <div class="p-4 pt-0">{props.children}</div>
        </Show>
      </CollapsibleContent>
    </Collapsible>
  )
}
