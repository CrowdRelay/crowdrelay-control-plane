import { SurfaceAction } from './capabilities/SurfaceAction'
import { capabilityAction } from '../lib/capabilities'
import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { refreshQueries } from '../lib/refresh'
import { humanizeToken } from '../lib/format'
import { errorMessage } from '../lib/format'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { ErrorCard, Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Field, FieldGrid } from './ui/field'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { NativeSelect } from './ui/native-select'
import { Checkbox } from './app/checkbox'
import type { ContentSourceKind, ContentSourceView } from '../lib/types'

const KIND_LABEL: Record<ContentSourceKind, string> = {
  event: 'Event',
  release: 'Release',
  show_completed: 'Past show',
  video: 'Video',
  story: 'Story',
  social_post: 'Band post',
}

const KIND_HINT: Record<ContentSourceKind, string> = {
  video: 'A link to the published video — the brain shares this.',
  release: 'A link to the release — streaming page or video.',
  story: 'A real thing that happened, written the way you would tell it. The writer may retell it but can never extend it.',
  event: 'A show or event worth announcing.',
  show_completed: 'A show that already happened — recap material.',
  social_post: 'A post the band published on an owned account — synced automatically, or file one by hand.',
}

// Events, releases and past shows are news: they stay shareable for a
// short promo window after they happen. Videos and stories are evergreen
// material — the expiry is measured from when the operator last affirmed
// the source, so a back-catalog video or a founding story can always be
// entered. Retirement is the `active` flag, not a date.
const ANCHORED_LIFETIME_DAYS = 45
const EVERGREEN_LIFETIME_DAYS = 365

const isEvergreen = (kind: ContentSourceKind) => kind === 'video' || kind === 'story'

const expiryFor = (kind: ContentSourceKind, occurred: Date): Date =>
  new Date((isEvergreen(kind) ? Date.now() : occurred.getTime()) +
    (isEvergreen(kind) ? EVERGREEN_LIFETIME_DAYS : ANCHORED_LIFETIME_DAYS) * 86400_000)

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// The artifact keys are ContentArtifactKind serde keys — same labels the
// domain's `label()` returns, so the panel reads like the record.
const ARTIFACT_LABEL: Record<string, string> = {
  signal_push: 'Signal push',
  newsletter_block: 'Newsletter block',
  social_feed: 'Social feed',
  social_story: 'Social story',
  live_listing: 'Live listing',
  press_hook: 'Press hook',
  post_show_recap: 'Post-show recap',
}

const sendLabel = (artifact: string) => ARTIFACT_LABEL[artifact] ?? artifact

const sourceUrl = (s: ContentSourceView): string | undefined => {
  const url = s.metadata?.url
  return typeof url === 'string' && url.startsWith('http') ? url : undefined
}

const sourceBody = (s: ContentSourceView): string | undefined => {
  const body = s.metadata?.body
  return typeof body === 'string' && body.length > 0 ? body : undefined
}

const isLive = (s: ContentSourceView) => s.active && new Date(s.expires_at) > new Date()

const dayIso = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10)
}

