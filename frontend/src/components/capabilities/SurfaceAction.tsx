import { Show, createSignal, type JSX } from 'solid-js'
import type { CapabilityAction } from '../../lib/capabilities'
import { Button, type ButtonVariant } from '../app/button'
import { ActionForm } from './ActionForm'

/** One write, attached to the place where a person already is: a button
 *  that opens the typed form in place and closes it when the write lands.
 *  Designed panels compose this rather than growing their own forms, so
 *  every surface write gets the same idempotency, confirm and error path. */
export function SurfaceAction(props: {
  slug: string
  action: CapabilityAction
  /** The button's words where the place names the act better than the spec. */
  label?: string
  fixed?: Record<string, string>
  initial?: Record<string, string | boolean>
  hidden?: string[]
  variant?: ButtonVariant
  size?: 'xs' | 'sm'
  onDone?: (response: unknown) => void
  children?: JSX.Element
}) {
  const [open, setOpen] = createSignal(false)
  return (
    <Show when={open()} fallback={
      <Button size={props.size ?? 'sm'} variant={props.variant ?? 'outline'} writes onClick={() => setOpen(true)}>
        {props.label ?? props.action.label}
      </Button>
    }>
      <div class="w-full">
        {props.children}
        <ActionForm
          slug={props.slug}
          action={props.action}
          fixed={props.fixed}
          initial={props.initial}
          hidden={props.hidden}
          onDone={(response) => { setOpen(false); props.onDone?.(response) }}
          onCancel={() => setOpen(false)}
        />
      </div>
    </Show>
  )
}
