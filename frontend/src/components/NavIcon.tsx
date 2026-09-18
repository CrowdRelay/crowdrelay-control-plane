import type { Component } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import {
  Activity, Bell, Brain, FileText, LayoutDashboard, LayoutGrid, MapPin, Plug, RadioTower,
  Settings, SlidersHorizontal, Ticket, TriangleAlert, Users, Waypoints, Zap, type LucideProps,
} from 'lucide-solid'

// Sidebar / command palette nav icons, keyed by name — all Lucide.
const ICONS: Record<string, Component<LucideProps>> = {
  overview: LayoutDashboard,
  operations: Activity,
  intelligence: Brain,
  attention: TriangleAlert,
  portfolio: LayoutGrid,
  notifiers: Bell,
  area: MapPin,
  shows: Ticket,
  'fan-intel': Users,
  content: FileText,
  integrations: Plug,
  automation: Zap,
  flow: Waypoints,
  beacons: RadioTower,
  sliders: SlidersHorizontal,
  settings: Settings,
}

export function NavIcon(props: { name: string }) {
  return <Dynamic component={ICONS[props.name] ?? LayoutDashboard} size={18} stroke-width={2.25} class="nav-icon !size-[18px] flex-shrink-0 opacity-80" aria-hidden="true" />
}
