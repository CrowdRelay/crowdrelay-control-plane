import { JSX, Show, splitProps } from 'solid-js'

// Small green Lucide-style icons that sit next to section titles in the
// tenant overview. Each maps to a semantic area of the page so the eye can
// scan the panels without reading every eyebrow.

type IconName =
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

const Svg = (props: { children: JSX.Element }) => (
  <svg
    class="section-icon"
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >{props.children}</svg>
)

const ICONS: Record<IconName, JSX.Element> = {
  // heart-pulse — for the runtime heartbeat panel
  heartbeat: (
    <Svg>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </Svg>
  ),
  // shield-check — for entitlements / products
  shield: (
    <Svg>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  // globe — for regionalization / locale
  globe: (
    <Svg>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </Svg>
  ),
  // palette — for branding
  palette: (
    <Svg>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2" />
    </Svg>
  ),
  // play triangle — for Google Play setup
  play: (
    <Svg>
      <path d="M6 3 18 12 6 21V3Z" />
    </Svg>
  ),
  // server — for the CrowdRelay instance / provisioning
  server: (
    <Svg>
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </Svg>
  ),
  // activity — for operations / health & controls
  activity: (
    <Svg>
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.5.5 0 0 1-.96 0L9.68 3.18a.5.5 0 0 0-.91 0l-2.35 8.36A2 2 0 0 1 4.49 13H2" />
    </Svg>
  ),
  // git-branch — for release convergence
  'git-branch': (
    <Svg>
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Svg>
  ),
  // history / clock — for audit
  history: (
    <Svg>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Svg>
  ),
  // users — for operator accounts
  users: (
    <Svg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
}

export function SectionIcon(props: { name: IconName; class?: string }) {
  const [local] = splitProps(props, ['name', 'class'])
  return (
    <Show when={ICONS[local.name]} fallback={null}>
      <span class={`section-icon-wrap ${local.class ?? ''}`} aria-hidden="true">
        {ICONS[local.name]}
      </span>
    </Show>
  )
}
