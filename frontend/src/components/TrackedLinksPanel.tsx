import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { Check, Copy, Plus } from 'lucide-solid'
import { api } from '../lib/api'
import { capability, capabilityAction } from '../lib/capabilities'
import { httpUrl, tokenLabel } from '../lib/format'
import { surface } from '../lib/surface'
import { SectionIcon } from './SectionIcon'
import { SectionFailureCard } from './SectionFailureCard'
import { SkeletonRows } from './Skeleton'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { FormDrawer } from './app/form-drawer'
import { toast } from './app/toast'
import { Field, FieldGrid } from './ui/field'
import { Input } from './ui/input'
import { EmptyState } from './ui/empty-state'
import { Pill } from './ui/dash'

// Tracked links: the short link a post carries so a click can be followed to
// the signup it became. A post published by hand with the bare destination
// can never be credited with the fans it brought — this is where the link
// that can be credited comes from.

type TrackedLink = {
  id: string
  slug: string
  destination_url: string
  active: boolean
  channel_source: string | null
  channel_community: string | null
  channel_creative: string | null
}

/// The hook scorecard's per-link fans, 90 days. Read from the same cache
/// entry the "What held attention" page fills.
type FanLink = { slug: string; fans: number; stayed: number }

type Filter = 'all' | 'live' | 'off'
const FILTER_LABEL: Record<Filter, string> = { all: 'All', live: 'Live', off: 'Off' }
const matches = (link: TrackedLink, filter: Filter) =>
  filter === 'all' ? true : filter === 'live' ? link.active : !link.active

/// Platform names as the platforms write them — "Tiktok" reads wrong.
const BRANDS: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', spotify: 'Spotify', bandcamp: 'Bandcamp', reddit: 'Reddit' }
const channelName = (raw: string) => BRANDS[raw.toLowerCase()] ?? tokenLabel(raw)

const dash = <span class="text-muted-foreground">—</span>

/// Upstream's `SmartLinkSlug`: 1–128 characters, a letter or digit first,
/// then letters, digits, `-` and `_`. Checked here so the person hears the
/// rule beside the field instead of a bare 400 after the round trip.
const SLUG_PATTERN = '[A-Za-z0-9][A-Za-z0-9_\\-]*'
const SLUG_RULE = 'Use letters, numbers, - or _, starting with a letter or number.'

/// Channels a band posts to, offered as suggestions — any other is accepted.
const CHANNEL_SUGGESTIONS = ['instagram', 'tiktok', 'facebook', 'youtube', 'reddit', 'bandcamp', 'spotify', 'telegram', 'discord', 'newsletter']

/// What the create form holds before it is sent.
type Draft = { destination: string; slug: string; channel: string; community: string; creative: string }
const BLANK: Draft = { destination: '', slug: '', channel: '', community: '', creative: '' }

