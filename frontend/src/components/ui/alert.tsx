import { type Component, type JSX, splitProps, Show } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Alert — a semantic surface for warnings, errors, and informational notes.
 * Replaces the ad-hoc `.warning-card` CSS class with a typed primitive.
 * Tones map to the design system: warning (amber), destructive (red),
 * info (muted), and success (green).
 */

export type AlertTone = 'warning' | 'destructive' | 'info' | 'success'

const toneStyles: Record<AlertTone, string> = {
  warning: 'border-warning/30 bg-warning/10 text-warning',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-border bg-surface-1 text-muted-foreground',
  success: 'border-success/30 bg-success/10 text-success',
}

export const Alert: Component<
  JSX.HTMLAttributes<HTMLDivElement> & {
    class?: string
    tone?: AlertTone
    title?: string
  }
> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'tone', 'title', 'children'])
  // `role="alert"` is assertive: a screen reader abandons what it was saying to
  // read it. That is right for a failure and wrong for "3 items synced", and
  // every tone was getting it. Only the two tones that mean something went
  // wrong interrupt; the rest are announced politely when the user gets there.
  const tone = () => local.tone ?? 'warning'
  const role = () => (tone() === 'destructive' || tone() === 'warning' ? 'alert' : 'status')
  return (
    <div
      role={role()}
      class={cn(
        'rounded-lg border p-4 text-sm break-words',
        toneStyles[tone()],
        local.class,
      )}
      {...rest}
    >
      <Show when={local.title}>
        <div class="font-semibold mb-1">{local.title}</div>
      </Show>
      {local.children}
    </div>
  )
}
