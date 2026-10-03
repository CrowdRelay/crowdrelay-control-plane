import { For, Show, createResource, createSignal } from 'solid-js'
import { GitCommitHorizontal, History } from 'lucide-solid'
import { Button } from '~/components/app/button'
import { Pill, type Tone } from '~/components/ui/dash'
import { Skeleton } from '~/components/ui/skeleton'
import { cn } from '~/lib/cn'

/**
 * "Last updated" and the changelog on every style-guide page, read from git
 * by the dev server (dev/styleguide-history-plugin.ts). A page's history is
 * the commits that touched the files it documents — so updating a component
 * updates its page without anyone writing a changelog entry.
 */

export type Commit = { hash: string; short: string; date: string; author: string; subject: string; files: string[] }
export type PageHistory = { commits: Commit[]; dirty: string[]; repoUrl: string | null }

const cache = new Map<string, Promise<PageHistory>>()

function fetchHistory(files: string[]): Promise<PageHistory> {
  const key = [...files].sort().join(',')
  if (!cache.has(key)) {
    cache.set(key, fetch(`/__styleguide/history?files=${encodeURIComponent(key)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .catch(error => { cache.delete(key); throw error }))
  }
  return cache.get(key)!
}

export function usePageHistory(files: () => string[]) {
  const [history] = createResource(() => (files().length ? files() : null), fetchHistory)
  return history
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const formatDate = (iso: string) => dateFmt.format(new Date(iso))

export function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.round(days / 30)
  return months < 12 ? `${months} month${months === 1 ? '' : 's'} ago` : `${Math.round(months / 12)} year${months < 18 ? '' : 's'} ago`
}

// Conventional-commit prefix → a readable kind. `feat(console): …` → Feature.
const KINDS: Record<string, { label: string; tone: Tone }> = {
  feat: { label: 'Feature', tone: 'accent' },
  fix: { label: 'Fix', tone: 'good' },
  style: { label: 'Style', tone: 'muted' },
  refactor: { label: 'Refactor', tone: 'muted' },
  perf: { label: 'Performance', tone: 'muted' },
  docs: { label: 'Docs', tone: 'muted' },
  test: { label: 'Tests', tone: 'muted' },
  chore: { label: 'Chore', tone: 'muted' },
  revert: { label: 'Revert', tone: 'warn' },
}

export function parseSubject(subject: string): { kind: { label: string; tone: Tone } | null; scope: string | null; text: string } {
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/)
  if (!m) return { kind: null, scope: null, text: subject }
  const text = m[3]!.replace(/\s*\(#\d+\)$/, '')
  return { kind: KINDS[m[1]!.toLowerCase()] ?? null, scope: m[2] ?? null, text: text.charAt(0).toUpperCase() + text.slice(1) }
}

const shortFile = (f: string) => f.replace(/^components\//, '').replace(/^pages\//, '')

/** Next to the title: "Updated 29 Sep 2026 · 4 days ago". */
export function UpdatedLine(props: { files: string[]; onShowChangelog: () => void }) {
  const history = usePageHistory(() => props.files)
  return (
    <Show when={props.files.length} fallback={<span class="text-xs text-muted-foreground">Not built yet</span>}>
      <Show when={!history.loading} fallback={<Skeleton class="h-4 w-48" />}>
        <Show when={!history.error} fallback={<span class="text-xs text-muted-foreground">History unavailable</span>}>
          <span class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Show when={history()?.commits[0]} fallback={<span>No commits yet</span>}>
              {latest => (
                <button type="button" onClick={() => props.onShowChangelog()} class="inline-flex items-center gap-1.5 rounded-md hover:text-foreground" title={`${latest().short} · ${latest().subject}`}>
                  <History class="size-3.5" aria-hidden="true" />
                  Updated <time datetime={latest().date} class="font-medium text-foreground">{formatDate(latest().date)}</time>
                  <span>· {relativeDays(latest().date)}</span>
                </button>
              )}
            </Show>
            <Show when={history()?.dirty.length}><Pill tone="warn">Uncommitted changes</Pill></Show>
          </span>
        </Show>
      </Show>
    </Show>
  )
}

/** At the foot of the page: every commit to the page's files, newest first. */
export function Changelog(props: { files: string[]; id?: string }) {
  const history = usePageHistory(() => props.files)
  const [all, setAll] = createSignal(false)
  const LIMIT = 8
  const commits = () => history()?.commits ?? []
  const shown = () => (all() ? commits() : commits().slice(0, LIMIT))
  const many = () => props.files.length > 1

  return (
    <section id={props.id} class="scroll-mt-28 border-t border-border pt-8">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-lg font-semibold tracking-tight">Changelog</h2>
        <Show when={commits().length}><span class="text-xs text-muted-foreground">{commits().length}{commits().length === 50 ? '+' : ''} changes · from git</span></Show>
      </div>
      <p class="m-0 mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Every commit that touched the files this page documents. Commit with a clear message and it shows up here.
      </p>

      <Show when={props.files.length} fallback={<p class="m-0 mt-5 text-sm text-muted-foreground">Nothing to show — this component isn’t built yet.</p>}>
        <Show when={!history.loading} fallback={<div class="mt-5 flex flex-col gap-2"><Skeleton class="h-10 w-full" /><Skeleton class="h-10 w-full" /><Skeleton class="h-10 w-2/3" /></div>}>
          <Show when={!history.error} fallback={<p class="m-0 mt-5 text-sm text-muted-foreground">Couldn’t read git history. The changelog needs the Vite dev server running inside the repository.</p>}>
            <ol class="m-0 mt-5 list-none p-0">
              <Show when={history()?.dirty.length}>
                <li class="grid gap-1 border-l-2 border-warning-solid py-3 pl-4 sm:grid-cols-[8rem_1fr] sm:gap-4">
                  <span class="text-xs font-medium text-warning-foreground">Not committed</span>
                  <div class="min-w-0">
                    <p class="m-0 text-sm">Local edits that haven’t been committed yet</p>
                    <div class="mt-1.5 flex flex-wrap gap-1.5"><For each={history()!.dirty}>{f => <code class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{shortFile(f)}</code>}</For></div>
                  </div>
                </li>
              </Show>
              <For each={shown()} fallback={<li class="py-3 text-sm text-muted-foreground">No commits touch these files yet.</li>}>{(c, i) => {
                const s = parseSubject(c.subject)
                return (
                  <li class={cn('grid gap-1 border-l-2 py-3 pl-4 sm:grid-cols-[8rem_1fr] sm:gap-4', i() === 0 && !history()?.dirty.length ? 'border-foreground' : 'border-border')}>
                    <time datetime={c.date} class="text-xs text-muted-foreground tabular-nums" title={new Date(c.date).toLocaleString('en-GB')}>{formatDate(c.date)}</time>
                    <div class="min-w-0">
                      <p class="m-0 flex flex-wrap items-center gap-2 text-sm">
                        <Show when={s.kind}>{k => <Pill tone={k().tone}>{k().label}</Pill>}</Show>
                        <span class="min-w-0">{s.text}</span>
                      </p>
                      <p class="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span class="inline-flex items-center gap-1">
                          <GitCommitHorizontal class="size-3.5" aria-hidden="true" />
                          <Show when={history()?.repoUrl} fallback={<code>{c.short}</code>}>
                            {url => <a href={`${url()}/commit/${c.hash}`} target="_blank" rel="noreferrer" class="font-mono hover:text-foreground hover:underline">{c.short}</a>}
                          </Show>
                        </span>
                        <span>· {c.author}</span>
                        <Show when={s.scope}><span>· {s.scope}</span></Show>
                        <Show when={many() && c.files.length}>
                          <span class="flex flex-wrap gap-1">· <For each={c.files}>{f => <code class="rounded bg-muted px-1 text-xs">{shortFile(f)}</code>}</For></span>
                        </Show>
                      </p>
                    </div>
                  </li>
                )
              }}</For>
            </ol>
            <Show when={commits().length > LIMIT}>
              <Button variant="ghost" size="sm" class="mt-2" onClick={() => setAll(v => !v)}>
                {all() ? 'Show fewer' : `Show all ${commits().length} changes`}
              </Button>
            </Show>
          </Show>
        </Show>
      </Show>
    </section>
  )
}
