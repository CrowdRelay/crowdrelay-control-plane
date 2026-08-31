import type { Component } from 'solid-js'

// Detailed brain SVG — clean symmetric brain with gyri folds.
// Used in both the flow diagram and the brain callout.
const BrainIcon: Component<{ size?: number; class?: string }> = (props) => (
  <svg
    viewBox="0 0 48 48"
    width={props.size ?? 48}
    height={props.size ?? 48}
    class={props.class}
    fill="none"
    aria-hidden="true"
  >
    <g stroke="currentColor" stroke-linejoin="round" stroke-linecap="round">
      {/* Brain body — single closed path, symmetric */}
      <path d="M24 10c-3-2-7-2-9 0-2 1.5-3 4-2.5 6.5-2 1-3 3-2.5 5.5.5 2 2 3.5 4 4-.5 2.5.5 5 2.5 6.5 2 1.5 5 1.5 7.5 0 2.5 1.5 5.5 1.5 7.5 0 2-1.5 3-4 2.5-6.5 2-0.5 3.5-2 4-4 .5-2.5-.5-4.5-2.5-5.5.5-2.5-.5-5-2.5-6.5-2-2-6-2-9 0z" fill="rgba(155,135,245,0.12)" stroke-width="1.5" />
      {/* Central fissure */}
      <path d="M24 10v22" stroke-width="1" opacity="0.4" />
      {/* Left gyri */}
      <path d="M16 16c1.5.5 2.5 1.5 3 3M13 20c1.5.3 2.5 1 3 2.5M15 25c1.2.5 2 1.5 2.5 3M18 30c.8.8 1.5 2 2 3" stroke-width="0.8" opacity="0.35" />
      {/* Right gyri */}
      <path d="M32 16c-1.5.5-2.5 1.5-3 3M35 20c-1.5.3-2.5 1-3 2.5M33 25c-1.2.5-2 1.5-2.5 3M30 30c-.8.8-1.5 2-2 3" stroke-width="0.8" opacity="0.35" />
      {/* Cerebellum */}
      <path d="M19 36c2 1.5 8 1.5 10 0" stroke-width="1" opacity="0.5" />
    </g>
  </svg>
)

const BrandMark: Component<{ size: number }> = (props) => (
  <span class="brand-logo" style={{ width: `${props.size}px`, height: `${props.size}px` }}>
    <img src="/crowdrelay-brand-mark.png" alt="" width={props.size} height={props.size} />
  </span>
)

