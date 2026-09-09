import { type Component, type JSX, splitProps } from 'solid-js'
import { Tabs as TabsPrimitive } from '@kobalte/core'
import { cn } from '~/lib/cn'

/**
 * Tabs — Kobalte-based accessible tabs. Replaces the hand-rolled TabBar.
 * Provides keyboard navigation, ARIA roles, and focus management.
 */

export const Tabs = TabsPrimitive.Root

export const TabsList: Component<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <TabsPrimitive.List
      class={cn(
        'inline-flex h-9 items-center justify-center gap-1 rounded-md bg-surface-1 p-1 text-muted-foreground',
        local.class,
      )}
      {...rest}
    />
  )
}

export const TabsTrigger: Component<{ class?: string; value: string; children: JSX.Element; disabled?: boolean }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'value', 'children', 'disabled'])
  return (
    <TabsPrimitive.Trigger
      value={local.value}
      disabled={local.disabled}
      class={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[selected]:bg-surface-3 data-[selected]:text-foreground data-[selected]:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        local.class,
      )}
    >
      {local.children}
    </TabsPrimitive.Trigger>
  )
}

export const TabsContent: Component<{ class?: string; value: string; children: JSX.Element }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'value', 'children'])
  return (
    <TabsPrimitive.Content
      value={local.value}
      class={cn('mt-2 focus-visible:outline-none', local.class)}
    >
      {local.children}
    </TabsPrimitive.Content>
  )
}