export function ContentSourcesPanel(props: { slug: string }) {
  const [error, setError] = createSignal<string | null>(null)
  const [adding, setAdding] = createSignal(false)
  const [saving, setSaving] = createSignal(false)

  // When set, the form edits this source instead of creating a new one.
  const [editing, setEditing] = createSignal<ContentSourceView | null>(null)

  const [kind, setKind] = createSignal<ContentSourceKind>('story')
  const [title, setTitle] = createSignal('')
  const [link, setLink] = createSignal('')
  const [body, setBody] = createSignal('')
  const [when, setWhen] = createSignal(new Date().toISOString().slice(0, 10))
  const [shareable, setShareable] = createSignal(true)

  const sources = useQuery(() => ({
    queryKey: ['content-sources', props.slug],
    queryFn: () => api.contentSources(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const needsLink = () => kind() === 'video' || kind() === 'release'
  // A story is nothing without the words; a hand-filed post likewise. Editing
  // a synced post is different — a captionless IG post must not force the
  // operator to invent body text the band never wrote.
  const needsBody = () => kind() === 'story' || (kind() === 'social_post' && !editing())

  const openAdd = () => {
    setEditing(null)
    setKind('story'); setTitle(''); setLink(''); setBody('')
    setWhen(new Date().toISOString().slice(0, 10)); setShareable(true)
    setAdding(a => !a)
  }

  const openEdit = (s: ContentSourceView) => {
    setEditing(s)
    setKind(s.source_kind); setTitle(s.title)
    setLink(sourceUrl(s) ?? ''); setBody(sourceBody(s) ?? '')
    setWhen(dayIso(s.occurred_at)); setShareable(s.active)
    setAdding(true)
    setError(null)
  }

  const submit = async () => {
    setError(null)
    const current = editing()
    const trimmedTitle = title().trim()
    if (!trimmedTitle) { setError('Give it a title — this is what the writer sees.'); return }
    const trimmedLink = link().trim()
    if (needsLink() && !trimmedLink.startsWith('http')) { setError('Paste the full link (https://…).'); return }
    const trimmedBody = body().trim()
    if (needsBody() && !trimmedBody) { setError('Write the story — the writer can only use what is here.'); return }

    const occurred = new Date(`${when()}T12:00:00Z`)
    const expires = expiryFor(kind(), occurred)
    setSaving(true)
    try {
      await api.upsertContentSource(props.slug, {
        ...(current ? { source_id: current.source_id } : {}),
        source_kind: kind(),
        source_key: current?.source_key ?? `panel:${crypto.randomUUID()}`,
        title: trimmedTitle,
        occurred_at: occurred.toISOString(),
        expires_at: expires.toISOString(),
        metadata: {
          // Keep every fact the row already carries (a watcher-written
          // video's video_id, channel_id, published_at) — an edit corrects
          // the link or the story, it does not erase provenance.
          ...(current?.metadata ?? {}),
          // Emptying the field on edit clears the fact, not keeps the old one.
          ...(trimmedLink ? { url: trimmedLink } : current ? { url: null } : {}),
          ...(trimmedBody ? { body: trimmedBody } : current ? { body: null } : {}),
          origin: current && typeof current.metadata?.origin === 'string' ? current.metadata.origin : 'operator_panel',
        },
        // The flag only travels on edit — a create always lands live, an
        // edit leaves it alone unless the operator toggled it.
        ...(current ? { active: shareable() } : {}),
        expected_version: current?.version ?? 0,
      })
      setTitle(''); setLink(''); setBody(''); setEditing(null)
      setAdding(false)
      refreshQueries(['content-sources', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Could not save it. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  return <Section
    title="Real material"
    icon={<SectionIcon name="book-open" />}
    count={sources.data?.length}
    description="Everything the system may say publicly comes from this list. A video link, a release, a story you actually lived. If it is not here, it does not get posted."
    action={
      <Button variant="outline" size="sm" writes onClick={openAdd}>
        {adding() && !editing() ? 'Cancel' : 'Add material'}
      </Button>
    }
  >

    <Show when={error()}><ErrorCard class="mt-3">{error()}</ErrorCard></Show>
    <Show when={sources.error}><ErrorCard class="mt-3">Material list unavailable: {errorMessage(sources.error, 'We could not reach the material list.')}</ErrorCard></Show>

    <Show when={adding()}>
      <div class="mt-4 rounded-lg border border-border bg-background p-4">
        <Show when={editing()}>{(s) =>
          <div class="mb-3 flex items-center justify-between gap-3">
            <span class="text-xs font-medium text-muted-foreground">Editing: {s().title}</span>
            <Checkbox
              class="text-xs text-muted-foreground"
              checked={shareable()}
              onChange={setShareable}
              label="May be shared"
            />
          </div>
        }</Show>
        <FieldGrid min="160px">
          <Field label="Kind">
            <NativeSelect value={kind()} onChange={e => setKind(e.currentTarget.value as ContentSourceKind)}>
              <For each={Object.entries(KIND_LABEL) as [ContentSourceKind, string][]}>{([k, label]) =>
                <option value={k}>{label}</option>
              }</For>
            </NativeSelect>
          </Field>
          <Field label="Title">
            <Input value={title()} onInput={e => setTitle(e.currentTarget.value)} placeholder="What is it called" maxLength={240} />
          </Field>
          <Field label="When" hint={isEvergreen(kind()) ? 'When it happened — the fact date, however old' : 'When it happened or went live'}>
            <Input type="date" value={when()} onInput={e => setWhen(e.currentTarget.value)} />
          </Field>
        </FieldGrid>
        <Show when={needsLink()}>
          <Field class="mt-4" label="Link" hint={KIND_HINT[kind()]}>
            <Input value={link()} onInput={e => setLink(e.currentTarget.value)} placeholder="https://youtu.be/…" />
          </Field>
        </Show>
        <Show when={needsBody()}>
          <Field class="mt-4" label="The story" hint={KIND_HINT[kind()]}>
            <Textarea rows={4} value={body()} onInput={e => setBody(e.currentTarget.value)} placeholder="Tell it plainly — the real version, not the marketing version." />
          </Field>
        </Show>
        <div class="mt-4 flex justify-end gap-2">
          <Show when={editing()}>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setAdding(false) }}>Cancel</Button>
          </Show>
          <Button size="sm" writes disabled={saving()} onClick={() => void submit()}>
            {saving() ? 'Saving…' : editing() ? 'Save changes' : 'Save material'}
          </Button>
        </div>
      </div>
    </Show>

    <Show when={sources.data && sources.data!.length > 0} fallback={
      <Show when={sources.isFetching} fallback={
        <EmptyState label="No material yet" hint="Add the first piece — a video link or a real story — and the writer has something true to say." />
      }>
        <SkeletonRows count={3} />
      </Show>
    }>
      <div class="mt-3 flex flex-col gap-2">
        <For each={sources.data}>{(s) => (
          <div class="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <Badge variant={isLive(s) ? 'success' : 'muted'}>{KIND_LABEL[s.source_kind] ?? humanizeToken(s.source_kind)}</Badge>
                <strong class="truncate text-sm font-semibold text-foreground">{s.title}</strong>
              </div>
              <div class="mt-1 text-xs text-muted-foreground">
                {fmtDate(s.occurred_at)}
                <Show when={sourceUrl(s)}>{(u) => <> · <a class="text-primary hover:underline" href={u()} target="_blank" rel="noreferrer">{u()}</a></>}</Show>
                <Show when={!isLive(s)}> · retired</Show>
              </div>
              <Show when={sourceBody(s)}>{(b) => <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{b()}</p>}</Show>
              <Show when={s.sends.length > 0}>
                <ul class="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                  <For each={s.sends}>{(send) => (
                    <li>
                      {sendLabel(send.artifact)} · {send.emitted_at ? `sent ${fmtDate(send.emitted_at)}` : send.status}
                    </li>
                  )}</For>
                </ul>
              </Show>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1">
              <Button variant="ghost" size="sm" writes onClick={() => openEdit(s)}>Edit</Button>
              {/* A synced post's whole spread — the push to our own fans and
                  one relay per admitted community — answered with one yes,
                  or stopped where it has not run. Per-community gates still
                  apply; this removes only the repeated human ask. */}
              <Show when={s.source_kind === 'social_post' && isLive(s)}>
                <SurfaceAction slug={props.slug} size="xs" variant="ghost" action={capabilityAction('relay-ladder', 'Approve spread')} label="Yes to its whole spread" fixed={{ source_id: s.source_id }} />
                <SurfaceAction slug={props.slug} size="xs" variant="ghost" action={capabilityAction('relay-ladder', 'Revoke spread')} label="Stop its spread" fixed={{ source_id: s.source_id }} />
              </Show>
            </div>
          </div>
        )}</For>
      </div>
    </Show>
  </Section>
}