// Architecture flow — the real system:
// Sources → Brain (deterministic Rust) → Workers (LLM agents) → Outcomes
// with a learning loop arc ABOVE, pointing from outcomes back to brain.
// All four nodes are the same size. Arrows are drawn as explicit ---> shapes.
const FlowDiagram: Component = () => {
  // Arrow: a line + chevron arrowhead, drawn as a single path.
  // startX..endX is the gap between blocks. The arrowhead sits at endX.
  const arrow = (x1: number, x2: number, y: number) => {
    const head = 14 // arrowhead length
    const half = 7  // arrowhead half-width
    return `M${x1} ${y} L${x2 - head} ${y} M${x2 - head} ${y - half} L${x2} ${y} L${x2 - head} ${y + half}`
  }
  return (
  <svg
    class="flow-diagram"
    viewBox="0 0 1200 400"
    role="img"
    aria-label="Fan sources flow into the brain (deterministic Rust autopilot), which dispatches LLM workers to produce outcomes. Outcomes feed back into the brain through a learning loop."
  >
    <defs>
      <marker id="cr-arrow-green" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto">
        <path d="M0 2 L10 6 L0 10 L3 6 z" fill="#3ddc84" />
      </marker>
      <radialGradient id="cr-brain-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#9b87f5" stop-opacity="0.3" />
        <stop offset="60%" stop-color="#9b87f5" stop-opacity="0.06" />
        <stop offset="100%" stop-color="#9b87f5" stop-opacity="0" />
      </radialGradient>
    </defs>

    {/* Learning loop — symmetric arc ABOVE, from outcomes → brain */}
    <path
      d="M 930 190 C 930 50, 390 50, 390 190"
      fill="none"
      stroke="#3ddc84"
      stroke-width="2"
      stroke-dasharray="8 6"
      class="flow-learning"
      marker-end="url(#cr-arrow-green)"
    />
    <text x="660" y="58" text-anchor="middle" class="flow-loop-label">learning loop</text>

    {/* Brain glow — subtle, breathing */}
    <circle cx="390" cy="250" r="110" fill="url(#cr-brain-glow)" class="flow-brain-glow" />

    {/* Connection arrows — explicit line + chevron, looks like ---> */}
    <g stroke="#9b87f5" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.8">
      <path d={arrow(220, 290, 250)} />
      <path d={arrow(490, 560, 250)} />
      <path d={arrow(760, 830, 250)} />
    </g>

    {/* ── Source node (left) — 200x160 ── */}
    <g class="flow-node flow-node-source">
      <rect x="20" y="170" width="200" height="160" rx="18" />
      <text x="120" y="198" text-anchor="middle" class="flow-node-title">Sources</text>
      <g transform="translate(50 215)" class="flow-source-icons">
        <circle cx="18" cy="18" r="16" fill="#ff4500" opacity="0.85" />
        <text x="18" y="24" text-anchor="middle" font-size="18" fill="#fff" font-weight="700">R</text>
        <circle cx="62" cy="18" r="16" fill="#0866ff" opacity="0.85" />
        <text x="62" y="24" text-anchor="middle" font-size="16" fill="#fff" font-weight="700">f</text>
        <circle cx="106" cy="18" r="16" fill="#1db954" opacity="0.85" />
        <text x="106" y="24" text-anchor="middle" font-size="18" fill="#fff" font-weight="700">S</text>
        <circle cx="18" cy="58" r="16" fill="#e6b04c" opacity="0.85" />
        <text x="18" y="63" text-anchor="middle" font-size="12" fill="#fff" font-weight="700">Bi</text>
        <circle cx="62" cy="58" r="16" fill="#25f4ee" opacity="0.75" />
        <text x="62" y="63" text-anchor="middle" font-size="14" fill="#000" font-weight="700">TT</text>
        <circle cx="106" cy="58" r="16" fill="#7d8491" opacity="0.6" />
        <text x="106" y="63" text-anchor="middle" font-size="16" fill="#fff" font-weight="700">+</text>
      </g>
    </g>

    {/* ── Brain node (center-left, glowing) — 200x160 ── */}
    <g class="flow-node flow-node-brain">
      <rect x="290" y="170" width="200" height="160" rx="20" />
      <text x="390" y="198" text-anchor="middle" class="flow-node-title">Brain</text>
      <text x="390" y="220" text-anchor="middle" class="flow-node-sub">Rust autopilot</text>
      <g transform="translate(350 235)" class="flow-brain-icon" style={{ color: '#c4b5fd' }}>
        <BrainIcon size={80} />
      </g>
    </g>

    {/* ── Workers node (center-right) — 200x160 ── */}
    <g class="flow-node flow-node-worker">
      <rect x="560" y="170" width="200" height="160" rx="18" />
      <text x="660" y="198" text-anchor="middle" class="flow-node-title">Workers</text>
      <text x="660" y="220" text-anchor="middle" class="flow-node-sub">LLM agents</text>
      <g transform="translate(620 235)" class="flow-worker-icon" fill="none" stroke="#6fd8ef" stroke-width="2" stroke-linejoin="round">
        <rect x="4" y="4" width="72" height="20" rx="4" opacity="0.5" />
        <rect x="4" y="30" width="72" height="20" rx="4" opacity="0.7" />
        <rect x="4" y="56" width="72" height="20" rx="4" />
      </g>
    </g>

    {/* ── Outcomes node (far right) — 200x160 ── */}
    <g class="flow-node flow-node-outcome">
      <rect x="830" y="170" width="200" height="160" rx="18" />
      <text x="930" y="198" text-anchor="middle" class="flow-node-title">Outcomes</text>
      <text x="930" y="220" text-anchor="middle" class="flow-node-sub">fans · growth</text>
      <g transform="translate(890 240)" class="flow-outcome-icon" fill="none" stroke="#3ddc84" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 40L24 24L34 34L52 16" />
        <path d="M40 16h12v12" />
      </g>
    </g>
  </svg>
  )
}

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
      <BrandMark size={114} />
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
          <BrainIcon size={36} />
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
      <ul class="hero-links hero-links-row">
        <li><a class="hero-cta" href="mailto:wojciech.jan.bator@proton.me">Get in touch <span aria-hidden="true">→</span></a></li>
        <li><a href="mailto:wojciech.jan.bator@proton.me">wojciech.jan.bator@proton.me</a></li>
        <li><a href="https://virya.music" target="_blank" rel="noreferrer noopener">virya.music</a></li>
        <li><a href="https://www.linkedin.com/in/wojciech-bator/" target="_blank" rel="noreferrer noopener">linkedin.com/in/wojciech-bator</a></li>
      </ul>
    </div>

    <small class="hero-foot" style={{ position: 'relative', 'z-index': '1' }}>© 2026 CrowdRelay. All rights reserved.</small>
  </section>
)
