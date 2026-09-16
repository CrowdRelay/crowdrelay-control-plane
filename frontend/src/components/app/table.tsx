import { type Component, type JSX, splitProps } from 'solid-js'
import { Table as StockTable, TableCell as StockTableCell } from '~/components/ui/table'
import { cn } from '~/lib/cn'

export { TableBody, TableCaption, TableFooter, TableHead, TableHeader, TableRow } from '~/components/ui/table'

/**
 * Table over the stock solid-ui table. `maxHeight` caps the scroll container;
 * `numeric` right-aligns a cell with tabular digits.
 */
export const Table: Component<JSX.HTMLAttributes<HTMLTableElement> & { class?: string; maxHeight?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['maxHeight'])
  return (
    <div style={local.maxHeight ? { 'max-height': local.maxHeight, overflow: 'auto' } : undefined}>
      <StockTable {...rest} />
    </div>
  )
}

export const TableCell: Component<JSX.TdHTMLAttributes<HTMLTableCellElement> & { class?: string; numeric?: boolean }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'numeric'])
  return <StockTableCell class={cn(local.numeric && 'text-right tabular-nums', local.class)} {...rest} />
}
