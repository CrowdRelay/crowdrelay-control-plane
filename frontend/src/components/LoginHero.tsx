import type { Component } from 'solid-js'

const BrandMark: Component<{ size: number }> = (props) => (
  <span class="brand-logo" style={{ width: `${props.size}px`, height: `${props.size}px` }}>
    <img src="/crowdrelay-brand-mark.png" alt="" width={props.size} height={props.size} />
  </span>
)

// Animated flow diagram — signals → context → decision → action → delivery
// with a recovery loop. Nodes pulse on a staggered timer.
const FlowDiagram: Component = () => (
  <svg
    class="flow-diagram"
    viewBox="0 0 620 300"
    role="img"
    aria-label="Signals, context, decision, action and delivery, with a recovery loop back into context"
  >
    <defs>
      <marker id="cr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#8b5cf6" />
      </marker>
      <linearGradient id="cr-flow-line" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#9b87f5" stop-opacity="0.3" />
        <stop offset="50%" stop-color="#9b87f5" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#6fd8ef" stop-opacity="0.3" />
      </linearGradient>
    </defs>

    {/* Ambient pulse rings around the decision node */}
    <g fill="none" stroke="#9b87f5" opacity=".22">
      <circle cx="310" cy="80" r="66" class="flow-ring flow-ring-1" />
      <circle cx="310" cy="80" r="92" class="flow-ring flow-ring-2" opacity=".6" />
      <circle cx="310" cy="80" r="118" class="flow-ring flow-ring-3" opacity=".3" />
    </g>

    {/* Connection lines with gradient */}
    <g stroke="url(#cr-flow-line)" stroke-width="1.5" fill="none">
      <line x1="88" y1="80" x2="147" y2="80" />
      <line x1="203" y1="80" x2="272" y2="80" />
      <line x1="348" y1="80" x2="417" y2="80" />
      <line x1="473" y1="80" x2="532" y2="80" />
    </g>

    {/* Flow nodes */}
    <g class="flow-node">
      <rect x="32" y="52" width="56" height="56" rx="15" />
      <g transform="translate(60 80)" class="flow-icon" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle r="2.6" fill="currentColor" stroke="none" />
        <path d="M-6.5 -6.5a9.2 9.2 0 0 0 0 13M6.5 -6.5a9.2 9.2 0 0 1 0 13" />
        <path d="M-11 -11a15.6 15.6 0 0 0 0 22M11 -11a15.6 15.6 0 0 1 0 22" opacity=".55" />
      </g>
    </g>
    <g class="flow-node">
      <rect x="147" y="52" width="56" height="56" rx="15" />
      <g transform="translate(175 80)" class="flow-icon" fill="currentColor" stroke="none">
        <circle cx="-8" cy="-8" r="2" /><circle cx="0" cy="-8" r="2" /><circle cx="8" cy="-8" r="2" />
        <circle cx="-8" cy="0" r="2" /><circle cx="0" cy="0" r="2" /><circle cx="8" cy="0" r="2" />
        <circle cx="-8" cy="8" r="2" /><circle cx="0" cy="8" r="2" /><circle cx="8" cy="8" r="2" />
      </g>
    </g>
    <g class="flow-node flow-node-active">
      <rect x="272" y="42" width="76" height="76" rx="20" />
      <image href="/crowdrelay-brand-mark.png" x="264" y="34" width="92" height="92" clip-path="inset(8px round 22px)" />
    </g>
    <g class="flow-node">
      <rect x="417" y="52" width="56" height="56" rx="15" />
      <path class="flow-icon" d="M448 66l-9 15h8l-2 13 10-16h-8z" fill="currentColor" stroke="none" />
    </g>
    <g class="flow-node">
      <rect x="532" y="52" width="56" height="56" rx="15" />
      <g transform="translate(560 80)" class="flow-icon" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle r="12" />
        <path d="M-5 0l3.5 4L6 -4.5" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    </g>

    {/* Recovery loop */}
    <g fill="none" stroke="#6d5bb8" stroke-width="1.5" stroke-dasharray="6 6" class="flow-recovery">
      <path d="M560 152v66H372" />
      <path d="M248 218H175v-62" marker-end="url(#cr-arrow)" />
    </g>
    <g class="flow-pill">
      <rect x="262" y="202" width="96" height="32" rx="10" />
      <text x="310" y="223">Recovery</text>
    </g>

    <g class="flow-label">
      <text x="60" y="136">Signals</text>
      <text x="175" y="136">Context</text>
      <text x="310" y="146">Decision</text>
      <text x="448" y="136">Action</text>
      <text x="560" y="136">Delivery</text>
    </g>
  </svg>
)

