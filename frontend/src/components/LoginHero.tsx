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
    <text x="660" y="58" text-anchor="middle" class="flow-loop-label">Learning loop</text>

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
      {/* 3 rows × 4 columns = 12 real fan sources. Icons are 30px on 41px
          column / 37px row spacing, centred in the 200×160 node below the
          title. Grid is 153×104; translate (44,216) centres it. */}
      <g transform="translate(44 216)" class="flow-source-icons">
        {/* Row 0 — Reddit, Facebook, Spotify, Bandsintown */}
        <svg x="0" y="0" width="30" height="30" viewBox="0 0 24 24" fill="#FF4500" aria-hidden="true">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z"/>
        </svg>
        <svg x="41" y="0" width="30" height="30" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
        <svg x="82" y="0" width="30" height="30" viewBox="0 0 24 24" fill="#1DB954" aria-hidden="true">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
        <svg x="123" y="0" width="30" height="30" viewBox="0 0 24 24" fill="#E61931" aria-hidden="true">
          <path d="M6.399 12.8v4.8H19.2v1.6H4.799V0H0v24h24V12.8H6.399Zm4.801-8H6.399v6.4H11.2V4.8Zm6.4 0h-4.8v6.4h4.8V4.8ZM24 0h-4.8v11.2H24V0Z"/>
        </svg>
        {/* Row 1 — TikTok, YouTube, Instagram, X */}
        <svg x="0" y="37" width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#25F4EE" transform="translate(-0.8 0)"/>
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#FE2C55" transform="translate(0.8 0)"/>
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#010101"/>
        </svg>
        <svg x="41" y="37" width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000"/>
          <path d="M9.546 15.568V8.432L15.818 12l-6.272 3.568z" fill="#fff"/>
        </svg>
        <svg x="82" y="37" width="30" height="30" viewBox="0 0 24 24" fill="#E4405F" aria-hidden="true">
          <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.352.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
        </svg>
        <svg x="123" y="37" width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.91l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        {/* Row 2 — Apple Music, Bandcamp, Discord, SoundCloud */}
        <svg x="0" y="74" width="30" height="30" viewBox="0 0 24 24" fill="#FA243C" aria-hidden="true">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.8 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.15 7.17-.5 1.31-1.16 2.55-2.2 3.49M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
        </svg>
        <svg x="41" y="74" width="30" height="30" viewBox="0 0 24 24" fill="#1DA0C3" aria-hidden="true">
          <path d="M0 18.75l7.4-8.75h16.6l-7.4 8.75z"/>
        </svg>
        <svg x="82" y="74" width="30" height="30" viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true">
          <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.0785.037c-.211.375-.4447.865-.6083 1.25-1.845-.276-3.68-.276-5.487 0-.164-.393-.406-.874-.618-1.25a.077.077 0 00-.0785-.037A19.736 19.736 0 003.767 4.37a.07.07 0 00-.032.028C.533 9.046-.32 13.58.098 18.058a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 00-.041-.106c-.653-.248-1.274-.55-1.872-.892a.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.009c.12.099.246.198.373.292a.077.077 0 01-.006.128 12.3 12.3 0 01-1.873.891.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.031-.055c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 00-.031-.029zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z"/>
        </svg>
        {/* SoundCloud — official simple-icons path (matches ProviderIcon 1:1). */}
        <svg x="123" y="74" width="30" height="30" viewBox="0 0 24 24" fill="#FF5500" aria-hidden="true">
          <path d="M1 17h1.5v-5H1v5zm3 0h1.5v-7H4v7zm3 0h1.5v-9H7v9zm3 0h1.5v-11H10v11zm3 0h1.5v-12H13v12zm3 0h1.5v-12H16v12zm3.5 0c1.38 0 2.5-1.12 2.5-2.5S20.88 12 19.5 12c-.17 0-.34.02-.5.05V8.5c0-2.49-2.01-4.5-4.5-4.5-.34 0-.67.04-1 .1V17h6z"/>
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
    body: 'Reddit, Meta, Spotify, Bandsintown, TikTok, YouTube, Instagram, X, Apple Music, Bandcamp, Discord and SoundCloud — one double opt-in fanbase.',
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
  { value: '12', label: 'Fan sources, one fanbase' },
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
