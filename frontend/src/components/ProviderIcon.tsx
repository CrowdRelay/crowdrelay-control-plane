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

// OpenAI — the official OpenAI knot mark (simple-icons path).
function OpenAIIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
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

// OpenRouter — the official OpenRouter logo (simple-icons path).
function OpenRouterIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z"/>
    </svg>
  )
}

// GitHub Copilot — the official Copilot logo (simple-icons path).
function GitHubCopilotIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z"/>
    </svg>
  )
}

// Zhipu AI (Z.ai) — the official Z.ai logo (simple-icons path).
function ZhipuIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" class={props.class} aria-hidden="true">
      <path d="M12.606 1.806l-1.677 2.388c-0.258 0.374-0.697 0.606-1.161 0.606h-9.162V1.794C0.594 1.806 12.606 1.806 12.606 1.806zM24 1.806L9.6 22.206 0 22.206 14.4 1.806zM11.394 22.206l1.69-2.4c0.258-0.374 0.697-0.606 1.161-0.606h9.149v3.006H11.394z"/>
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

// Telegram — official Telegram mark (simple-icons path) in Telegram blue.
function TelegramIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#26A5E4" class={props.class} aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  )
}

// Last.fm — official Last.fm wordmark glyph (simple-icons path) in Last.fm red.
function LastfmIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#BA0000" class={props.class} aria-hidden="true">
      <path d="M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z"/>
    </svg>
  )
}

// Deezer — the brand's equalizer grid. Deezer was withdrawn from simple-icons,
// so this is drawn from the brand sheet: four columns, the top row carrying the
// brand's warm ramp and everything below it in Deezer violet.
function DeezerIcon(props: IconProps) {
  const s = props.size ?? 20
  // Four columns, four rows, every bar inside the 24-unit box.
  const COL = [0.45, 6.35, 12.25, 18.15]
  const ROW = [5.0, 8.9, 12.8, 16.7]
  const bar = (col: number, row: number, fill: string) => (
    <rect x={COL[col]} y={ROW[row]} width="5.4" height="2.6" rx="0.4" fill={fill} />
  )
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      {bar(3, 0, '#FF6B35')}
      {bar(2, 1, '#F8B500')}
      {bar(3, 1, '#F8B500')}
      {bar(1, 2, '#A238FF')}
      {bar(2, 2, '#A238FF')}
      {bar(3, 2, '#A238FF')}
      {bar(0, 3, '#A238FF')}
      {bar(1, 3, '#A238FF')}
      {bar(2, 3, '#A238FF')}
      {bar(3, 3, '#A238FF')}
    </svg>
  )
}

// Discogs — official Discogs mark (simple-icons path). The brand black is
// invisible on this console's surfaces, so it is drawn in the page's ink.
function DiscogsIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#f7f7f8" class={props.class} aria-hidden="true">
      <path d="M1.7422 11.982c0-5.6682 4.61-10.2782 10.2758-10.2782 1.8238 0 3.5372.48 5.0251 1.3175l.8135-1.4879C16.1768.588 14.2474.036 12.1908.0024h-.1944C5.4091.0144.072 5.3107 0 11.886v.1152c.0072 3.4389 1.4567 6.5345 3.7748 8.7207l1.1855-1.2814c-1.9798-1.8743-3.218-4.526-3.218-7.4585zM20.362 3.4053l-1.1543 1.2406c1.903 1.867 3.0885 4.4636 3.0885 7.3361 0 5.6658-4.61 10.2758-10.2758 10.2758-1.783 0-3.4605-.456-4.922-1.2575l-.8542 1.5214c1.7086.9384 3.6692 1.4735 5.7546 1.4759C18.6245 23.9976 24 18.6246 24 11.9988c-.0048-3.3717-1.399-6.4146-3.638-8.5935zM1.963 11.982c0 2.8701 1.2119 5.4619 3.146 7.2953l1.1808-1.2767c-1.591-1.5166-2.587-3.6524-2.587-6.0186 0-4.586 3.7293-8.3152 8.3152-8.3152 1.483 0 2.875.3912 4.082 1.0751l.8351-1.5262C15.481 2.395 13.8034 1.927 12.018 1.927 6.4746 1.9246 1.963 6.4362 1.963 11.982zm18.3702 0c0 4.586-3.7293 8.3152-8.3152 8.3152-1.4327 0-2.7837-.3648-3.962-1.0055l-.852 1.5166c1.4303.7823 3.0718 1.2287 4.814 1.2287 5.5434 0 10.055-4.5116 10.055-10.055 0-2.8077-1.1567-5.3467-3.0165-7.1729l-1.183 1.2743c1.519 1.507 2.4597 3.5924 2.4597 5.8986zm-1.9486 0c0 3.5109-2.8558 6.3642-6.3642 6.3642a6.3286 6.3286 0 01-3.0069-.756l-.8471 1.507c1.147.624 2.4597.9768 3.854.9768 4.4636 0 8.0944-3.6308 8.0944-8.0944 0-2.239-.9143-4.2692-2.3902-5.7378l-1.1783 1.267c1.1351 1.152 1.8383 2.731 1.8383 4.4732zm-14.4586 0c0 2.3014.9671 4.382 2.515 5.8578l1.1734-1.2695c-1.207-1.159-1.9606-2.786-1.9606-4.5883 0-3.5108 2.8557-6.3642 6.3642-6.3642 1.1423 0 2.215.3048 3.1437.8352l.8303-1.5167c-1.1759-.6647-2.5317-1.0487-3.974-1.0487-4.4612 0-8.092 3.6308-8.092 8.0944zm12.5292 0c0 2.4502-1.987 4.4372-4.4372 4.4372a4.4192 4.4192 0 01-2.0614-.5088l-.8351 1.4879a6.1135 6.1135 0 002.8965.727c3.3885 0 6.1434-2.7548 6.1434-6.1433 0-1.6774-.6767-3.1989-1.7686-4.3076l-1.1615 1.2503c.7559.7967 1.2239 1.8718 1.2239 3.0573zm-10.5806 0c0 1.7374.7247 3.3069 1.8886 4.4252L8.92 15.1569l.0144.0144c-.8351-.8063-1.3559-1.9366-1.3559-3.1869 0-2.4502 1.9846-4.4372 4.4372-4.4372.8087 0 1.5646.2184 2.2174.5976l.8207-1.4975a6.097 6.097 0 00-3.0381-.8063c-3.3837-.0048-6.141 2.7525-6.141 6.141zm6.681 0c0 .2952-.2424.5351-.5376.5351-.2952 0-.5375-.24-.5375-.5351 0-.2976.24-.5375.5375-.5375.2952 0 .5375.24.5375.5375zm-3.9405 0c0-1.879 1.5239-3.4029 3.4005-3.4029 1.879 0 3.4005 1.5215 3.4005 3.4029 0 1.879-1.5239 3.4005-3.4005 3.4005S8.6151 13.861 8.6151 11.982zm.1488 0c.0048 1.7974 1.4567 3.2493 3.2517 3.2517 1.795 0 3.254-1.4567 3.254-3.2517-.0023-1.7974-1.4566-3.2517-3.254-3.254-1.795 0-3.2517 1.4566-3.2517 3.254Z"/>
    </svg>
  )
}

