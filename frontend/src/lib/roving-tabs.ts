/**
 * Arrow-key movement inside a `role="tablist"` (WAI-ARIA APG tabs, manual
 * activation): Left/Right and Home/End move focus between the tabs, and
 * Enter/Space — the button's own behaviour — activates the focused one.
 * Pair it with a roving tabindex so Tab enters the list once, on the
 * selected tab, and leaves it on the next Tab.
 */
export function onTabListKeyDown(event: KeyboardEvent) {
  const current = event.currentTarget as HTMLElement
  const list = current.closest('[role="tablist"]')
  if (!list) return
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')]
  const index = tabs.indexOf(current)
  if (index < 0) return
  const next =
    event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
    : event.key === 'ArrowLeft' ? tabs[(index - 1 + tabs.length) % tabs.length]
    : event.key === 'Home' ? tabs[0]
    : event.key === 'End' ? tabs[tabs.length - 1]
    : undefined
  if (!next) return
  event.preventDefault()
  next.focus()
}
