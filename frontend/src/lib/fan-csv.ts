import type { FanCard } from './types'

/**
 * Fan lists, out to a spreadsheet and back in.
 *
 * The console could show a fanbase and never hand it to you, so the answer to
 * "send me the list" was a screenshot or a database query. Both directions run
 * in the browser: the export is built from the rows already loaded, and the
 * import is parsed here and posted through the fanbase ingest endpoint that
 * already exists, so neither needs a new route.
 */

/** The columns an export carries, in the order a reader expects them. */
const EXPORT_COLUMNS = [
  'external_id',
  'email',
  'display_name',
  'locale',
  'status',
  'activation_state',
  'consented',
  'qualified_referrals',
  'event_interests',
  'attended_events',
  'paid_ticket_orders',
  'created_at',
  'last_activity_at',
] as const

/**
 * Quote a field for RFC 4180.
 *
 * A display name with a comma in it splits one fan into two columns, and a
 * leading `=` or `+` is executed as a formula by every spreadsheet that opens
 * the file — so a fan who signs up as `=cmd|...` becomes a payload rather than
 * a row. Prefixing the cell with an apostrophe makes the spreadsheet read it as
 * text, which is what a name is.
 */
const cell = (value: unknown): string => {
  if (value == null) return ''
  const text = String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Render fans as an RFC 4180 document, header row first. */
export function fansToCsv(fans: FanCard[]): string {
  const rows = fans.map(fan =>
    EXPORT_COLUMNS.map(column => cell(column === 'external_id' ? fan.id : fan[column])).join(','),
  )
  return [EXPORT_COLUMNS.join(','), ...rows].join('\r\n')
}

/**
 * Hand a string to the browser as a file download.
 *
 * The object URL is revoked on the next frame rather than immediately: Safari
 * reads the blob after the click handler returns, and revoking inside it gives
 * an empty file.
 */
export function downloadTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}

export type FanImportEntry = {
  external_id: string
  email?: string
  display_name?: string
  locale?: string
}

export type FanCsvParse = {
  entries: FanImportEntry[]
  /** Rows the file had that produced no entry, and why. */
  skipped: { row: number; reason: string }[]
  /** Header names the file carried that the ingest contract has no use for. */
  ignoredColumns: string[]
}

/**
 * Split one CSV line, honouring quoted fields.
 *
 * Written by hand rather than pulled in: the format this accepts is one header
 * row and four known columns, and a parser dependency for that is more surface
 * than the problem.
 */
const splitRow = (line: string): string[] => {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ } else { quoted = false }
      } else field += char
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      out.push(field); field = ''
    } else field += char
  }
  out.push(field)
  return out
}

/** Column aliases, so a file exported from somewhere else still lands. */
const HEADER_ALIASES: Record<string, keyof FanImportEntry> = {
  external_id: 'external_id',
  externalid: 'external_id',
  id: 'external_id',
  email: 'email',
  'e-mail': 'email',
  email_address: 'email',
  display_name: 'display_name',
  displayname: 'display_name',
  name: 'display_name',
  full_name: 'display_name',
  locale: 'locale',
  language: 'locale',
}

/**
 * Read a CSV into ingest entries.
 *
 * Every row that cannot be ingested is reported with its line number instead of
 * being dropped: an import that silently lands 40 of 50 rows is worse than one
 * that refuses, because nobody goes looking for the missing ten.
 */
export function parseFanCsv(text: string): FanCsvParse {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/).filter(line => line.trim().length > 0)
  if (lines.length === 0) return { entries: [], skipped: [], ignoredColumns: [] }

  const rawHeaders = splitRow(lines[0] ?? '').map(h => h.trim().toLowerCase())
  const mapped = rawHeaders.map(h => HEADER_ALIASES[h])
  const ignoredColumns = rawHeaders.filter((h, i) => !mapped[i] && h.length > 0)

  const index = (field: keyof FanImportEntry) => mapped.indexOf(field)
  const idAt = index('external_id')
  const emailAt = index('email')
  const nameAt = index('display_name')
  const localeAt = index('locale')

  const entries: FanImportEntry[] = []
  const skipped: { row: number; reason: string }[] = []
  const seen = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i] ?? '').map(c => c.trim())
    const at = (position: number) => position >= 0 ? (cells[position] ?? '') : ''
    const email = at(emailAt)
    // The ingest contract keys on `external_id`. A file that carries only
    // emails is the common case, so the email doubles as the identity rather
    // than the import being refused for a column nobody exports.
    const externalId = at(idAt) || email
    if (!externalId) {
      skipped.push({ row: i + 1, reason: 'no external_id and no email' })
      continue
    }
    if (seen.has(externalId)) {
      skipped.push({ row: i + 1, reason: `duplicate of an earlier row (${externalId})` })
      continue
    }
    seen.add(externalId)
    const entry: FanImportEntry = { external_id: externalId }
    if (email) entry.email = email
    const name = at(nameAt)
    if (name) entry.display_name = name
    const locale = at(localeAt)
    if (locale) entry.locale = locale
    entries.push(entry)
  }

  return { entries, skipped, ignoredColumns }
}
