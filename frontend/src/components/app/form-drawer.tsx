import { Show, createComputed, createSignal, createUniqueId, on, type JSX } from 'solid-js'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/components/ui/sheet'
import { Button } from '~/components/app/button'
import { ErrorCard } from '~/components/layout'
import { cn } from '~/lib/cn'

/**
 * FormDrawer — the one way the console adds (or edits) a record.
 *
 * Adding data used to expand a form inline, pushing the list it belongs to
 * down the page. Creating a record is a side task with its own lifecycle, so
 * it overlays: a right-hand sheet with a fixed header, a scrolling body and a
 * pinned footer. Closing it costs no scroll position.
 *
 *   <FormDrawer
 *     open={adding()} onOpenChange={setAdding}
 *     title="New location" description="A draft, not a public drop."
 *     submitLabel="Create draft" pending={create.isPending}
 *     error={create.error} errorTitle="Couldn't create the draft"
 *     onSubmit={() => create.mutate()}
 *   >
 *     <Field label="Drop number"><Input required pattern="\d{1,3}" … /></Field>
 *   </FormDrawer>
 *
 * Behaviour, so callers don't each re-decide it:
 * - It is a real `<form>`: Enter submits from any field.
 * - Validation runs on submit, not by disabling the button. Put `required`,
 *   `pattern`, `min`/`max` on the inputs; the browser blocks the submit,
 *   focuses the first invalid field and announces why. `onSubmit` only runs
 *   once every field is valid. Rules that span fields ("doors before the
 *   start") go in `validate`, which returns the sentence to show, or nothing.
 * - Submit is disabled only while `pending`, and keeps its verb-first label
 *   (`pendingLabel` while saving).
 * - Focus moves into the drawer on open, stays trapped there, Escape closes
 *   (Kobalte Dialog), and focus returns to the button that opened it.
 * - A failure shows as an `ErrorCard` pinned above the footer, so it is in
 *   view next to the button that caused it, however long the form is.
 * - The caller closes it on success (`onOpenChange(false)` in the mutation's
 *   `onSuccess`) and resets its own field state.
 */
export function FormDrawer(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names the record: "New location", "Edit contact". */
  title: string
  description?: JSX.Element
  /** Verb-first: "Create draft", "Add contact", "Save changes". */
  submitLabel: string
  /** Shown on the button while saving. Defaults to `submitLabel`. */
  pendingLabel?: string
  pending?: boolean
  onSubmit: () => void
  /** Cross-field rules, checked on submit after the native ones. Return the
   *  sentence that says how to fix it; `undefined` lets the submit through. */
  validate?: () => string | undefined
  /** The caught error, or a sentence the caller wrote. */
  error?: unknown
  /** What failed: "Couldn't create the draft". Used with `error`. */
  errorTitle?: string
  /** A secondary action on the left of the footer (e.g. "Create custom city"). */
  secondaryAction?: JSX.Element
  /** `lg` for forms with side-by-side fields or long text areas. */
  size?: 'md' | 'lg'
  /** Whether submitting writes (read-only sessions see it disabled). Default true. */
  writes?: boolean
  children: JSX.Element
}) {
  const formId = createUniqueId()
  const [invalid, setInvalid] = createSignal<string>()
  // Kobalte returns focus to its own Trigger on close, but every caller opens
  // this from an ordinary button, so without this focus fell to <body> and a
  // keyboard user started over from the top of the page. Remember what was
  // focused when it opened and go back there.
  let returnFocusTo: HTMLElement | null = null
  createComputed(on(() => props.open, open => {
    // A rule message from a previous session is not about the next one.
    setInvalid(undefined)
    if (open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      returnFocusTo = document.activeElement
    }
  }))
  const restoreFocus = (event: Event) => {
    if (!returnFocusTo?.isConnected) return
    event.preventDefault()
    returnFocusTo.focus()
    returnFocusTo = null
  }
  const submit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
    event.preventDefault()
    if (props.pending) return
    const problem = props.validate?.()
    setInvalid(problem)
    if (problem) return
    props.onSubmit()
  }
  const shown = () => invalid() ?? props.error
  const hasError = () => { const e = shown(); return e != null && e !== false && e !== '' }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        onCloseAutoFocus={restoreFocus}
        class={cn(
          'flex w-full flex-col gap-0 overscroll-contain p-0',
          props.size === 'lg' ? 'sm:max-w-lg' : 'sm:max-w-md',
        )}
      >
        <SheetHeader class="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <SheetTitle class="text-base">{props.title}</SheetTitle>
          <Show when={props.description}>
            <SheetDescription class="text-pretty">{props.description}</SheetDescription>
          </Show>
        </SheetHeader>

        <form
          id={formId}
          class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4"
          onSubmit={submit}
        >
          {props.children}
        </form>

        <Show when={hasError()}>
          <div class="shrink-0 px-5 pb-3">
            <Show
              when={typeof shown() === 'string'}
              fallback={<ErrorCard title={props.errorTitle} error={shown()} />}
            >
              <ErrorCard>{shown() as string}</ErrorCard>
            </Show>
          </div>
        </Show>

        {/* One row at every width: the stock footer stacks and reverses on
            phones, which put Back below Cancel. */}
        <SheetFooter class="shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:space-x-0">
          <Show when={props.secondaryAction}>
            <div class="mr-auto">{props.secondaryAction}</div>
          </Show>
          <Button type="button" variant="ghost" size="sm" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            size="sm"
            writes={props.writes ?? true}
            disabled={props.pending}
          >
            {props.pending ? (props.pendingLabel ?? props.submitLabel) : props.submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
