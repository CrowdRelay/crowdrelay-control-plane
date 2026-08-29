import { Show, createSignal } from 'solid-js'
import type { JSX } from 'solid-js'

/**
 * Reusable collapsible section for the operations dashboard.
 * Header shows eyebrow + title + optional badge, clicking toggles the body.
 */
export function CollapsibleSection(props: {
  eyebrow?: string
  title: string
  badge?: string
  badgeTone?: 'good' | 'warn' | 'bad' | 'muted'
  defaultOpen?: boolean
  children: JSX.Element
}) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false)

  return (
    <article class="panel collapsible-section" classList={{ open: open() }}>
      <button
        type="button"
        class="collapsible-header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open()}
      >
        <div class="collapsible-header-text">
          <Show when={props.eyebrow}>
            <span class="eyebrow">{props.eyebrow}</span>
          </Show>
          <h3>{props.title}</h3>
        </div>
        <div class="collapsible-header-meta">
          <Show when={props.badge}>
            <span class={`badge tone-${props.badgeTone ?? 'muted'}`}>{props.badge}</span>
          </Show>
          <svg
            class="collapsible-chevron"
            width="16"
            height="16"
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
      </button>
      <Show when={open()}>
        <div class="collapsible-body">
          {props.children}
        </div>
      </Show>
    </article>
  )
}
