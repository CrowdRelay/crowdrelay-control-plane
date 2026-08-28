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

// Google Gemini — the official 4-colour Gemini star/sparkle mark.
function GeminiIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M12 2c.3 4.5 3.2 7.7 7.5 8-4.3.3-7.2 3.5-7.5 8-.3-4.5-3.2-7.7-7.5-8 4.3-.3 7.2-3.5 7.5-8z" fill="#4285F4"/>
      <path d="M12 6c.2 2.8 2 4.8 4.7 5-2.7.2-4.5 2.2-4.7 5-.2-2.8-2-4.8-4.7-5 2.7-.2 4.5-2.2 4.7-5z" fill="#4285F4" opacity="0.6"/>
    </svg>
  )
}

// Groq — lightning bolt in Groq orange/red.
function GroqIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="#f55036"/>
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="#f55036" opacity="0.3" transform="scale(0.7) translate(5 5)"/>
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

// Anthropic — the Claude/Antropic burst mark.
function AnthropicIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M7.2 2L4.5 22h3.1L9.5 2H7.2zm7.3 0L9.8 22h3.1L16.2 2h-1.7zm5.5 0L17.3 22h3.1L21.5 2h-1.5z"/>
    </svg>
  )
}

// xAI (Grok) — the official x.ai "X" mark in xAI black.
function XaiIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M5.3 4.5h3.4l4.6 6.6 4.8-6.6h2.6l-6.2 8.4L21 19.5h-3.4l-4.9-7L7.7 19.5H5l6.7-9z"/>
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

// Webhook — a link/chain icon in neutral blue-grey.
function WebhookIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <path d="M10.5 13.5a.75.75 0 0 1 .75.75v1.5a2.25 2.25 0 0 1-4.5 0V13a4 4 0 0 1 8 0v.75a.75.75 0 0 1-1.5 0V13a2.5 2.5 0 0 0-5 0v2.75a.75.75 0 0 0 1.5 0v-1.5a.75.75 0 0 1 .75-.75z"/>
      <path d="M3 13a6 6 0 0 1 12 0v.75a.75.75 0 0 1-1.5 0V13a4.5 4.5 0 0 0-9 0v2.75a1.25 1.25 0 0 0 2.5 0V14.5a.75.75 0 0 1 1.5 0v1.25a2.75 2.75 0 0 1-5.5 0V13z"/>
    </svg>
  )
}

// Email — envelope icon in neutral tone.
function EmailIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-13zm1.5.5v.2l7.5 5 7.5-5V6L12 11 4.5 6z" fill-rule="evenodd"/>
    </svg>
  )
}

// ─── Fanbase Source Brand Logos ─────────────────────────────────────────

// Meta (Facebook/Instagram) — official Meta infinity mark in Meta blue.
function MetaIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M6 9c2.5 0 4 3 6 3s3.5-3 6-3c2.2 0 4 2 4 5s-1.8 5-4 5c-2.5 0-4-3-6-3s-3.5 3-6 3c-2.2 0-4-2-4-5s1.8-5 4-5z" fill="#0866FF"/>
      <path d="M6 9c2.5 0 4 3 6 3s3.5-3 6-3c2.2 0 4 2 4 5s-1.8 5-4 5c-2.5 0-4-3-6-3s-3.5 3-6 3c-2.2 0-4-2-4-5s1.8-5 4-5z" fill="#0866FF" opacity="0.4" transform="scale(0.6) translate(8 8)"/>
    </svg>
  )
}

// Bandsintown — music note in Bandsintown red circle.
function BandsintownIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#E61931"/>
      <path d="M15.5 8.5v6.2a1.8 1.8 0 1 1-1.5-1.78V10l-4 1v4.2a1.8 1.8 0 1 1-1.5-1.78V9.3l7-2.3z" fill="#fff"/>
    </svg>
  )
}

// Google (Customer Match) — Google "G" in official 4-colour.
function GoogleIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M12 11v2.8h4.3c-.2 1.2-1.5 3.5-4.3 3.5-2.6 0-4.7-2.1-4.7-4.8S9.4 7.7 12 7.7c1.5 0 2.4.6 3 1.2l2-1.9C16.1 5.4 14.2 4.5 12 4.5 7.9 4.5 4.5 7.9 4.5 12s3.4 7.5 7.5 7.5c4.3 0 7.2-3 7.2-7.3 0-.5 0-.8-.1-1.2H12z" fill="#4285F4"/>
    </svg>
  )
}

