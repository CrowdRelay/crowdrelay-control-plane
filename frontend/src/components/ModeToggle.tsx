import { useColorMode } from '@kobalte/core'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { Moon, Sun } from 'lucide-solid'

/** Light / dark / system switch — the solid-ui docs' mode toggle. */
export function ModeToggle() {
  const { setColorMode } = useColorMode()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger as={Button<'button'>} variant="ghost" size="sm" class="w-9 px-0">
        <Sun class="size-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" aria-hidden="true" />
        <Moon class="absolute size-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" aria-hidden="true" />
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
