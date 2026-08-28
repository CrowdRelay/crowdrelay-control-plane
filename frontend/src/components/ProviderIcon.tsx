// Provider brand icons — inline SVGs keyed by provider kind.
// No external dependencies, no icon font, no sprite.
//
// Brand logos use their official colours (multi-path SVG) so they're
// instantly recognisable. Generic/abstract icons inherit currentColor.

import type { JSX } from 'solid-js'

type IconProps = { size?: number; class?: string }

// ─── LLM Provider Brand Logos ───────────────────────────────────────────

// OpenCode Zen — a stylised lotus/spark mark in Zen purple.
function ZenIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M12 2c-1.5 3-3 5-3 8 0 1.5 1.2 3 3 3s3-1.5 3-3c0-3-1.5-5-3-8z" fill="#a78bfa"/>
      <path d="M12 13c-2 0-4 1-5 3 1 2 3 3 5 3s4-1 5-3c-1-2-3-3-5-3z" fill="#7c3aed"/>
      <path d="M5 14c-1.5 1-2.5 2.5-2.5 4.5 0 .5.1 1 .3 1.5 1.2-1 2.7-1.5 4.2-1.5-.5-1.5-1-3-2-4.5z" fill="#a78bfa" opacity="0.7"/>
      <path d="M19 14c1.5 1 2.5 2.5 2.5 4.5 0 .5-.1 1-.3 1.5-1.2-1-2.7-1.5-4.2-1.5.5-1.5 1-3 2-4.5z" fill="#a78bfa" opacity="0.7"/>
    </svg>
  )
}

// Google Gemini — the official Gemini sparkle mark with the brand's
// blue-to-purple-to-pink gradient.
function GeminiIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <defs>
        <linearGradient id="gemini-sparkle" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4285F4" />
          <stop offset="33%" stop-color="#9b72cb" />
          <stop offset="66%" stop-color="#d96570" />
          <stop offset="100%" stop-color="#e8713a" />
        </linearGradient>
      </defs>
      <path d="M12 2c.3 4.5 3.2 7.7 7.5 8-4.3.3-7.2 3.5-7.5 8-.3-4.5-3.2-7.7-7.5-8 4.3-.3 7.2-3.5 7.5-8z" fill="url(#gemini-sparkle)"/>
    </svg>
  )
}

// Groq — lightning bolt in Groq orange/red.
function GroqIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="#f55036"/>
    </svg>
  )
}

// OpenAI — the official OpenAI knot mark in black/white.
function OpenAIIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M22.28 9.82a5.99 5.99 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.5-2.9A6.07 6.07 0 0 0 4.99 4.7a6 6 0 0 0-4 2.91 6.05 6.05 0 0 0 .74 7.07 5.99 5.99 0 0 0 .52 4.91 6.05 6.05 0 0 0 6.5 2.9A6 6 0 0 0 13.5 24a6 6 0 0 0 5.73-4.1 6 6 0 0 0 4-2.91 6.05 6.05 0 0 0-.74-7.07v-.1zM13.5 22.4a4.47 4.47 0 0 1-2.87-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.68v-6.75l2.02 1.17a.07.07 0 0 1 .04.06v5.58a4.5 4.5 0 0 1-4.5 4.5zM3.6 18.3a4.5 4.5 0 0 1-.54-3.04l.14.08 4.78 2.77a.78.78 0 0 0 .78 0l5.85-3.37v2.33a.07.07 0 0 1-.03.07L9.8 19.6a4.5 4.5 0 0 1-6.2-1.3zM2.34 8.21a4.5 4.5 0 0 1 2.36-1.99v5.68a.77.77 0 0 0 .39.68l5.85 3.37-2.02 1.17a.08.08 0 0 1-.07 0L4.07 14.36a4.5 4.5 0 0 1-1.73-6.15zm16.13 3.76l-5.85-3.38 2.02-1.16a.08.08 0 0 1 .07 0l4.85 2.79a4.5 4.5 0 0 1-.68 8.13v-5.68a.78.78 0 0 0-.4-.68zm2.03-3.06l-.14-.09-4.78-2.78a.78.78 0 0 0-.78 0L9.95 9.42V7.09a.07.07 0 0 1 .03-.07l4.85-2.79a4.5 4.5 0 0 1 6.67 4.66zM8.84 14.42l-2.03-1.17a.07.07 0 0 1-.04-.06V7.61a4.5 4.5 0 0 1 7.38-3.46l-.14.08-4.78 2.77a.78.78 0 0 0-.39.68v6.74zm1.1-2.37l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z"/>
    </svg>
  )
}

