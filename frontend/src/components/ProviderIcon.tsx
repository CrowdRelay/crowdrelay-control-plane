// Provider icons — small inline SVGs keyed by provider kind. No external
// dependencies, no icon font, no sprite. Each icon is a single-colour path
// that inherits currentColor, so it adapts to the row's text colour and
// stays crisp at any size.

import { Show } from 'solid-js'

type IconProps = { size?: number; class?: string }

const wrap = (size: number, class_: string | undefined, children: any) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    class={class_}
    aria-hidden="true"
  >{children}</svg>
)

// Discord — simplified Discord logo.
function DiscordIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.02.06.03.09.02 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
  </>)
}

// Generic webhook — a link/chain icon.
function WebhookIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M10.5 13.5a.75.75 0 0 1 .75.75v1.5a2.25 2.25 0 0 1-4.5 0V13a4 4 0 0 1 8 0v.75a.75.75 0 0 1-1.5 0V13a2.5 2.5 0 0 0-5 0v2.75a.75.75 0 0 0 1.5 0v-1.5a.75.75 0 0 1 .75-.75zM3 13a6 6 0 0 1 12 0v.75a.75.75 0 0 1-1.5 0V13a4.5 4.5 0 0 0-9 0v2.75a1.25 1.25 0 0 0 2.5 0V14.5a.75.75 0 0 1 1.5 0v1.25a2.75 2.75 0 0 1-5.5 0V13z"/>
  </>)
}

// Email — envelope icon.
function EmailIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-13zm1.5.5v.2l7.5 5 7.5-5V6L12 11 4.5 6z" fill-rule="evenodd"/>
  </>)
}

// Meta (Facebook) — simplified infinity/logo mark.
function MetaIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M6 9c2.5 0 4 3 6 3s3.5-3 6-3c2.2 0 4 2 4 5s-1.8 5-4 5c-2.5 0-4-3-6-3s-3.5 3-6 3c-2.2 0-4-2-4-5s1.8-5 4-5zm0 2c-1.1 0-2 1.3-2 3s.9 3 2 3c1.5 0 3-3 6-3s4.5 3 6 3c1.1 0 2-1.3 2-3s-.9-3-2-3c-1.5 0-3 3-6 3s-4.5-3-6-3z"/>
  </>)
}

// Bandsintown — simplified music note in a circle.
function BandsintownIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.5 6.5v6.2a1.8 1.8 0 1 1-1.5-1.78V10l-4 1v4.2a1.8 1.8 0 1 1-1.5-1.78V9.3l7-2.3z"/>
  </>)
}

// Google — simplified "G" mark.
function GoogleIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M12 11v2.8h4.3c-.2 1.2-1.5 3.5-4.3 3.5-2.6 0-4.7-2.1-4.7-4.8S9.4 7.7 12 7.7c1.5 0 2.4.6 3 1.2l2-1.9C16.1 5.4 14.2 4.5 12 4.5 7.9 4.5 4.5 7.9 4.5 12s3.4 7.5 7.5 7.5c4.3 0 7.2-3 7.2-7.3 0-.5 0-.8-.1-1.2H12z"/>
  </>)
}

// Reddit — simplified alien/snoo head.
function RedditIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M12 2a2 2 0 0 1 2 2c0 .3-.1.6-.2.9l3.2 1.9a2 2 0 1 1-.5 1.4l-3.2-1.9c-.4.3-.9.5-1.5.5s-1.1-.2-1.5-.5L7.1 8.2a2 2 0 1 1-.5-1.4l3.2-1.9c-.1-.3-.2-.6-.2-.9a2 2 0 0 1 2-2zM7.5 10c1.4 0 2.5 1.1 2.5 2.5S8.9 15 7.5 15 5 13.9 5 12.5 6.1 10 7.5 10zm9 0c1.4 0 2.5 1.1 2.5 2.5S17.9 15 16.5 15 14 13.9 14 12.5 15.1 10 16.5 10zM8.5 17c.3-.3.8-.3 1.1 0 .6.6 1.4 1 2.4 1s1.8-.4 2.4-1c.3-.3.8-.3 1.1 0 .3.3.3.8 0 1.1-.9.9-2.1 1.4-3.5 1.4s-2.6-.5-3.5-1.4c-.3-.3-.3-.8 0-1.1z"/>
  </>)
}

// CSV — document with lines.
function CsvIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM7 12h10v1.5H7V12zm0 3h10v1.5H7V15zm0 3h7v1.5H7V18z" fill-rule="evenodd"/>
  </>)
}

// HTTP — globe with arrow.
function HttpIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 1.5c1.7 0 3.3 1.8 4.1 4.5H7.9C8.7 5.3 10.3 3.5 12 3.5zM6.3 9h11.4c.1.6.2 1.3.2 2s-.1 1.4-.2 2H6.3c-.1-.6-.2-1.3-.2-2s.1-1.4.2-2zm.6 6h3.2c.3 1.2.8 2.3 1.4 3.1-2.2-.4-4-1.6-5.2-3.1zm5.1 0h4c-.8 1.8-1.9 3.1-3 3.1s-2.2-1.3-3-3.1z" fill-rule="evenodd"/>
  </>)
}

// Manual — hand/cursor icon.
function ManualIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11h1V4.5a1.5 1.5 0 0 1 3 0V11h1V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-1.5L4 9a1.5 1.5 0 0 1 2.1-2.1L9 10v1z"/>
  </>)
}

// Generic fallback — a dot.
function DefaultIcon(props: IconProps) {
  return wrap(props.size ?? 20, props.class, <>
    <circle cx="12" cy="12" r="6" opacity="0.5"/>
  </>)
}

const NOTIFIER_ICONS: Record<string, (props: IconProps) => any> = {
  discord: DiscordIcon,
  webhook: WebhookIcon,
  email_relay: EmailIcon,
}

const FANBASE_ICONS: Record<string, (props: IconProps) => any> = {
  http_json_pull: HttpIcon,
  csv_inline: CsvIcon,
  manual_import: ManualIcon,
  meta_lead_ads: MetaIcon,
  bandsintown_followers: BandsintownIcon,
  google_customer_match: GoogleIcon,
  reddit_community: RedditIcon,
}

export function NotifierIcon(props: { kind: string; size?: number; class?: string }) {
  const Icon = NOTIFIER_ICONS[props.kind] ?? DefaultIcon
  return <Icon size={props.size} class={props.class} />
}

export function FanbaseIcon(props: { sourceKind: string; size?: number; class?: string }) {
  const Icon = FANBASE_ICONS[props.sourceKind] ?? DefaultIcon
  return <Icon size={props.size} class={props.class} />
}
