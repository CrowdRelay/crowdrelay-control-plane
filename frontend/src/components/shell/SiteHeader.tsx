import { Show, type JSX } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator,
} from '~/components/ui/breadcrumb'
import { Separator } from '~/components/ui/separator'
import { SidebarTrigger } from '~/components/ui/sidebar'

/**
 * The top bar — sidebar-07's header: sidebar toggle, a divider, and where you
 * are. The breadcrumb names the place, not a second copy of the page heading.
 * `actions` sit on the right.
 */
export function SiteHeader(props: {
  section: { label: string; to?: string; params?: Record<string, string> }
  page: string
  actions?: JSX.Element
}) {
  return (
    <header class="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div class="flex min-w-0 flex-1 items-center gap-2 px-4">
        <SidebarTrigger class="-ml-1" />
        <Separator orientation="vertical" class="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem class="hidden md:block">
              <Show when={props.section.to} fallback={<span>{props.section.label}</span>}>
                {to => (
                  <BreadcrumbLink as={Link} to={to() as any} params={props.section.params as any}>
                    {props.section.label}
                  </BreadcrumbLink>
                )}
              </Show>
            </BreadcrumbItem>
            <BreadcrumbSeparator class="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbLink current>{props.page}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <Show when={props.actions}>
        <div class="flex items-center gap-2 px-4">{props.actions}</div>
      </Show>
    </header>
  )
}
