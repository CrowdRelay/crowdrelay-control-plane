/// A lighthouse: the beacon metaphor, drawn rather than described.
///
/// `currentColor` throughout so it inherits the tab's active and idle states
/// instead of needing its own palette.
export function LighthouseIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {/* Tower */}
      <path d="M9.5 21h5l-.9-10h-3.2z" />
      {/* Lamp room */}
      <path d="M9.9 11h4.2l-.5-3h-3.2z" />
      {/* Light thrown both ways — the whole point of a beacon */}
      <path d="M8 6.5 5 5M16 6.5 19 5M8 9 5 9.5M16 9l3 .5" />
      {/* Base */}
      <path d="M7.5 21h9" />
    </svg>
  )
}
