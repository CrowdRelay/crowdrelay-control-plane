// Provider brand icons — inline SVGs keyed by provider kind.
// No external dependencies, no icon font, no sprite.
//
// Brand logos use their official colours (multi-path SVG) so they're
// instantly recognisable. Generic/abstract icons inherit currentColor.

import { Show } from 'solid-js'
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

// Google Gemini — the official Gemini sparkle mark (simple-icons path)
// with the brand's blue-to-purple-to-red gradient.
// Uses a unique gradient ID per instance to avoid DOM ID collisions
// when multiple Gemini icons render (e.g., in model routing tables).
let geminiIdCounter = 0
function GeminiIcon(props: IconProps) {
  const s = props.size ?? 20
  const gradId = `gemini-sparkle-${++geminiIdCounter}`
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4285F4" />
          <stop offset="33%" stop-color="#9b72cb" />
          <stop offset="66%" stop-color="#d96570" />
          <stop offset="100%" stop-color="#e8713a" />
        </linearGradient>
      </defs>
      <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" fill={`url(#${gradId})`}/>
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

// Anthropic — the official Anthropic "A" mark (simple-icons path).
// Two paths: the "A" letterform and the counter (negative space) inside it.
function AnthropicIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"/>
    </svg>
  )
}

// xAI (Grok) — the official x.ai "X" mark (simple-icons path).
// Two bold crossing strokes with angled ends, in xAI black.
function XaiIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.91l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

// OpenRouter — the official OpenRouter logo: a stylized "OR" monogram
// in OpenRouter's indigo/blue brand colour.
function OpenRouterIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <circle cx="12" cy="5" r="2.2" fill="#6366f1" stroke="none"/>
      <circle cx="5.5" cy="19" r="2.2" fill="#6366f1" stroke="none"/>
      <circle cx="18.5" cy="19" r="2.2" fill="#6366f1" stroke="none"/>
      <path d="M12 7.2v3.5M12 10.7l-5.2 6.6M12 10.7l5.2 6.6"/>
    </svg>
  )
}

// GitHub Copilot — the official Copilot logo (simple-icons path).
// The stylized copilot spark/face mark in GitHub's dark colour.
function GitHubCopilotIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M9.769 14.999a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-1.5 0v-.5a.75.75 0 0 1 .75-.75Zm4.5 0a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-1.5 0v-.5a.75.75 0 0 1 .75-.75ZM12 1.5c-2.498 0-4.498 1.004-6 2.5C4.5 5.5 3.5 7.5 3.5 10c0 .962.183 1.874.515 2.696-.313.653-.515 1.392-.515 2.182v.122c0 .746.182 1.453.5 2.087.213.426.49.81.815 1.137.135.411.323.806.562 1.173.379.583.857 1.085 1.413 1.49.556.406 1.19.715 1.882.906.692.191 1.442.279 2.228.279h.4c.786 0 1.536-.088 2.228-.279.692-.191 1.326-.5 1.882-.906.556-.405 1.034-.907 1.413-1.49.239-.367.427-.762.562-1.173.325-.328.602-.711.815-1.137.318-.634.5-1.341.5-2.087v-.122c0-.79-.202-1.529-.515-2.182.332-.822.515-1.734.515-2.696 0-2.5-1-4.5-2.5-6-1.502-1.496-3.502-2.5-6-2.5Zm-3.5 9c.829 0 1.5.672 1.5 1.5s-.671 1.5-1.5 1.5-1.5-.672-1.5-1.5.671-1.5 1.5-1.5Zm7 0c.829 0 1.5.672 1.5 1.5s-.671 1.5-1.5 1.5-1.5-.672-1.5-1.5.671-1.5 1.5-1.5Z"/>
    </svg>
  )
}

// Zhipu AI — a stylized "Z" spark in Zhipu blue-teal.
function ZhipuIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M7 5h10L8 14h9" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="17" cy="5" r="2" fill="#3b82f6"/>
      <circle cx="8" cy="14" r="2" fill="#06b6d4"/>
    </svg>
  )
}

// Cognition AI — a brain-spark mark in Cognition's deep indigo.
function CognitionIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 2 4 3 3 0 0 0 3-3V3a3 3 0 0 0-3 0z" fill="#4f46e5" opacity="0.15"/>
      <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 17a3 3 0 0 1-2 4 3 3 0 0 1-3-3"/>
      <circle cx="12" cy="11" r="1.5" fill="#4f46e5" stroke="none"/>
    </svg>
  )
}

