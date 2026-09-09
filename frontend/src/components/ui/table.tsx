import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Table — dense, operator-console table primitives. Right-align numerics
 * with `tabular-nums` on the TableCell. Keep row height tight.
 */

export const Table: Component<JSX.HTMLAttributes<HTMLTableElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div class="w-full overflow-auto">
      <table class={cn('w-full caption-bottom text-sm', local.class)} {...rest} />
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

export const TableRow: Component<JSX.HTMLAttributes<HTMLTableRowElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <tr
      class={cn('border-b border-border transition-colors hover:bg-surface-3', local.class)}
      {...rest}
    />
  )
}

export const TableHead: Component<JSX.ThHTMLAttributes<HTMLTableCellElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <th
      class={cn(
        'h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground [&:has([role=checkbox])]:pr-0',
        local.class,
      )}
      {...rest}
    />
  )
}

export const TableCell: Component<JSX.TdHTMLAttributes<HTMLTableCellElement> & { class?: string; numeric?: boolean }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'numeric'])
  return (
    <td
      class={cn(
        'px-3 py-2 align-middle text-foreground',
        local.numeric && 'text-right tabular-nums',
        local.class,
      )}
      {...rest}
    />
  )
}