// Anthropic — the Claude/Antropic sunburst mark: radiating rays from a
// central point, matching the official brand burst/asterisk pattern.
function AnthropicIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class={props.class} aria-hidden="true">
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2" />
    </svg>
  )
}

// xAI (Grok) — the official x.ai "X" mark: two bold crossing strokes
// with angled ends, in xAI black.
function XaiIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M5 4h3l4 5.5L16 4h3l-5.5 8L19 20h-3l-4-5.5L8 20H5l5.5-8z"/>
    </svg>
  )
}

// OpenRouter — a router/network node icon in OpenRouter blue.
function OpenRouterIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <circle cx="12" cy="5" r="2" fill="#6366f1"/>
      <circle cx="5" cy="19" r="2" fill="#6366f1"/>
      <circle cx="19" cy="19" r="2" fill="#6366f1"/>
      <path d="M12 7v4M12 11l-5 6M12 11l5 6"/>
    </svg>
  )
}

// ─── Notifier Brand Logos ───────────────────────────────────────────────

// Discord — official Discord logo in Discord blurple.
function DiscordIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#5865F2" class={props.class} aria-hidden="true">
      <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.02.06.03.09.02 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
    </svg>
  )
}

// Webhook — a chain link icon in neutral blue-grey.
function WebhookIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <path d="M9.5 10.5l3-3a3.5 3.5 0 0 1 5 5l-3 3" />
      <path d="M14.5 13.5l-3 3a3.5 3.5 0 0 1-5-5l3-3" />
    </svg>
  )
}

// Email — envelope icon in neutral tone.
function EmailIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-13zm1.5.5v.8l7.5 5 7.5-5V6L12 11 4.5 6z" fill-rule="evenodd"/>
    </svg>
  )
}

// ─── Fanbase Source Brand Logos ─────────────────────────────────────────

// Meta (Facebook/Instagram) — official Meta infinity loop in Meta blue.
// Two interlocking rounded loops forming a continuous infinity-like stroke.
function MetaIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#0866FF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <path d="M5 12C5 8 7.5 6 10 6c2 0 3.2 1.8 4 3.5C14.8 8 16 6 18 6c2.5 0 5 2 5 6s-2.5 6-5 6c-2 0-3.2-1.8-4-3.5C13.2 16 12 18 10 18c-2.5 0-5-2-5-6z"/>
    </svg>
  )
}

// Bandsintown — music note in Bandsintown red circle.
function BandsintownIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#E61931"/>
      <path d="M15.5 8v6.3a2 2 0 1 1-1.6-1.96V10.2l-3.9 1.1v4a2 2 0 1 1-1.6-1.96V9.5L15.5 8z" fill="#fff"/>
    </svg>
  )
}

// Google (Customer Match / Ads) — official 4-colour Google "G".
function GoogleIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
    </svg>
  )
}

// Reddit — simplified Snoo head in Reddit orange-red: round head,
// antenna, two white eyes, and a smile.
function RedditIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#FF4500" class={props.class} aria-hidden="true">
      <circle cx="12" cy="2.5" r="1.5" />
      <path d="M12 4v2.5" stroke="#FF4500" stroke-width="1.5" stroke-linecap="round" fill="none" />
      <ellipse cx="12" cy="13" rx="7.5" ry="6" />
      <circle cx="9" cy="11.5" r="1.8" fill="#fff" />
      <circle cx="15" cy="11.5" r="1.8" fill="#fff" />
      <path d="M8.5 14.5c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  )
}

