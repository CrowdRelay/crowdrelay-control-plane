/**
 * Focus goes back to whatever opened an overlay when it closes.
 *
 * Kobalte returns focus to a dialog's own `Trigger`, but most of the
 * console's dialogs, confirmations and sheets open from an ordinary button
 * (`onClick={() => setOpen(true)}`), a shortcut or a row action — no Trigger,
 * so on close focus fell to <body> and a keyboard user started again from the
 * top of the page. The element focused when the overlay opens is remembered
 * and refocused on close. A caller's own handler runs first and wins if it
 * calls `preventDefault()`.
 */
export function returnFocusHandlers(user: {
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  let opener: HTMLElement | null = null
  return {
    onOpenAutoFocus: (event: Event) => {
      // Fires before focus moves into the overlay, so this is the opener.
      const active = document.activeElement
      opener = active instanceof HTMLElement && active !== document.body ? active : null
      user.onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event: Event) => {
      user.onCloseAutoFocus?.(event)
      const target = opener
      opener = null
      if (event.defaultPrevented || !target?.isConnected) return
      event.preventDefault()
      target.focus()
    },
  }
}
