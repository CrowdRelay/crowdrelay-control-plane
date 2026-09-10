import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * NativeSelect — a styled `<select>`.
 *
 * The console's selects are filters and enum pickers over lists the caller
 * already renders with `<For>`; a listbox primitive would buy keyboard and
 * ARIA behaviour the native element already has. What the native element does
 * NOT do is inherit the app's surface, so every panel had hand-written its
 * own class string — six variants, three of which set no background at all
 * and rendered an unreadable option list on a dark page. One box, defined here.
 *
 * `bg-surface-1` is set on the element itself, not only via a wrapper, because
 * Chromium paints the dropdown popup with the select's own background colour.
 */

export type NativeSelectProps = JSX.SelectHTMLAttributes<HTMLSelectElement> & {
  class?: string
  size?: 'sm' | 'default'
}

const CHEVRON =
  "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%239aa1ae' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")"

export const NativeSelect: Component<NativeSelectProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'size'])
  return (
    <select
      class={cn(
        'w-full appearance-none rounded-md border border-border bg-surface-1 text-foreground',
        'transition-colors hover:border-border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-45',
        local.size === 'sm' ? 'h-8 pl-2.5 pr-7 text-xs' : 'h-9 pl-3 pr-8 text-sm',
        local.class,
      )}
      style={{
        'background-image': CHEVRON,
        'background-repeat': 'no-repeat',
        'background-position': `right ${local.size === 'sm' ? '8px' : '10px'} center`,
        'background-size': '11px',
      }}
      {...rest}
    />
  )
}
