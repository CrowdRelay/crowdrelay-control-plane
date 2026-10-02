import { For, Show, createSignal, type JSX } from 'solid-js'
import {
  createSolidTable, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel,
  type ColumnDef, type PaginationState, type RowData, type SortingState, type VisibilityState,
} from '@tanstack/solid-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Search } from 'lucide-solid'
import { Button } from './button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { Input } from '~/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
import { cn } from '~/lib/cn'

declare module '@tanstack/solid-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Right-align with tabular digits, header and cells alike. */
    numeric?: boolean
    /** Extra classes for this column's cells. */
    class?: string
    /** The column's name in the Columns menu, when its header isn't a string. */
    label?: string
  }
}

export type { ColumnDef } from '@tanstack/solid-table'

/**
 * shadcn's data table (ui.shadcn.com/docs/components/data-table) — TanStack
 * Table over the stock `Table`: a filter box and a Columns menu above a
 * bordered table with click-to-sort headers, Previous / Next below.
 *
 * `searchText` says what a row is searchable by; the box matches it
 * case-insensitively. The search takes the full row, with the Columns menu
 * and `actions` (an add button) at its right end; `toolbar` (filters) sits
 * on its own row below. `empty` replaces the table when
 * there are no rows at all; a search that matches nothing says "No results."
 * in the table instead. Columns opt out of sorting with `enableSorting:
 * false` and out of the Columns menu with `enableHiding: false`.
 */
export function DataTable<T>(props: {
  data: T[]
  columns: ColumnDef<T, any>[]
  searchText: (row: T) => string
  searchPlaceholder?: string
  /** What the search box is called for a screen reader. */
  searchLabel?: string
  toolbar?: JSX.Element
  actions?: JSX.Element
  empty?: JSX.Element
  initialSorting?: SortingState
  pageSize?: number
  /** Box the table in its own border. Off when the table already sits in a
   *  card — a border inside a border is just noise. */
  bordered?: boolean
  getRowId?: (row: T) => string
  /** A DOM id on the row's `<tr>`, for deep links that scroll to a row. */
  rowDomId?: (row: T) => string | undefined
  /** Extra classes on a row — a deep link's highlight, say. */
  rowClass?: (row: T) => string | undefined
}) {
  const [sorting, setSorting] = createSignal<SortingState>(props.initialSorting ?? [])
  const [query, setQuery] = createSignal('')
  const [visibility, setVisibility] = createSignal<VisibilityState>({})
  const [pagination, setPagination] = createSignal<PaginationState>({ pageIndex: 0, pageSize: props.pageSize ?? 10 })

  const table = createSolidTable<T>({
    get data() { return props.data },
    get columns() { return props.columns },
    getRowId: props.getRowId ? (row) => props.getRowId!(row) : undefined,
    state: {
      get sorting() { return sorting() },
      get globalFilter() { return query() },
      get pagination() { return pagination() },
      get columnVisibility() { return visibility() },
    },
    onColumnVisibilityChange: setVisibility,
    onSortingChange: setSorting,
    // A header flips between ascending and descending; it never drops back
    // to unsorted, which reads as a random order.
    enableSortingRemoval: false,
    onGlobalFilterChange: setQuery,
    onPaginationChange: setPagination,
    // The row's own search text, not each cell's — a cell renders badges and
    // buttons, and the words worth finding are known to the caller.
    globalFilterFn: (row, _columnId, value: string) =>
      props.searchText(row.original).toLowerCase().includes(value.trim().toLowerCase()),
    getColumnCanGlobalFilter: () => true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const total = () => table.getFilteredRowModel().rows.length
  const pageCount = () => Math.max(1, table.getPageCount())
  const columnName = (column: ReturnType<typeof table.getAllLeafColumns>[number]) => {
    const header = column.columnDef.header
    return column.columnDef.meta?.label ?? (typeof header === 'string' ? header : column.id)
  }

  return (
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        {/* Full width on a phone, with the buttons wrapping under it. */}
        <div class="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            class="h-9 pl-9"
            placeholder={props.searchPlaceholder ?? 'Search…'}
            aria-label={props.searchLabel ?? props.searchPlaceholder ?? 'Search'}
            value={query()}
            onInput={(e) => { setQuery(e.currentTarget.value); table.setPageIndex(0) }}
          />
        </div>
        <div class="ml-auto flex items-center gap-2">
          <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger as={Button} variant="outline" size="sm">
              Columns <ChevronDown aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-40">
              <For each={table.getAllLeafColumns().filter(c => c.getCanHide())}>{column => (
                <DropdownMenuCheckboxItem
                  checked={column.getIsVisible()}
                  onChange={(value: boolean) => column.toggleVisibility(value)}
                >
                  {columnName(column)}
                </DropdownMenuCheckboxItem>
              )}</For>
            </DropdownMenuContent>
          </DropdownMenu>
          {props.actions}
        </div>
      </div>
      <Show when={props.toolbar}>
        <div class="flex flex-wrap items-center gap-2">{props.toolbar}</div>
      </Show>

      <Show when={props.data.length > 0} fallback={props.empty}>
        <div class={cn('overflow-hidden', props.bordered !== false && 'rounded-md border')}>
          <Table>
            <TableHeader>
              <For each={table.getHeaderGroups()}>{group => (
                <TableRow>
                  <For each={group.headers}>{header => {
                    const meta = header.column.columnDef.meta
                    return (
                      <TableHead
                        class={cn(meta?.numeric && 'text-right')}
                        aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}
                      >
                        <Show when={!header.isPlaceholder}>
                          <Show
                            when={header.column.getCanSort()}
                            fallback={flexRender(header.column.columnDef.header, header.getContext())}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              class={cn('-ml-3 h-8 data-[state=sorted]:text-foreground', meta?.numeric && '-mr-2 ml-auto')}
                              data-state={header.column.getIsSorted() ? 'sorted' : undefined}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <Show
                                when={header.column.getIsSorted()}
                                fallback={<ArrowUpDown class="size-3.5 text-muted-foreground" aria-hidden="true" />}
                              >
                                {header.column.getIsSorted() === 'asc'
                                  ? <ArrowUp class="size-3.5" aria-hidden="true" />
                                  : <ArrowDown class="size-3.5" aria-hidden="true" />}
                              </Show>
                            </Button>
                          </Show>
                        </Show>
                      </TableHead>
                    )
                  }}</For>
                </TableRow>
              )}</For>
            </TableHeader>
            <TableBody>
              <For
                each={table.getRowModel().rows}
                fallback={
                  <TableRow>
                    <TableCell colSpan={table.getVisibleLeafColumns().length} class="h-24 text-center text-muted-foreground">
                      No results.
                    </TableCell>
                  </TableRow>
                }
              >{row => (
                <TableRow id={props.rowDomId?.(row.original)} class={cn(props.rowDomId && 'scroll-mt-4', props.rowClass?.(row.original))}>
                  <For each={row.getVisibleCells()}>{cell => (
                    <TableCell numeric={cell.column.columnDef.meta?.numeric} class={cell.column.columnDef.meta?.class}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )}</For>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
        </div>

        <div class="flex items-center justify-between gap-4">
          <p class="text-sm text-muted-foreground tabular-nums">
            {total()} {total() === 1 ? 'row' : 'rows'}
            <Show when={pageCount() > 1}> · Page {pagination().pageIndex + 1} of {pageCount()}</Show>
          </p>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              Next
            </Button>
          </div>
        </div>
      </Show>
    </div>
  )
}