// Bluesky — official Bluesky butterfly (simple-icons path) in Bluesky blue.
function BlueskyIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#0285FF" class={props.class} aria-hidden="true">
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/>
    </svg>
  )
}

// Bandcamp — official Bandcamp mark (simple-icons path) in Bandcamp teal.
function BandcampIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#408294" class={props.class} aria-hidden="true">
      <path d="M0 18.75l7.437-13.5H24l-7.438 13.5H0z"/>
    </svg>
  )
}

// YouTube — play button in a rounded rectangle (official brand colours).
function YoutubeIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000"/>
      <path d="M9.546 15.568V8.432L15.818 12l-6.272 3.568z" fill="#fff"/>
    </svg>
  )
}

// Facebook — the "f" mark in Facebook blue.
function FacebookIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#1877F2" class={props.class} aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

// Instagram — official Instagram glyph (simple-icons path) under the brand's
// corner-anchored gradient. Each instance mints its own gradient ID so two
// Instagram icons on one page do not share (and fight over) one definition.
let instagramIdCounter = 0
function InstagramIcon(props: IconProps) {
  const s = props.size ?? 20
  const gradId = `instagram-ramp-${++instagramIdCounter}`
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" class={props.class} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#FEDA75" />
          <stop offset="25%" stop-color="#FA7E1E" />
          <stop offset="50%" stop-color="#D62976" />
          <stop offset="75%" stop-color="#962FBF" />
          <stop offset="100%" stop-color="#4F5BD5" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradId})`} d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/>
    </svg>
  )
}

// SoundCloud — official SoundCloud mark (simple-icons path) in SoundCloud
// orange. The previous drawing was a bar chart with a cloud bolted onto it.
function SoundcloudIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#FF5500" class={props.class} aria-hidden="true">
      <path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/>
    </svg>
  )
}

// X — the official X mark (simple-icons path). xAI shares the letterform but
// not the brand, so the two keep their own components.
function XIcon(props: IconProps) {
  const s = props.size ?? 20
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#f7f7f8" class={props.class} aria-hidden="true">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
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
  bandcamp: BandcampIcon,
  youtube: YoutubeIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  soundcloud: SoundcloudIcon,
  x: XIcon,
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
      <span class="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface-3 flex items-center justify-center leading-none bg-success text-background" style={{ width: `${s}px`, height: `${s}px` }} aria-label="connected">
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    )
  }
  if (props.tier === 'beta') {
    return <span class="absolute -bottom-1.5 -right-1.5 rounded-full flex items-center justify-center leading-none bg-warning text-surface-3 text-xs font-bold px-1 py-0.5 border-none tracking-wider" aria-label="beta">beta</span>
  }
  const color = props.tier === 'free' ? '#22c55e' : '#a78bfa'
  return (
    <span
      class="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface-3 flex items-center justify-center leading-none"
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
      <span class="relative inline-flex items-center justify-center" style={{ width: `${s}px`, height: `${s}px` }}>
        <FreeSparkIcon size={s} class={props.class} />
      </span>
    )
  }
  // Paid models use the provider brand icon with a premium tier dot
  const Icon = LLM_PROVIDER_ICONS[props.providerId] ?? DefaultIcon
  return (
    <span class="relative inline-flex items-center justify-center" style={{ width: `${s}px`, height: `${s}px` }}>
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
    <span class="relative inline-flex items-center justify-center" style={{ width: `${s}px`, height: `${s}px` }}>
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
