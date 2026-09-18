import { type Component, Show, splitProps } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import {
  Activity, Bell, BookOpen, Brain, Database, FlaskConical, GitBranch, Globe, HeartPulse, History, Inbox, Link,
  ListChecks, Mail, MapPin, Megaphone, Palette, Play, RefreshCw, Server, Settings, ShieldCheck, Target,
  TrendingUp, TriangleAlert, Users, Workflow, Zap, type LucideProps,
} from 'lucide-solid'
import { cn } from '../lib/cn'

// Small Lucide icons that sit next to section titles in the tenant
// overview. Each maps to a semantic area of the page so the eye can scan
// the panels without reading every eyebrow. Neutral colour by default —
// pass `class` to override for a specific severity (e.g. text-destructive
// next to a danger-zone heading).

export type IconName =
  | 'heartbeat'
  | 'shield'
  | 'globe'
  | 'palette'
  | 'play'
  | 'server'
  | 'activity'
  | 'git-branch'
  | 'history'
  | 'users'
  | 'alert-triangle'
  | 'refresh-cw'
  | 'database'
  | 'map-pin'
  | 'bell'
  | 'link'
  | 'book-open'
  | 'brain'
  | 'megaphone'
  | 'settings'
  | 'zap'
  | 'workflow'
  | 'mail'
  | 'inbox'
  | 'target'
  | 'trending-up'
  | 'list-checks'
  | 'flask-conical'

const ICONS: Record<IconName, Component<LucideProps>> = {
  heartbeat: HeartPulse,
  shield: ShieldCheck,
  globe: Globe,
  palette: Palette,
  play: Play,
  server: Server,
  activity: Activity,
  'git-branch': GitBranch,
  history: History,
  users: Users,
  'alert-triangle': TriangleAlert,
  'refresh-cw': RefreshCw,
  database: Database,
  'map-pin': MapPin,
  bell: Bell,
  link: Link,
  'book-open': BookOpen,
  brain: Brain,
  megaphone: Megaphone,
  settings: Settings,
  zap: Zap,
  workflow: Workflow,
  mail: Mail,
  inbox: Inbox,
  target: Target,
  'trending-up': TrendingUp,
  'list-checks': ListChecks,
  'flask-conical': FlaskConical,
}

export function SectionIcon(props: { name: IconName; class?: string }) {
  const [local] = splitProps(props, ['name', 'class'])
  // `pointer-events-none`: the icon is decoration (aria-hidden), so it should
  // never be the :hover target. Any rule keyed on a hovered svg — injected by
  // a dark-mode extension or a future stylesheet — would otherwise be able to
  // restyle or hide it while the pointer is over the heading.
  return (
    <Show when={ICONS[local.name]} fallback={null}>
      <span class={cn('inline-flex items-center text-muted-foreground flex-shrink-0 mr-1.5 pointer-events-none', local.class)} aria-hidden="true">
        <Dynamic component={ICONS[local.name]} size={18} aria-hidden="true" />
      </span>
    </Show>
  )
}