const features = [
  {
    title: 'Autonomous decisions',
    body: 'Context-aware decisions driven by your policies and constraints.',
    icon: (
      <>
        <path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z" />
        <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
      </>
    ),
  },
  {
    title: 'Execute with confidence',
    body: 'Run actions across integrations with built-in retries, tracking and failure recovery.',
    icon: <path d="M13 2L4 14h6l-1 8 9-12h-6z" stroke-linejoin="round" />,
  },
  {
    title: 'AI agents with your data',
    body: 'Delegate creative work to free or paid LLMs — press pitches, social posts, analysis — seeded with real tenant data from your database.',
    icon: (
      <>
        <ellipse cx="12" cy="8" rx="3" ry="2.5" />
        <ellipse cx="12" cy="13" rx="2.5" ry="2" />
        <ellipse cx="12" cy="17.5" rx="3.5" ry="2.5" />
        <path d="M9 7L5 4M15 7l4-3" />
        <path d="M9 13L4 11M15 13l5-2" />
        <path d="M12 5.5v-2" />
        <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    title: 'Observe everything',
    body: 'Full visibility into decisions, actions and outcomes in real time.',
    icon: (
      <>
        <path d="M3 17l6-6 4 4 8-8" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M15 7h6v6" stroke-linecap="round" stroke-linejoin="round" />
      </>
    ),
  },
]

const FeatureIcon: Component<{ children: unknown }> = (props) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
    {props.children as never}
  </svg>
)

const stats = [
  { value: '10+', label: 'AI providers' },
  { value: '22', label: 'Autopilot contexts' },
  { value: 'Real-time', label: 'Telemetry' },
  { value: 'Multi-region', label: 'EU / US' },
]

export const LoginHero: Component = () => (
  <section class="login-hero">
    {/* Animated background — floating gradient orbs + aurora sweep */}
    <div class="hero-orbs" aria-hidden="true">
      <div class="hero-orb hero-orb-1" />
      <div class="hero-orb hero-orb-2" />
      <div class="hero-orb hero-orb-3" />
    </div>
    <div class="hero-aurora" aria-hidden="true" />

    <header class="hero-brand" style={{ position: 'relative', 'z-index': '1' }}>
      <BrandMark size={76} />
      <div>
        <strong>CrowdRelay</strong>
        <span>Decision engine for autonomous systems</span>
      </div>
    </header>

    <div class="hero-visual" style={{ position: 'relative', 'z-index': '1' }}>
      <FlowDiagram />
      <div class="hero-stats">
        {stats.map(s => (
          <div class="hero-stat">
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>

    <div class="hero-content" style={{ position: 'relative', 'z-index': '1' }}>
      <h2>Turn signals into real-world actions.</h2>
      <p class="hero-lead">
        CrowdRelay evaluates signals, makes policy-driven decisions, and executes actions across your tools —
        with AI agents that draft press pitches, social posts, and campaign analysis using free or paid LLMs,
        seeded with real data from your database.
      </p>

      <ul class="hero-features">
        {features.map(feature => (
          <li>
            <FeatureIcon>{feature.icon}</FeatureIcon>
            <strong>{feature.title}</strong>
            <span>{feature.body}</span>
          </li>
        ))}
      </ul>
    </div>

    <div class="hero-contact" style={{ position: 'relative', 'z-index': '1' }}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path d="M4 5h16v11H9l-5 4z" stroke-linejoin="round" />
        <path d="M8 10h8M8 13h5" stroke-linecap="round" />
      </svg>
      <div class="hero-contact-copy">
        <strong>Let's build something smart together</strong>
        <span>CrowdRelay is in active development and we're always open to new partnerships, integrations and use cases.</span>
      </div>
      <a class="hero-cta" href="mailto:wojciech.jan.bator@proton.me">Get in touch <span aria-hidden="true">→</span></a>
      <ul class="hero-links">
        <li><a href="mailto:wojciech.jan.bator@proton.me">wojciech.jan.bator@proton.me</a></li>
        <li><a href="https://virya.music" target="_blank" rel="noreferrer noopener">virya.music</a></li>
        <li><a href="https://www.linkedin.com/in/wojciech-bator/" target="_blank" rel="noreferrer noopener">linkedin.com/in/wojciech-bator</a></li>
      </ul>
    </div>

    <small class="hero-foot" style={{ position: 'relative', 'z-index': '1' }}>© 2026 CrowdRelay. All rights reserved.</small>
  </section>
)