export function TrackedLinksPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const links = useQuery(() => ({
    queryKey: ['surface', props.slug, 'tracked-links'],
    queryFn: () => surface.read<{ items: TrackedLink[] }>(props.slug, capability('smart-links').read!.path),
    staleTime: 60_000,
    retry: 1,
  }))
  // Fans per link come from the hook scorecard; a failure there leaves the
  // column blank rather than taking the links down with it.
  const hooks = useQuery(() => ({
    queryKey: ['surface', props.slug, 'content-hooks'],
    queryFn: () => surface.read<{ links?: FanLink[] }>(props.slug, capability('content-hooks').read!.path),
    staleTime: 5 * 60_000,
    retry: 1,
  }))
  // The click is counted where CrowdRelay answers `/v1/go/{slug}` — the
  // tenant's public API. Same `['tenant', slug]` observer as every reader.
  const tenant = useQuery(() => ({
    queryKey: ['tenant', props.slug],
    queryFn: () => api.tenant(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const apiBase = () => tenant.data?.crowdrelayBaseUrl?.replace(/\/+$/, '') ?? null
  const shareUrl = (link: TrackedLink) => apiBase() ? `${apiBase()}/v1/go/${link.slug}` : null

  const fansBySlug = () => {
    const out = new Map<string, FanLink>()
    for (const l of hooks.data?.links ?? []) {
      const seen = out.get(l.slug)
      out.set(l.slug, { slug: l.slug, fans: (seen?.fans ?? 0) + l.fans, stayed: (seen?.stayed ?? 0) + l.stayed })
    }
    return out
  }

  const [copied, setCopied] = createSignal<string | null>(null)
  const copy = async (link: TrackedLink) => {
    const url = shareUrl(link)
    if (!url) return
    // The URL renders beside the button, so a denied clipboard stays
    // recoverable by hand — the same floor as SharedNightPanel.
    try {
      await navigator.clipboard.writeText(url)
      setCopied(link.id)
      setTimeout(() => setCopied(current => current === link.id ? null : current), 2000)
    } catch {}
  }

  const [show, setShow] = createSignal<Filter>('all')
  const all = () => links.data?.items ?? []
  const count = (filter: Filter) => all().filter(link => matches(link, filter)).length
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'tracked-links'] })

  // Creating a link is a side task with its own lifecycle, so it opens in
  // the console's FormDrawer rather than expanding inside the table.
  const [adding, setAdding] = createSignal(false)
  const [draft, setDraft] = createSignal<Draft>(BLANK)
  const [saving, setSaving] = createSignal(false)
  const [failure, setFailure] = createSignal<unknown>(null)
  const set = (field: keyof Draft) => (event: { currentTarget: HTMLInputElement }) =>
    setDraft(current => ({ ...current, [field]: event.currentTarget.value }))
  const startAdding = () => { setDraft(BLANK); setFailure(null); setAdding(true) }

  // Upstream upserts on the name: reusing one silently repoints that link,
  // and every post already carrying it would start sending fans elsewhere.
  const taken = () => {
    const slug = draft().slug.trim()
    return slug ? all().find(link => link.slug === slug) : undefined
  }
  const validate = () => {
    if (!draft().destination.trim().startsWith('https://')) return 'Use an address that starts with https://, so the click stays secure.'
    const existing = taken()
    if (existing) return `“${existing.slug}” already points to ${existing.destination_url}. Choose another name, so the posts that carry it keep working.`
    return undefined
  }
  const createLink = async () => {
    const d = draft()
    const optional = (value: string) => value.trim() || undefined
    setSaving(true)
    setFailure(null)
    try {
      await surface.write(props.slug, 'POST', capabilityAction('smart-links', 'Create a link').path, {
        slug: d.slug.trim(),
        destination_url: d.destination.trim(),
        // Lowercase, so "Instagram" and "instagram" count as one channel.
        channel_source: optional(d.channel)?.toLowerCase(),
        channel_community: optional(d.community),
        channel_creative: optional(d.creative),
      })
      toast.success('Tracked link created')
      setAdding(false)
      refresh()
    } catch (error) {
      setFailure(error)
    } finally {
      setSaving(false)
    }
  }
  const preview = () => `${apiBase() ?? ''}/v1/go/${draft().slug.trim() || 'your-link-name'}`

  const addButton = () => (
    <Button size="sm" writes onClick={startAdding}>
      <Plus aria-hidden="true" /> New tracked link
    </Button>
  )

  const columns: ColumnDef<TrackedLink, any>[] = [
    {
      id: 'link', header: 'Link to share', accessorFn: l => l.slug, meta: { class: 'min-w-40' },
      cell: c => {
        const link = c.row.original
        return <div class="flex items-start gap-2">
          <span class="min-w-0 font-mono text-xs text-foreground [overflow-wrap:anywhere]">/v1/go/{link.slug}</span>
          <Show when={shareUrl(link)}>
            <Button variant="ghost" size="icon" class="-my-1.5 size-7 shrink-0" aria-label={`Copy link ${link.slug}`} title={shareUrl(link)!} onClick={() => void copy(link)}>
              <Show when={copied() === link.id} fallback={<Copy aria-hidden="true" />}><Check aria-hidden="true" /></Show>
            </Button>
          </Show>
        </div>
      },
    },
    {
      id: 'status', header: 'Status', accessorFn: l => l.active ? 'Live' : 'Off', meta: { class: 'whitespace-nowrap' },
      cell: c => <Pill tone={c.row.original.active ? 'good' : 'muted'}>{c.row.original.active ? 'Live' : 'Off'}</Pill>,
    },
    {
      id: 'destination', header: 'Goes to', accessorFn: l => l.destination_url, meta: { class: 'min-w-48 max-w-xs' },
      cell: c => <Show when={httpUrl(c.row.original.destination_url)} fallback={<span class="text-xs text-muted-foreground [overflow-wrap:anywhere]">{c.row.original.destination_url}</span>}>{url =>
        <a class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground [overflow-wrap:anywhere]" href={url()} target="_blank" rel="noreferrer">
          {url()}<span class="sr-only"> (opens in a new tab)</span>
        </a>
      }</Show>,
    },
    {
      id: 'channel', header: 'Channel', accessorFn: l => l.channel_source ?? '', meta: { class: 'min-w-32' },
      cell: c => {
        const link = c.row.original
        return <Show when={link.channel_source || link.channel_community || link.channel_creative} fallback={dash}>
          <span class="block text-foreground">{link.channel_source ? channelName(link.channel_source) : 'No channel'}</span>
          <Show when={link.channel_community}><span class="block text-xs text-muted-foreground">Community: {link.channel_community}</span></Show>
          <Show when={link.channel_creative}><span class="block text-xs text-muted-foreground">Creative: {link.channel_creative}</span></Show>
        </Show>
      },
    },
    {
      id: 'fans', header: 'Fans, 90d', accessorFn: l => fansBySlug().get(l.slug)?.fans ?? -1, meta: { numeric: true, label: 'Fans', class: 'whitespace-nowrap' },
      cell: c => <Show when={fansBySlug().get(c.row.original.slug)} fallback={dash}>{f => <>
        <span class={f().fans > 0 ? 'font-medium text-success-foreground' : 'text-muted-foreground'}>{f().fans.toLocaleString()}</span>
        <Show when={f().fans > 0}><span class="block text-xs text-muted-foreground">{f().stayed.toLocaleString()} stayed</span></Show>
      </>}</Show>,
    },
  ]

  return (
    <Show when={!links.error} fallback={
      <SectionFailureCard error={links.error} title="Couldn't load your tracked links" onRetry={() => void links.refetch()} />
    }>
      <Show when={links.data} fallback={<SkeletonRows count={5} />}>
        <section class="rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="Tracked links">
          <span class="sr-only" role="status">{copied() ? 'Link copied' : ''}</span>
          <Show when={all().length > 0 && tenant.isSuccess}>
            <p class="mb-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              <Show when={apiBase()} fallback="This band has no public API address yet, so only the path is shown. Set it on the tenant page to get links you can copy.">
                {base => <>Every link starts with <span class="font-mono text-foreground">{base()}</span>. Copy puts the full address on your clipboard.</>}
              </Show>
            </p>
          </Show>
          <DataTable
            data={all().filter(link => matches(link, show()))}
            columns={columns}
            getRowId={l => l.id}
            bordered={false}
            initialSorting={[{ id: 'fans', desc: true }]}
            searchText={l => [l.slug, l.destination_url, l.channel_source, l.channel_community, l.channel_creative].filter(Boolean).join(' ')}
            searchPlaceholder="Search by link, destination or channel"
            actions={all().length > 0 ? addButton() : undefined}
            toolbar={
              <Show when={count('off') > 0}>
                <div role="group" aria-label="Status" class="flex flex-wrap items-center gap-1">
                  <For each={['all', 'live', 'off'] as Filter[]}>{f => (
                    <Button variant={show() === f ? 'secondary' : 'ghost'} size="sm" aria-pressed={show() === f} onClick={() => setShow(f)}>
                      {FILTER_LABEL[f]}
                      <span class="tabular-nums text-muted-foreground">{count(f)}</span>
                    </Button>
                  )}</For>
                </div>
              </Show>
            }
            empty={all().length === 0
              ? <EmptyState icon={<SectionIcon name="link" />} label="No tracked links yet" hint="Make one for your next post, so the fans it brings are credited to that post.">
                  {addButton()}
                </EmptyState>
              : <EmptyState label="Nothing here" hint="No link matches this filter.">
                  <Button variant="outline" size="sm" onClick={() => setShow('all')}>Show every link</Button>
                </EmptyState>}
          />
        </section>

        <FormDrawer
          open={adding()}
          onOpenChange={setAdding}
          title="New tracked link"
          description="Share it in a post instead of the bare address, and the fans it brings are credited to that post."
          submitLabel="Create link"
          pendingLabel="Creating…"
          pending={saving()}
          validate={validate}
          error={failure()}
          errorTitle="Couldn't create the link"
          onSubmit={() => void createLink()}
        >
          <Field label="Where it goes" hint="The page fans land on when they click — your Bandcamp, a ticket page, a signup.">
            <Input
              required type="url" inputmode="url" autocomplete="url" spellcheck={false}
              pattern="https://.+" title="An address that starts with https://"
              placeholder="https://"
              value={draft().destination}
              onInput={set('destination')}
            />
          </Field>
          <Field
            label="Link name"
            hint={<>{SLUG_RULE} Your link: <span class="font-mono text-foreground [overflow-wrap:anywhere]">{preview()}</span></>}
            error={taken() ? `Already used for ${taken()!.destination_url}. Choose another name.` : undefined}
          >
            <Input
              required maxlength={128} pattern={SLUG_PATTERN} title={SLUG_RULE}
              autocomplete="off" autocapitalize="off" spellcheck={false}
              class="font-mono"
              aria-invalid={taken() ? 'true' : undefined}
              placeholder="spring-tour-teaser"
              value={draft().slug}
              onInput={set('slug')}
            />
          </Field>

          <fieldset class="flex flex-col gap-4 border-t border-border pt-4">
            <legend class="float-left mb-1 w-full">
              <span class="block text-sm font-medium text-foreground">Where you'll share it</span>
              <span class="block text-xs font-normal text-muted-foreground">Fill these in and the fans it brings are split by channel, community and post.</span>
            </legend>
            <Field label="Channel" note="Optional" hint="Pick a suggestion or type your own.">
              <Input
                type="text" list="tracked-link-channels" autocomplete="off" autocapitalize="off"
                placeholder="instagram"
                value={draft().channel}
                onInput={set('channel')}
              />
              <datalist id="tracked-link-channels">
                <For each={CHANNEL_SUGGESTIONS}>{c => <option value={c}>{channelName(c)}</option>}</For>
              </datalist>
            </Field>
            <FieldGrid min="160px">
              <Field label="Community" note="Optional" hint="The group, subreddit or account.">
                <Input type="text" autocomplete="off" placeholder="r/poland" value={draft().community} onInput={set('community')} />
              </Field>
              <Field label="Creative" note="Optional" hint="Which post or version, so each gets its own row.">
                <Input type="text" autocomplete="off" placeholder="teaser-a" value={draft().creative} onInput={set('creative')} />
              </Field>
            </FieldGrid>
          </fieldset>
        </FormDrawer>
      </Show>
    </Show>
  )
}