// ─── Notifier Brand Logos ───────────────────────────────────────────────

// Discord — official Discord logo (simple-icons path) in Discord blurple.
function DiscordIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#5865F2" class={props.class} aria-hidden="true">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
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

// Meta (Facebook/Instagram) — official Meta infinity loop (simple-icons
// path) in Meta blue. Filled path, not stroked.
function MetaIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#0866FF" class={props.class} aria-hidden="true">
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"/>
    </svg>
  )
}

// Bandsintown — official Bandsintown mark (simple-icons path) in red.
function BandsintownIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#E61931" class={props.class} aria-hidden="true">
      <path d="M6.399 12.8v4.8H19.2v1.6H4.799V0H0v24h24V12.8H6.399Zm4.801-8H6.399v6.4H11.2V4.8Zm6.4 0h-4.8v6.4h4.8V4.8ZM24 0h-4.8v11.2H24V0Z"/>
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

// Reddit — official Reddit Snoo logo (simple-icons path) in Reddit orange-red.
function RedditIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#FF4500" class={props.class} aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z"/>
    </svg>
  )
}

// Spotify — official Spotify circle with three sound-wave arcs
// (simple-icons path) in Spotify green. Single filled path.
function SpotifyIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#1DB954" class={props.class} aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  )
}

// TikTok — official TikTok music note (simple-icons path) with
// cyan/red offset glow. Single path drawn three times with translate
// transforms for the chromatic-aberration effect the brand is known for.
function TikTokIcon(props: IconProps) {
  const s = props.size ?? 20
  const notePath = "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d={notePath} fill="#25F4EE" transform="translate(-0.8 0)" />
      <path d={notePath} fill="#FE2C55" transform="translate(0.8 0)" />
      <path d={notePath} fill="#010101" />
    </svg>
  )
}

function TelegramIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/>
    </svg>
  )
}

function LastfmIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M7.32 17.5c-1.94 0-3.32-1.23-3.32-3.18 0-1.96 1.38-3.19 3.32-3.19 1.31 0 2.06.66 2.56 1.52l.97-.42c-.62-1.27-1.86-2.1-3.53-2.1-2.68 0-4.32 1.84-4.32 4.19 0 2.34 1.64 4.18 4.32 4.18 1.67 0 2.91-.83 3.53-2.1l-.97-.42c-.5.86-1.25 1.52-2.56 1.52zm5.68-3.18c0-2.35 1.64-4.19 4.32-4.19 2.68 0 4.32 1.84 4.32 4.19 0 2.34-1.64 4.18-4.32 4.18-2.68 0-4.32-1.84-4.32-4.18zm1 0c0 1.95 1.38 3.18 3.32 3.18s3.32-1.23 3.32-3.18c0-1.96-1.38-3.19-3.32-3.19s-3.32 1.23-3.32 3.19z"/>
    </svg>
  )
}

// Deezer — equalizer bars (simplified brand mark, currentColor).
function DeezerIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <rect x="3" y="10" width="3" height="4" rx="0.5"/>
      <rect x="8" y="7" width="3" height="10" rx="0.5"/>
      <rect x="13" y="4" width="3" height="16" rx="0.5"/>
      <rect x="18" y="9" width="3" height="6" rx="0.5"/>
    </svg>
  )
}

// Discogs — vinyl record (simplified, currentColor).
function DiscogsIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class={props.class} aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
    </svg>
  )
}

// Bluesky — butterfly silhouette (simplified, currentColor).
function BlueskyIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M12 10.8C10.6 8.2 7.1 3.5 4.2 3.5c-2 0-2.7 2.3-2.7 4.6 0 2.4.9 5.7 1.6 7.6.3.8.6 1.3 1.2 1.3.8 0 1.7-.9 2.4-1.8.5-.6 1-1.2 1.5-1.2.4 0 .7.3.8.8.2.7.5 1.5.9 2.2.4.6.9 1 1.6 1s1.2-.4 1.6-1c.4-.7.7-1.5.9-2.2.1-.5.4-.8.8-.8.5 0 1 .6 1.5 1.2.7.9 1.6 1.8 2.4 1.8.6 0 .9-.5 1.2-1.3.7-1.9 1.6-5.2 1.6-7.6 0-2.3-.7-4.6-2.7-4.6-2.9 0-6.4 4.7-7.8 7.3z"/>
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
  'github-copilot': GitHubCopilotIcon,
  'zhipu': ZhipuIcon,
  'cognition': CognitionIcon,
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
  // Platform connection keys (used by FanSourcesPanel platform connections)
  meta: MetaIcon,
  google_ads: GoogleIcon,
  spotify: SpotifyIcon,
  reddit: RedditIcon,
  tiktok: TikTokIcon,
  discord: DiscordIcon,
  telegram: TelegramIcon,
  lastfm: LastfmIcon,
  deezer: DeezerIcon,
  discogs: DiscogsIcon,
  bluesky: BlueskyIcon,
}

