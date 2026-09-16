import { useColorMode } from '@kobalte/core'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'

/** Light / dark / system switch — the solid-ui docs' mode toggle. */
export function ModeToggle() {
  const { setColorMode } = useColorMode()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger as={Button<'button'>} variant="ghost" size="sm" class="w-9 px-0">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" aria-hidden="true">
          <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
          <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute size-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" aria-hidden="true">
          <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
        </svg>
        <span class="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => setColorMode('light')}>Light</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode('dark')}>Dark</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode('system')}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
