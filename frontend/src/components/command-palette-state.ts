import { createSignal } from 'solid-js'

// Deliberately tiny and eager: Shell owns the global shortcut and button, so
// they can flip this signal without pulling the whole palette component into
// the entry bundle. The component itself is dynamically imported on first
// invocation.
const [open, setOpen] = createSignal(false)
export const commandPaletteOpen = open
export const setCommandPaletteOpen = setOpen
export const toggleCommandPalette = () => setOpen(value => !value)

// Warm the palette's chunk when the pointer or focus reaches the trigger, so
// the first open doesn't wait on the network. The import is the same module
// Shell lazy-loads, so it is fetched once.
let warmed = false
export const preloadCommandPalette = () => {
  if (warmed) return
  warmed = true
  void import('./CommandPalette').catch(() => { warmed = false })
}