export function LlmProviderIcon(props: { providerId: string; size?: number; class?: string }) {
  const Icon = LLM_PROVIDER_ICONS[props.providerId] ?? DefaultIcon
  return <Icon size={props.size} class={props.class} />
}

// ─── Tier Badge Overlay ─────────────────────────────────────────────────
// Small visual overlay on provider/model icons:
// - free: green dot in bottom-right corner
// - premium: purple dot in bottom-right corner
// - connected: green check overlay
// - beta: amber "beta" micro-chip

export function TierBadge(props: { tier: 'free' | 'premium' | 'connected' | 'beta'; size?: number }) {
  const s = props.size ?? 10
  if (props.tier === 'connected') {
    return (
      <span class="tier-badge-overlay tier-badge-connected" style={{ width: `${s}px`, height: `${s}px` }} aria-label="connected">
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    )
  }
  if (props.tier === 'beta') {
    return <span class="tier-badge-overlay tier-badge-beta" aria-label="beta">beta</span>
  }
  const color = props.tier === 'free' ? '#22c55e' : '#a78bfa'
  return (
    <span
      class="tier-badge-overlay"
      style={{ width: `${s}px`, height: `${s}px`, background: color }}
      aria-label={props.tier}
    />
  )
}

// ─── Model Icon ─────────────────────────────────────────────────────────
// Renders a compact visual identifier for a model, using the provider's
// brand icon with a tier dot overlay. For free models, uses a distinct
// "free spark" mark instead of the provider logo.

function FreeSparkIcon(props: IconProps) {
  const s = props.size ?? 16
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M6.3 17.7l2.4-2.4M15.3 8.7l2.4-2.4" opacity="0.7" />
      <circle cx="12" cy="12" r="2.5" fill="#22c55e" stroke="none" opacity="0.8" />
    </svg>
  )
}

export function ModelIcon(props: { modelId: string; providerId: string; paid?: boolean; size?: number; class?: string }) {
  const s = props.size ?? 16
  // Free models get the free spark mark
  if (!props.paid) {
    return (
      <span class="model-icon-wrap" style={{ width: `${s}px`, height: `${s}px` }}>
        <FreeSparkIcon size={s} class={props.class} />
      </span>
    )
  }
  // Paid models use the provider brand icon with a premium tier dot
  const Icon = LLM_PROVIDER_ICONS[props.providerId] ?? DefaultIcon
  return (
    <span class="model-icon-wrap" style={{ width: `${s}px`, height: `${s}px` }}>
      <Icon size={s} class={props.class} />
      <TierBadge tier="premium" size={Math.max(6, Math.floor(s / 3))} />
    </span>
  )
}

// ─── Provider Icon with Tier Badge ──────────────────────────────────────
// Wraps LlmProviderIcon with an optional tier badge overlay for use in
// provider cards where the tier is visually important.

export function LlmProviderIconWithTier(props: { providerId: string; tier?: 'free' | 'premium'; connected?: boolean; beta?: boolean; size?: number; class?: string }) {
  const s = props.size ?? 28
  return (
    <span class="model-icon-wrap" style={{ width: `${s}px`, height: `${s}px` }}>
      <LlmProviderIcon providerId={props.providerId} size={s} class={props.class} />
      <Show when={props.connected}>
        <TierBadge tier="connected" size={Math.max(8, Math.floor(s / 3))} />
      </Show>
      <Show when={props.beta && !props.connected}>
        <TierBadge tier="beta" />
      </Show>
      <Show when={!props.connected && !props.beta && props.tier}>
        <TierBadge tier={props.tier!} size={Math.max(6, Math.floor(s / 4))} />
      </Show>
    </span>
  )
}

export function NotifierIcon(props: { kind: string; size?: number; class?: string }) {
  const Icon = NOTIFIER_ICONS[props.kind] ?? DefaultIcon
  return <Icon size={props.size} class={props.class} />
}

export function FanbaseIcon(props: { sourceKind: string; size?: number; class?: string }) {
  const Icon = FANBASE_ICONS[props.sourceKind] ?? DefaultIcon
  return <Icon size={props.size} class={props.class} />
}
