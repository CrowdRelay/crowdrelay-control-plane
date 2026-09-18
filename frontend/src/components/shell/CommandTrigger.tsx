import { Search } from 'lucide-solid'
import { Button } from '~/components/ui/button'
import { Kbd, KbdGroup } from '~/components/ui/kbd'
import { toggleCommandPalette } from '../command-palette-state'

/**
 * The top bar's way into the command palette — shadcn's docs-site search
 * trigger: a button dressed as a search field, with the shortcut on the right.
 * Below `sm` it folds to an icon button so the breadcrumb keeps its room.
 */
export function CommandTrigger() {
  return (
    <>
      <Button
        variant="outline"
        type="button"
        class="hidden h-9 w-56 justify-start gap-2 bg-muted/50 pl-3 pr-1.5 font-normal text-muted-foreground shadow-none sm:inline-flex lg:w-72"
        onClick={() => toggleCommandPalette()}
        aria-label="Search or run a command"
        aria-haspopup="dialog"
      >
        <Search />
        <span class="min-w-0 flex-1 truncate text-left">Search or run a command…</span>
        <KbdGroup>
          <Kbd class="border bg-background">⌘</Kbd>
          <Kbd class="border bg-background">K</Kbd>
        </KbdGroup>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        class="size-9 text-muted-foreground sm:hidden"
        onClick={() => toggleCommandPalette()}
        aria-label="Search or run a command"
        aria-haspopup="dialog"
      >
        <Search />
      </Button>
    </>
  )
}
