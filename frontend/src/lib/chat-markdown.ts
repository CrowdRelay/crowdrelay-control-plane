// Only relative in-app paths may reach an href. The reply text is model
// output seeded with tenant data that itself came from outside (Reddit
// threads, press mail, fan display names), so a link target here is
// untrusted input, not our own string. The model also hallucinates absolute
// URLs with wrong domains (crowdrelay.music, control.crowdrelay.music) and
// non-existent tenants — those must never become clickable links. Only
// paths starting with a single `/` (no `//protocol-relative`) are allowed;
// everything else is rendered as plain text.
function safeHref(url: string, slug: string): string | null {
  const trimmed = url.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  // Reject anything that looks like it has a scheme after the slash
  if (/^\/[^/]*:/.test(trimmed)) return null
  // Force the correct tenant slug — the model hallucinates wrong ones.
  return trimmed.replace(/^\/tenants\/[^/]+(\/|$)/, `/tenants/${slug}$1`)
}

// Escaping `<`, `>` and `&` is not enough for a value interpolated inside an
// attribute: an unescaped quote closes href="…" early and everything after it
// becomes markup, which is how an event handler gets in.
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Minimal markdown → HTML (bold, italic, code, links, line breaks)
// The slug is needed to force-correct hallucinated tenant slugs in links.
export function renderMarkdown(text: string, slug: string): string {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (whole, label: string, url: string) => {
      // The URL group still carries the `&amp;` escaping applied above; undo
      // it before parsing so query strings round-trip intact.
      const href = safeHref(url.replace(/&amp;/g, '&'), slug)
      if (!href) return whole
      return `<a href="${escapeAttribute(href)}">${label}</a>`
    })
    .replace(/\n/g, '<br>')
}
