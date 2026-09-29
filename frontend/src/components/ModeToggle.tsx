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
        <Sun class="size-6 scale-100 opacity-100 blur-0 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] dark:scale-[0.25] dark:opacity-0 dark:blur-xs" aria-hidden="true" />
        <Moon class="absolute size-6 scale-[0.25] opacity-0 blur-xs transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] dark:scale-100 dark:opacity-100 dark:blur-0" aria-hidden="true" />
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
