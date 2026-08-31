import type { Component } from 'solid-js'

// Detailed brain SVG — gyri (folds), central fissure, cerebellum, brainstem.
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
    {/* Brain body — two hemispheres with gyri folds */}
    <g stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
      {/* Left hemisphere outline */}
      <path d="M24 8c-2-1.5-5-2-7-1-2 .8-3.5 2.5-4 4.5-2 .3-3.8 1.5-4.2 3.5-.3 1.8.5 3.5 2 4.5-.8 1.5-.8 3.5.2 5 1 1.5 2.8 2.2 4.5 2 .5 2 2 3.5 4 3.8 1.8.2 3.5-.5 4.5-2" fill="rgba(155,135,245,0.12)" />
      {/* Right hemisphere outline */}
      <path d="M24 8c2-1.5 5-2 7-1 2 .8 3.5 2.5 4 4.5 2 .3 3.8 1.5 4.2 3.5.3 1.8-.5 3.5-2 4.5.8 1.5.8 3.5-.2 5-1 1.5-2.8 2.2-4.5 2-.5 2-2 3.5-4 3.8-1.8.2-3.5-.5-4.5-2" fill="rgba(155,135,245,0.12)" />
      {/* Central fissure (longitudinal) */}
      <path d="M24 8v22" stroke-width="1" opacity="0.5" />
      {/* Left hemisphere gyri — the wrinkly folds */}
      <path d="M14 13c1.5.5 2.5 1.5 3 3M10 17c1.5.3 2.8 1 3.5 2.5M12 22c1.5.3 2.8 1 3.5 2.5M14 27c1.2.5 2.2 1.5 2.8 3M18 31c1 .8 1.8 2 2.2 3.2" stroke-width="1" opacity="0.4" />
      {/* Right hemisphere gyri */}
      <path d="M34 13c-1.5.5-2.5 1.5-3 3M38 17c-1.5.3-2.8 1-3.5 2.5M36 22c-1.5.3-2.8 1-3.5 2.5M34 27c-1.2.5-2.2 1.5-2.8 3M30 31c-1 .8-1.8 2-2.2 3.2" stroke-width="1" opacity="0.4" />
      {/* Cerebellum */}
      <path d="M18 36c2 2 10 2 12 0" stroke-width="1.2" opacity="0.6" />
      {/* Brainstem */}
      <path d="M22 36v4c0 1.5 4 1.5 4 0v-4" stroke-width="1.2" />
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
// with a learning loop back into the brain.
// Clean filled nodes with a subtle glow on the brain.
const FlowDiagram: Component = () => (
  <svg
    class="flow-diagram"
    viewBox="0 0 900 240"
    role="img"
    aria-label="Fan sources flow into the brain (deterministic Rust autopilot), which dispatches LLM workers to produce outcomes. Outcomes feed back into the brain through a learning loop."
  >
    <defs>
      <marker id="cr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#8b5cf6" />
      </marker>
      <marker id="cr-arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#3ddc84" />
      </marker>
      <linearGradient id="cr-flow-line" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#9b87f5" stop-opacity="0.2" />
        <stop offset="50%" stop-color="#9b87f5" stop-opacity="0.7" />
        <stop offset="100%" stop-color="#6fd8ef" stop-opacity="0.2" />
      </linearGradient>
      <radialGradient id="cr-brain-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#9b87f5" stop-opacity="0.35" />
        <stop offset="60%" stop-color="#9b87f5" stop-opacity="0.08" />
        <stop offset="100%" stop-color="#9b87f5" stop-opacity="0" />
      </radialGradient>
    </defs>

    {/* Brain glow — subtle, breathing, not janky */}
    <circle cx="450" cy="80" r="90" fill="url(#cr-brain-glow)" class="flow-brain-glow" />

    {/* Connection lines */}
    <g stroke="url(#cr-flow-line)" stroke-width="2" fill="none">
      <line x1="130" y1="80" x2="210" y2="80" marker-end="url(#cr-arrow)" />
      <line x1="350" y1="80" x2="530" y2="80" marker-end="url(#cr-arrow)" />
      <line x1="670" y1="80" x2="750" y2="80" marker-end="url(#cr-arrow)" />
    </g>

    {/* Learning loop — green dashed arc back to brain */}
    <path
      d="M 810 80 Q 810 180, 450 180 Q 90 180, 90 80"
      fill="none"
      stroke="#3ddc84"
      stroke-width="1.5"
      stroke-dasharray="5 5"
      class="flow-learning"
      marker-end="url(#cr-arrow-green)"
    />
    <text x="450" y="205" text-anchor="middle" class="flow-loop-label">learning loop</text>

    {/* ── Source nodes (left cluster) ── */}
    <g class="flow-node flow-node-source">
      <rect x="20" y="32" width="100" height="96" rx="14" />
      <text x="70" y="52" text-anchor="middle" class="flow-node-title">Sources</text>
      {/* Source icons: reddit, meta, spotify, bandsintown as small dots */}
      <g transform="translate(35 62)" class="flow-source-icons">
        <circle cx="10" cy="10" r="8" fill="#ff4500" opacity="0.8" />
        <text x="10" y="14" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">R</text>
        <circle cx="35" cy="10" r="8" fill="#0866ff" opacity="0.8" />
        <text x="35" y="14" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">f</text>
        <circle cx="60" cy="10" r="8" fill="#1db954" opacity="0.8" />
        <text x="60" y="14" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">S</text>
        <circle cx="10" cy="32" r="8" fill="#e6b04c" opacity="0.8" />
        <text x="10" y="36" text-anchor="middle" font-size="7" fill="#fff" font-weight="700">Bi</text>
        <circle cx="35" cy="32" r="8" fill="#25f4ee" opacity="0.7" />
        <text x="35" y="36" text-anchor="middle" font-size="8" fill="#000" font-weight="700">TT</text>
        <circle cx="60" cy="32" r="8" fill="#7d8491" opacity="0.6" />
        <text x="60" y="36" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">+</text>
      </g>
    </g>

    {/* ── Brain node (center, large, glowing) ── */}
    <g class="flow-node flow-node-brain">
      <rect x="210" y="24" width="140" height="112" rx="18" />
      <text x="280" y="46" text-anchor="middle" class="flow-node-title">Brain</text>
      <text x="280" y="62" text-anchor="middle" class="flow-node-sub">Rust autopilot</text>
      {/* Brain icon — detailed, with gyri folds and brainstem */}
      <g transform="translate(258 68)" class="flow-brain-icon" style={{ color: '#c4b5fd' }}>
        <BrainIcon size={44} />
      </g>
    </g>

    {/* ── Workers node (right of brain) ── */}
    <g class="flow-node flow-node-worker">
      <rect x="530" y="32" width="140" height="96" rx="14" />
      <text x="600" y="52" text-anchor="middle" class="flow-node-title">Workers</text>
      <text x="600" y="68" text-anchor="middle" class="flow-node-sub">LLM agents</text>
      {/* Worker icon — stacked layers */}
      <g transform="translate(584 78)" class="flow-worker-icon" fill="none" stroke="#6fd8ef" stroke-width="1.3" stroke-linejoin="round">
        <rect x="2" y="2" width="28" height="8" rx="2" opacity="0.5" />
        <rect x="2" y="13" width="28" height="8" rx="2" opacity="0.7" />
        <rect x="2" y="24" width="28" height="8" rx="2" />
      </g>
    </g>

    {/* ── Outcomes node (far right) ── */}
    <g class="flow-node flow-node-outcome">
      <rect x="750" y="32" width="120" height="96" rx="14" />
      <text x="810" y="52" text-anchor="middle" class="flow-node-title">Outcomes</text>
      <text x="810" y="68" text-anchor="middle" class="flow-node-sub">fans · growth</text>
      {/* Outcome icon — upward trend */}
      <g transform="translate(796 78)" class="flow-outcome-icon" fill="none" stroke="#3ddc84" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 20l8-8 5 5 8-8" />
        <path d="M21 9v6h-6" />
      </g>
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