// Spotify — official Spotify circle with three sound-wave arcs in Spotify green.
function SpotifyIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#1DB954"/>
      <path d="M7.2 10.6c3.1-.9 6.3-.7 9 .9.4.2.6.7.4 1.1-.2.4-.7.6-1.1.4-2.4-1.4-5.2-1.6-7.9-.8-.4.1-.9-.1-1-.6-.2-.4.1-.9.6-1z" fill="#fff"/>
      <path d="M6.8 13.3c2.7-.8 5.5-.5 7.8.8.4.2.6.7.3 1.1-.2.4-.7.5-1.1.3-2-1.1-4.4-1.3-6.7-.6-.4.1-.9-.1-1-.5-.2-.4.1-.9.7-1.1z" fill="#fff"/>
      <path d="M7.4 15.9c2.1-.6 4.2-.4 6 .5.4.2.5.6.3 1-.2.3-.6.5-1 .3-1.5-.8-3.2-.9-4.8-.5-.4.1-.8-.1-.9-.5-.2-.4.1-.8.4-.8z" fill="#fff"/>
    </svg>
  )
}

// TikTok — official TikTok music note with cyan/red offset glow.
// Single path drawn three times with translate transforms for the
// chromatic-aberration effect the brand is known for.
function TikTokIcon(props: IconProps) {
  const s = props.size ?? 20
  const notePath = "M14.5 3h2.3c.3 1.9 1.4 3.6 3.2 4.4v2.4c-1.3-.4-2.5-1.1-3.5-2.1v6c0 3.3-2.7 6-6 6s-6-2.7-6-6 2.7-6 6-6c.5 0 1 .1 1.5.2v2.7c-.5-.2-1-.3-1.5-.3-1.9 0-3.5 1.6-3.5 3.5s1.6 3.5 3.5 3.5 3.5-1.6 3.5-3.5V3z"
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d={notePath} fill="#25F4EE" transform="translate(-0.8 0)" />
      <path d={notePath} fill="#FE2C55" transform="translate(0.8 0)" />
      <path d={notePath} fill="#010101" />
    </svg>
  )
}

// CSV — document with lines (generic, currentColor).
function CsvIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM7 12h10v1.5H7V12zm0 3h10v1.5H7V15zm0 3h7v1.5H7V18z" fill-rule="evenodd"/>
    </svg>
  )
}

// HTTP — globe icon (generic, currentColor).
function HttpIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class={props.class} aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2c2.5 2.7 4 6.2 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.2-4-10s1.5-7.3 4-10z"/>
    </svg>
  )
}

// Manual — hand/cursor icon (generic, currentColor).
function ManualIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11h1V4.5a1.5 1.5 0 0 1 3 0V11h1V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-1.5L4 9a1.5 1.5 0 0 1 2.1-2.1L9 10v1z"/>
    </svg>
  )
}

// Generic fallback — a dot.
function DefaultIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <circle cx="12" cy="12" r="6" opacity="0.5"/>
    </svg>
  )
}

// ─── Icon Registries ────────────────────────────────────────────────────

const LLM_PROVIDER_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  'opencode-zen': ZenIcon,
  'google': GeminiIcon,
  'groq': GroqIcon,
  'openai': OpenAIIcon,
  'anthropic': AnthropicIcon,
  'openrouter': OpenRouterIcon,
  'xai': XaiIcon,
}

const NOTIFIER_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  discord: DiscordIcon,
  webhook: WebhookIcon,
  email_relay: EmailIcon,
}

const FANBASE_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  http_json_pull: HttpIcon,
  csv_inline: CsvIcon,
  manual_import: ManualIcon,
  meta_lead_ads: MetaIcon,
  bandsintown_followers: BandsintownIcon,
  google_customer_match: GoogleIcon,
  reddit_community: RedditIcon,
  // OAuth platform connection keys (used by FanSourcesPanel OAUTH_PLATFORMS)
  meta: MetaIcon,
  google_ads: GoogleIcon,
  spotify: SpotifyIcon,
  reddit: RedditIcon,
  tiktok: TikTokIcon,
}

export function LlmProviderIcon(props: { providerId: string; size?: number; class?: string }) {
  const Icon = LLM_PROVIDER_ICONS[props.providerId] ?? DefaultIcon
  return <Icon size={props.size} class={props.class} />
}

export function NotifierIcon(props: { kind: string; size?: number; class?: string }) {
  const Icon = NOTIFIER_ICONS[props.kind] ?? DefaultIcon
  return <Icon size={props.size} class={props.class} />
}

export function FanbaseIcon(props: { sourceKind: string; size?: number; class?: string }) {
  const Icon = FANBASE_ICONS[props.sourceKind] ?? DefaultIcon
  return <Icon size={props.size} class={props.class} />
}
