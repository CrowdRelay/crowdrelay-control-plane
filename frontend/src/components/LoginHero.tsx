import type { Component } from 'solid-js'

const BrandMark: Component<{ size: number }> = (props) => (
  <span class="brand-logo" style={{ width: `${props.size}px`, height: `${props.size}px` }}>
    <img src="/crowdrelay-brand-mark.png" alt="" width={props.size} height={props.size} />
  </span>
)

// Animated flow diagram — signals → context → decision → action → delivery
// with a recovery loop. Nodes pulse on a staggered timer.
// Icons use official Lucide (MIT) path data for a clean, professional look.
const FlowDiagram: Component = () => (
  <svg
    class="flow-diagram"
    viewBox="0 0 620 300"
    role="img"
    aria-label="Signals flow into the brain (deterministic autopilot) which dispatches workers for action and delivery, with a recovery loop"
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

    {/* Flow nodes — Lucide icons scaled to fit 56x56 boxes */}
    {/* Signals: radio-tower */}
    <g class="flow-node">
      <rect x="32" y="52" width="56" height="56" rx="15" />
      <g transform="translate(48 68)" class="flow-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4.9 16.1C6.8 14.2 9 13 12 13s5.2 1.2 7.1 3.1" />
        <path d="M7.8 13.2C8.8 12.2 10.3 11 12 11s3.2 1.2 4.2 2.2" />
        <path d="M2 8.82a15 15 0 0 1 20 0" />
        <path d="M5 12.1a10 10 0 0 1 14 0" />
        <line x1="12" x2="12" y1="20" y2="13" />
      </g>
    </g>
    {/* Context: database */}
    <g class="flow-node">
      <rect x="147" y="52" width="56" height="56" rx="15" />
      <g transform="translate(163 68)" class="flow-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5V19A9 3 0 0 0 21 19V5" />
        <path d="M3 12A9 3 0 0 0 21 12" />
      </g>
    </g>
    {/* Decision: brain (deterministic Rust autopilot) — pulses like a heartbeat */}
    <g class="flow-node flow-node-active">
      <rect x="272" y="42" width="76" height="76" rx="20" />
      <g transform="translate(286 56)" class="flow-brain">
        <path
          d="M24 12c0-2.2-1.5-4-3.5-4.3.3-1.8-.8-3.7-2.7-4.2-1.6-.4-3.2.3-4 1.6-.6-.7-1.5-1.1-2.5-1.1-1.8 0-3.3 1.3-3.6 3C6.3 7.3 4.8 8.7 4.5 10.6 2.7 11 1.5 12.7 1.8 14.5c.2 1.5 1.4 2.7 2.9 2.9.1 2.2 1.9 4 4.1 4 .8 0 1.5-.2 2.1-.6.5 1.5 1.9 2.6 3.6 2.6 1.4 0 2.6-.8 3.3-2 .5.3 1.1.5 1.7.5 1.7 0 3.1-1.2 3.5-2.8 1.9-.2 3.3-1.8 3.3-3.7 0-1.8-1.3-3.4-3-3.7z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <path d="M12 8.5v8M8 10c1 0 1.5.8 1.5 1.5M16 10c-1 0-1.5.8-1.5 1.5M7.5 14c.8 0 1.5.6 1.5 1.5M16.5 14c-.8 0-1.5.6-1.5 1.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-linecap="round"
          opacity="0.5"
        />
      </g>
    </g>
    {/* Action: zap */}
    <g class="flow-node">
      <rect x="417" y="52" width="56" height="56" rx="15" />
      <g transform="translate(433 68)" class="flow-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
      </g>
    </g>
    {/* Delivery: circle-check */}
    <g class="flow-node">
      <rect x="532" y="52" width="56" height="56" rx="15" />
      <g transform="translate(548 68)" class="flow-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </g>
    </g>

    {/* Recovery loop */}
    <g fill="none" stroke="#6d5bb8" stroke-width="1.5" stroke-dasharray="6 6" class="flow-recovery">
      <path d="M560 152v66H372" />
      <path d="M248 218H175v-62" marker-end="url(#cr-arrow)" />
    </g>
    <g class="flow-pill">
      <rect x="262" y="202" width="96" height="32" rx="10" />
      <text x="310" y="223">Outcomes</text>
    </g>

    <g class="flow-label">
      <text x="60" y="136">Signals</text>
      <text x="175" y="136">Context</text>
      <text x="310" y="146">Brain</text>
      <text x="448" y="136">Action</text>
      <text x="560" y="136">Delivery</text>
    </g>
  </svg>
)