// Reddit — simplified Snoo head in Reddit orange.
function RedditIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#FF4500" class={props.class} aria-hidden="true">
      <path d="M12 2a2 2 0 0 1 2 2c0 .3-.1.6-.2.9l3.2 1.9a2 2 0 1 1-.5 1.4l-3.2-1.9c-.4.3-.9.5-1.5.5s-1.1-.2-1.5-.5L7.1 8.2a2 2 0 1 1-.5-1.4l3.2-1.9c-.1-.3-.2-.6-.2-.9a2 2 0 0 1 2-2zM7.5 10c1.4 0 2.5 1.1 2.5 2.5S8.9 15 7.5 15 5 13.9 5 12.5 6.1 10 7.5 10zm9 0c1.4 0 2.5 1.1 2.5 2.5S17.9 15 16.5 15 14 13.9 14 12.5 15.1 10 16.5 10zM8.5 17c.3-.3.8-.3 1.1 0 .6.6 1.4 1 2.4 1s1.8-.4 2.4-1c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1-.9.9-2.1 1.4-3.5 1.4s-2.6-.5-3.5-1.4c-.3-.3-.3-.8 0-1.1z"/>
    </svg>
  )
}

// Spotify — official Spotify circle with sound waves in Spotify green.
function SpotifyIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#1DB954"/>
      <path d="M7.5 10.5c3-.8 6-.6 8.5.8.4.2.5.7.3 1.1-.2.4-.7.5-1.1.3-2.1-1.2-4.7-1.4-7.3-.7-.4.1-.9-.1-1-.5-.1-.4.1-.9.6-1zm-.8 3c2.5-.7 5-.5 7.1.7.4.2.5.7.3 1-.2.4-.6.5-1 .3-1.8-1-3.9-1.2-6-.6-.4.1-.8-.1-.9-.5-.1-.4.1-.8.5-.9zm.6 2.7c2-.6 4-.4 5.7.5.3.2.4.6.2.9-.2.3-.6.4-.9.2-1.4-.8-2.9-.9-4.5-.5-.3.1-.7-.1-.8-.4-.1-.3.1-.7.3-.7z" fill="#fff"/>
    </svg>
  )
}

// TikTok — official TikTok music note in TikTok black with cyan/red accents.
function TikTokIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M14 3h2.5c.3 1.8 1.4 3.4 3 4.2v2.5c-1.2-.4-2.3-1-3.2-1.9v5.8c0 3.2-2.6 5.8-5.8 5.8S4.7 16.8 4.7 13.6s2.6-5.8 5.8-5.8c.4 0 .8 0 1.2.1v2.6c-.4-.1-.8-.2-1.2-.2-1.8 0-3.3 1.5-3.3 3.3s1.5 3.3 3.3 3.3S14 15.4 14 13.6V3z" fill="#25F4EE"/>
      <path d="M14.5 3.5h2c.3 1.8 1.4 3.4 3 4.2v2.5c-1.2-.4-2.3-1-3.2-1.9v5.8c0 3.2-2.6 5.8-5.8 5.8S4.7 16.8 4.7 13.6s2.6-5.8 5.8-5.8c.4 0 .8 0 1.2.1v2.6c-.4-.1-.8-.2-1.2-.2-1.8 0-3.3 1.5-3.3 3.3s1.5 3.3 3.3 3.3S14 15.4 14 13.6V3.5z" fill="#FE2C55"/>
      <path d="M14.25 3.25h2.25c.3 1.8 1.4 3.4 3 4.2v2.5c-1.2-.4-2.3-1-3.2-1.9v5.8c0 3.2-2.6 5.8-5.8 5.8s-5.8-2.6-5.8-5.8 2.6-5.8 5.8-5.8c.4 0 .8 0 1.2.1v2.6c-.4-.1-.8-.2-1.2-.2-1.8 0-3.3 1.5-3.3 3.3s1.5 3.3 3.3 3.3S14.25 15.4 14.25 13.6V3.25z" fill="#010101"/>
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
