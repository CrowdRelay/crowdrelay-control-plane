import { Show, type JSX } from 'solid-js'
import type { CapabilityAction } from '../../lib/capabilities'
import { cn } from '../../lib/cn'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { ActionForm } from './ActionForm'

/** One surface write, opened from a table row or a toolbar. */
export type OpenWrite = {
  title: string
  description?: JSX.Element
  action: CapabilityAction
  fixed?: Record<string, string>
  initial?: Record<string, string | boolean>
  hidden?: string[]
  /** Shown above the form — what to know before filling it in. */
  intro?: JSX.Element
  /** `lg` for a form with a long JSON or list field. */
  size?: 'md' | 'lg'
}

/**
 * `SurfaceAction`'s form in a right-hand sheet. Inside a table a form that
 * expands in place pushes every row below it about; this opens beside the
 * table instead, and closes when the write lands. Same `ActionForm`, so the
 * idempotency, confirm and error path are unchanged.
 */
export function ActionSheet(props: {
  slug: string
  write: OpenWrite | null
  onClose: () => void
  onDone: (response: unknown) => void
}) {
  return (
    <Sheet open={props.write !== null} onOpenChange={open => { if (!open) props.onClose() }}>
      <SheetContent
        class={cn(
          'flex w-full flex-col gap-0 overflow-y-auto overscroll-contain p-0',
          props.write?.size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <Show when={props.write}>{current => <>
          <SheetHeader class="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
            <SheetTitle class="text-base">{current().title}</SheetTitle>
            <Show when={current().description}><SheetDescription class="text-pretty">{current().description}</SheetDescription></Show>
          </SheetHeader>
          <div class="space-y-3 px-5 py-4">
            <Show when={current().intro}><div class="text-sm text-muted-foreground text-pretty">{current().intro}</div></Show>
            <ActionForm
              slug={props.slug}
              action={current().action}
              fixed={current().fixed}
              initial={current().initial}
              hidden={current().hidden}
              onDone={response => props.onDone(response)}
              onCancel={props.onClose}
            />
          </div>
        </>}</Show>
      </SheetContent>
    </Sheet>
  )
}
