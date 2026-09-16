import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from 'lucide-solid'
import { useColorMode } from '@kobalte/core'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuGroupLabel, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '~/components/ui/sidebar'

/** The signed-in operator — sidebar-07's `NavUser`, with theme and sign-out. */
export function NavUser(props: { name: string; role: string; onLogout: () => void }) {
  const { isMobile } = useSidebar()
  const { colorMode, setColorMode } = useColorMode()
  const initials = () => props.name.slice(0, 2).toUpperCase()
  // `colorMode()` is the resolved mode; "system" is only known to storage.
  const stored = () => {
    try { return localStorage.getItem('control-plane-color-mode') ?? 'system' } catch { return 'system' }
  }

  const identity = () => (
    <>
      <Avatar class="size-8 rounded-lg">
        <AvatarFallback class="rounded-lg">{initials()}</AvatarFallback>
      </Avatar>
      <div class="grid flex-1 text-left text-sm leading-tight">
        <span class="truncate font-medium">{props.name}</span>
        <span class="truncate text-xs">{props.role}</span>
      </div>
    </>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu placement={isMobile() ? 'top' : 'right-end'}>
          <DropdownMenuTrigger
            as={SidebarMenuButton}
            size="lg"
            aria-label="Account menu"
            class="data-[expanded]:bg-sidebar-accent data-[expanded]:text-sidebar-accent-foreground"
          >
            {identity()}
            <ChevronsUpDown class="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-56 rounded-lg">
            <DropdownMenuLabel class="p-0 font-normal">
              <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">{identity()}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuGroupLabel>Theme</DropdownMenuGroupLabel>
              <DropdownMenuRadioGroup
                value={colorMode() && stored()}
                onChange={value => setColorMode(value as 'light' | 'dark' | 'system')}
              >
                <DropdownMenuRadioItem value="light" class="gap-2"><Sun class="size-4" /> Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark" class="gap-2"><Moon class="size-4" /> Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system" class="gap-2"><Monitor class="size-4" /> System</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => props.onLogout()} class="gap-2">
              <LogOut class="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
