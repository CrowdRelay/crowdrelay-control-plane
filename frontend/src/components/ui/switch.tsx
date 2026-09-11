import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Switch — on/off toggle for a boolean the operator flips directly
 * (runtime flags, notifier channels, policy enablement).
 *
 * It stays a plain `<button role="switch">` rather than a Kobalte primitive:
 * every caller already owns the value and the mutation, so a controlled
 * primitive would only add a second source of truth. The visual state is
 * driven entirely by `checked` — there is no internal state to drift.
 *
 * Usage:
 *   <Switch checked={flag.enabled} disabled={pending()} label="Auto-reply"
 *           onChange={() => update(flag)} />
 */

export type SwitchProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean
  /** Accessible name. Required — a bare toggle reads as "button" otherwise. */
  label: string
  onChange?: () => void
  class?: string
}

export const Switch: Component<SwitchProps> = (props) => {
  const [local, rest] = splitProps(props, ['checked', 'label', 'onChange', 'class'])
  return (
    <button
      type="button"
      role="switch"
      aria-checked={local.checked}
      aria-label={local.label}
      onClick={() => local.onChange?.()}
      class={cn(
        // 20px tall was smaller than every other control in the row and a poor
        // pointer target next to twenty-one siblings. 24px matches the `xs`
        // button height and the badge cap height beside it.
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-45',
        local.checked ? 'border-primary bg-primary' : 'border-border-strong bg-surface-3',
        local.class,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        class={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          local.checked ? 'translate-x-6' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