const features = [
  {
    title: 'Deterministic brain',
    body: 'A Rust autopilot owns the strategy. It decides what intelligence to gather, applies policy rules, and dispatches workers — never following an LLM blindly.',
    icon: (
      <>
        <path d="M24 12c0-2.2-1.5-4-3.5-4.3.3-1.8-.8-3.7-2.7-4.2-1.6-.4-3.2.3-4 1.6-.6-.7-1.5-1.1-2.5-1.1-1.8 0-3.3 1.3-3.6 3C6.3 7.3 4.8 8.7 4.5 10.6 2.7 11 1.5 12.7 1.8 14.5c.2 1.5 1.4 2.7 2.9 2.9.1 2.2 1.9 4 4.1 4 .8 0 1.5-.2 2.1-.6.5 1.5 1.9 2.6 3.6 2.6 1.4 0 2.6-.8 3.3-2 .5.3 1.1.5 1.7.5 1.7 0 3.1-1.2 3.5-2.8 1.9-.2 3.3-1.8 3.3-3.7 0-1.8-1.3-3.4-3-3.7z" />
      </>
    ),
  },
  {
    title: 'Aggregate from everywhere',
    body: 'Fans flow in from Reddit, Meta, Spotify, Bandsintown, press, live shows — into one fanbase with double opt-in. Active fans are never downgraded, opt-outs never resurrected.',
    icon: (
      <>
        <path d="M4.9 16.1C6.8 14.2 9 13 12 13s5.2 1.2 7.1 3.1" />
        <path d="M2 8.82a15 15 0 0 1 20 0" />
        <path d="M5 12.1a10 10 0 0 1 14 0" />
        <line x1="12" x2="12" y1="20" y2="13" />
      </>
    ),
  },
  {
    title: 'LLM workers, your data',
    body: 'Free or paid LLMs draft press pitches, social posts, campaign analysis — seeded with real data from your Postgres. Workers feed intelligence back to the brain.',
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
    title: 'Learns and converts',
    body: 'Every outcome — press hit, social reply, ticket sale — feeds back into the brain. The autopilot learns what works and gets smarter each cycle. Convert with tickets, merch, and attendance.',
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
  { value: '10+', label: 'LLM providers' },
  { value: '6+', label: 'Fan sources' },
  { value: 'Autopilot', label: 'Learns from outcomes' },
  { value: 'EU / US', label: 'Multi-region' },
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
        <span>Fan growth engine for autonomous artists</span>
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
      <h2>Grow real fans. Autonomously.</h2>
      <p class="hero-lead">
        CrowdRelay aggregates fans from Reddit, Meta, Spotify, Bandsintown, and the live web —
        a deterministic Rust brain decides the strategy, LLM workers draft the content,
        and the autopilot learns from every outcome. Each cycle gets smarter. No spam,
        no fake engagement, just real growth that converts.
      </p>

      {/* Brain callout — the heart and brain of the system */}
      <div class="hero-brain-callout">
        <div class="hero-brain-icon">
          <svg viewBox="0 0 26 26" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">
            <path d="M24 12c0-2.2-1.5-4-3.5-4.3.3-1.8-.8-3.7-2.7-4.2-1.6-.4-3.2.3-4 1.6-.6-.7-1.5-1.1-2.5-1.1-1.8 0-3.3 1.3-3.6 3C6.3 7.3 4.8 8.7 4.5 10.6 2.7 11 1.5 12.7 1.8 14.5c.2 1.5 1.4 2.7 2.9 2.9.1 2.2 1.9 4 4.1 4 .8 0 1.5-.2 2.1-.6.5 1.5 1.9 2.6 3.6 2.6 1.4 0 2.6-.8 3.3-2 .5.3 1.1.5 1.7.5 1.7 0 3.1-1.2 3.5-2.8 1.9-.2 3.3-1.8 3.3-3.7 0-1.8-1.3-3.4-3-3.7z" />
          </svg>
        </div>
        <div class="hero-brain-copy">
          <strong>The brain is the product.</strong>
          <p>A deterministic Rust autopilot — obsessive, genuine, effective. It never follows an LLM blindly. It aggregates intelligence, applies policy rules, decides what to do, and dispatches workers. Every outcome feeds back. It learns what works and gets sharper every cycle.</p>
        </div>
      </div>

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
