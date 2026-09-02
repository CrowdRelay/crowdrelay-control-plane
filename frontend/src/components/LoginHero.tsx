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
    // Cropped to the drawing's actual bounds. The old box carried 170 units
    // of empty margin on the right and cut 15 units off the bottom, so every
    // rendered size was ~14% smaller than it needed to be and the lowest
    // strokes only survived because the SVG paints outside its box.
    viewBox="10 35 1030 333"
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
      d="M 930 170 C 930 40, 390 40, 390 170"
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
      <g transform="translate(36 207)" class="flow-source-icons">
        {/* Reddit */}
        <svg x="0" y="0" width="36" height="36" viewBox="0 0 24 24" fill="#FF4500" aria-hidden="true">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z"/>
        </svg>
        {/* Facebook */}
        <svg x="44" y="0" width="36" height="36" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
        {/* Spotify */}
        <svg x="88" y="0" width="36" height="36" viewBox="0 0 24 24" fill="#1DB954" aria-hidden="true">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
        {/* Bandsintown */}
        <svg x="0" y="44" width="36" height="36" viewBox="0 0 24 24" fill="#E61931" aria-hidden="true">
          <path d="M6.399 12.8v4.8H19.2v1.6H4.799V0H0v24h24V12.8H6.399Zm4.801-8H6.399v6.4H11.2V4.8Zm6.4 0h-4.8v6.4h4.8V4.8ZM24 0h-4.8v11.2H24V0Z"/>
        </svg>
        {/* TikTok */}
        <svg x="44" y="44" width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#25F4EE" transform="translate(-0.8 0)"/>
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#FE2C55" transform="translate(0.8 0)"/>
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#010101"/>
        </svg>
        {/* YouTube */}
        <svg x="88" y="44" width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000"/>
          <path d="M9.546 15.568V8.432L15.818 12l-6.272 3.568z" fill="#fff"/>
        </svg>
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
      <g transform="translate(620 235)" class="flow-worker-icon" fill="none" stroke="#c4b5fd" stroke-width="2" stroke-linejoin="round">
        <rect x="4" y="4" width="72" height="20" rx="4" opacity="0.7" />
        <rect x="4" y="30" width="72" height="20" rx="4" opacity="0.85" />
        <rect x="4" y="56" width="72" height="20" rx="4" />
      </g>
    </g>

    {/* ── Outcomes node (far right) — 200x160 ── */}
    <g class="flow-node flow-node-outcome">
      <rect x="830" y="170" width="200" height="160" rx="18" />
      <text x="930" y="198" text-anchor="middle" class="flow-node-title">Outcomes</text>
      <text x="930" y="220" text-anchor="middle" class="flow-node-sub">fans · growth</text>
      <g transform="translate(890 240)" class="flow-outcome-icon" fill="none" stroke="#c4b5fd" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 40L24 24L34 34L52 16" />
        <path d="M40 16h12v12" />
      </g>
    </g>
  </svg>
  )
}

// One sentence each. Four cards of five-line prose sit in a row nobody reads;
// the detail that matters is already in the lead and the brain callout.
const features = [
  {
    title: 'Deterministic brain',
    body: 'A Rust autopilot owns the strategy and never follows an LLM blindly.',
    icon: (
      <>
        <path d="M9.5 3A2.5 2.5 0 0 0 7 5.5v.3a3 3 0 0 0-2 2.8v.2a3 3 0 0 0-1 5.2v.2a3 3 0 0 0 2 2.8v.3a2.5 2.5 0 0 0 4.5 1.5V5.5A2.5 2.5 0 0 0 9.5 3z" />
        <path d="M14.5 3A2.5 2.5 0 0 1 17 5.5v.3a3 3 0 0 1 2 2.8v.2a3 3 0 0 1 1 5.2v.2a3 3 0 0 1-2 2.8v.3a2.5 2.5 0 0 1-4.5 1.5V5.5A2.5 2.5 0 0 1 14.5 3z" />
        <path d="M9.5 8a1.5 1.5 0 0 0-1.5 1.5" />
        <path d="M8 12a1.5 1.5 0 0 0 1.5 1.5" />
        <path d="M14.5 8a1.5 1.5 0 0 1 1.5 1.5" />
        <path d="M16 12a1.5 1.5 0 0 1-1.5 1.5" />
      </>
    ),
  },
  {
    title: 'Aggregate from everywhere',
    body: 'Reddit, Meta, Spotify, Bandsintown, press and live shows land in one double opt-in fanbase.',
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
    body: 'Workers draft press pitches and posts from real data in your own Postgres.',
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
    body: 'Every press hit, reply and ticket sale feeds back, so the next cycle is sharper.',
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

// Stated as what the artist gets, not as vendor capability. "10+ LLM
// providers" is our shopping list; nobody buys a shopping list.
const stats = [
  { value: '10+', label: 'Fan sources, one fanbase' },
  { value: 'Double opt-in', label: 'No spam, no bought lists' },
  { value: 'Every cycle', label: 'Learns from real outcomes' },
  { value: 'EU / US', label: 'Fan data stays in region' },
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

    {/* Claim first, proof second. The diagram used to open the page, so the
        first thing a visitor met was an architecture graph of a product they
        could not yet name. */}
    <div class="hero-content" style={{ position: 'relative', 'z-index': '1' }}>
      <h2>Grow real fans. Autonomously.</h2>
      <p class="hero-lead">
        CrowdRelay aggregates fans from Reddit, Meta, Spotify, Bandsintown, and the live web —
        a deterministic Rust brain decides the strategy, LLM workers draft the content,
        and the autopilot learns from every outcome. Each cycle gets smarter. No spam,
        no fake engagement, just real growth that converts.
      </p>
    </div>

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
        <li><a class="hero-cta" href="mailto:hello@crowdrelay.music">Get in touch <span aria-hidden="true">→</span></a></li>
        <li><a href="mailto:hello@crowdrelay.music">hello@crowdrelay.music</a></li>
        <li><a href="https://virya.music" target="_blank" rel="noreferrer noopener">virya.music</a></li>
        <li><a href="https://www.linkedin.com/in/wojciech-bator/" target="_blank" rel="noreferrer noopener">linkedin.com/in/wojciech-bator</a></li>
      </ul>
    </div>

    <small class="hero-foot" style={{ position: 'relative', 'z-index': '1' }}>© 2026 CrowdRelay. All rights reserved.</small>
  </section>
)
