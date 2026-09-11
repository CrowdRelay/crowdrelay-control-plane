import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Table — dense, operator-console table primitives. Right-align numerics
 * with `tabular-nums` on the TableCell. Keep row height tight.
 *
 * Matches the former `.data-table` CSS: tight px-2 padding, text
 * truncation in cells, sticky headers, edge-aligned first/last columns.
 */

export const Table: Component<
  JSX.HTMLAttributes<HTMLTableElement> & { class?: string; maxHeight?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'maxHeight'])
  // A sticky header resolves against its nearest scrolling ancestor. This
  // wrapper used to be `overflow-auto` with no height cap, which makes it that
  // ancestor without ever scrolling — so `TableHead`'s `sticky top-0` had
  // nothing to stick to, and callers that wanted a scrolling table wrapped
  // this in a second scroller of their own. Pass `maxHeight` and the cap lands
  // here, where the header can use it; leave it off and the table does not
  // create a scroll container at all.
  //
  // `overflow-x-auto` without `maxHeight` still creates a vertical scroll
  // container: per CSS spec, `overflow-x: auto` forces `overflow-y: visible`
  // to compute to `auto`, so a tall table scrolls inside the page's own scroll
  // container — two scrollbars. `overflow-x-clip` clips horizontal overflow
  // without creating a scroll container, so the page remains the only scroller.
  return (
    <div
      class={cn('w-full', local.maxHeight ? 'overflow-auto' : 'overflow-x-clip')}
      style={local.maxHeight ? { 'max-height': local.maxHeight } : undefined}
    >
      <table class={cn('w-full text-sm border-collapse', local.class)} {...rest} />
    </div>
  )
}

export const TableHeader: Component<JSX.HTMLAttributes<HTMLTableSectionElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <thead class={cn('[&_tr]:border-b [&_tr]:border-border', local.class)} {...rest} />
}

export const TableBody: Component<JSX.HTMLAttributes<HTMLTableSectionElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <tbody class={cn('[&_tr:last-child]:border-0', local.class)} {...rest} />
}

const ROW_BASE = 'border-b border-border-subtle transition-colors hover:bg-surface-1'

export const TableRow: Component<JSX.HTMLAttributes<HTMLTableRowElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  // `cn` runs `twMerge`, which parses every class string it is given. A table
  // calls this once per row and once per cell, so the common case — no caller
  // class to merge — skips the parse and hands over the constant.
  return <tr class={local.class ? cn(ROW_BASE, local.class) : ROW_BASE} {...rest} />
}

export const TableHead: Component<JSX.ThHTMLAttributes<HTMLTableCellElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <th
      class={cn(
        'text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border py-1 px-2 first:pl-3 last:pr-3 sticky top-0 z-[1] bg-surface-2',
        local.class,
      )}
      {...rest}
    />
  )
}

const CELL_BASE =
  'py-2.5 px-2 first:pl-3 last:pr-3 text-foreground overflow-hidden text-ellipsis whitespace-nowrap align-middle'

export const TableCell: Component<JSX.TdHTMLAttributes<HTMLTableCellElement> & { class?: string; numeric?: boolean }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'numeric'])
  return (
    <td
      class={
        local.class || local.numeric
          ? cn(CELL_BASE, local.numeric && 'text-right tabular-nums', local.class)
          : CELL_BASE
      }
      {...rest}
    />
  )
}
