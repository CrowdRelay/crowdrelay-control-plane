import { For, Show, createComputed, createSignal, createUniqueId, on } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { Mail, Plus } from 'lucide-solid'
import { ApiError } from '../lib/api'
import { capability, capabilityAction } from '../lib/capabilities'
import { fillPath, surface } from '../lib/surface'
import { formatTimestamp } from '../lib/format'
import type { AudienceSegment } from '../lib/types'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { SectionFailureCard } from './SectionFailureCard'
import { SkeletonRows } from './Skeleton'
import { confirmAction } from './Dialog'
import { segmentSizeQuery } from './SegmentPanel'
import { Alert } from './app/alert'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { FormDrawer } from './app/form-drawer'
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from './app/radio-group'
import { toast } from './app/toast'
import { EmptyState } from './ui/empty-state'
import { Field } from './ui/field'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import { Textarea } from './ui/textarea'
import { Pill, type Tone } from './ui/dash'

// Messages to a segment of the band's own fans — the segments above are who,
// this is what they are told and when. A draft does nothing; scheduling is the
// outward act, so it says how many fans it reaches before it is confirmed.
// Counts come back from the sender once it ran: recipients, delivered,
// failed — absent until then, not 0.

type FanMessage = {
  id: string
  slug: string
  name: string
  channel: 'email' | 'push' | 'in_app'
  segment_slug: string
  template_key: string
  subject: string | null
  status: 'draft' | 'scheduled' | 'completed' | 'cancelled'
  scheduled_at: string | null
  recipient_count: number | null
  delivered_count: number | null
  failed_count: number | null
  completed_at: string | null
}

const CHANNELS = [
  { value: 'email', label: 'Email', hint: 'To their inbox' },
  { value: 'push', label: 'Push', hint: 'To their phone' },
  { value: 'in_app', label: 'In-app', hint: 'Inside the fan app' },
] as const
const channelLabel = (raw: string) => CHANNELS.find(c => c.value === raw)?.label ?? raw.replaceAll('_', ' ')

const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'muted' },
  scheduled: { label: 'Scheduled', tone: 'accent' },
  completed: { label: 'Sent', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}
const status = (raw: string) => STATUS[raw] ?? { label: raw.replaceAll('_', ' '), tone: 'muted' as Tone }

/// Upstream's campaign slug: lowercase letters, digits, `-` and `_`, a letter
/// or digit first, at most 128 characters.
const SLUG_PATTERN = '[a-z0-9][a-z0-9_\\-]*'
const slugify = (text: string) =>
  text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128)

/// `datetime-local` wants local time without a zone.
const localInputValue = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

type Draft = { segment: string; channel: string; name: string; slug: string; subject: string; template: string; values: string }
const blankDraft = (segment = ''): Draft => ({ segment, channel: 'email', name: '', slug: '', subject: '', template: '', values: '' })

export function FanMessagesPanel(props: {
  slug: string
  segments: AudienceSegment[]
  /** A segment to draft for — set from a Segments row; `''` opens it blank. */
  draftFor?: string | null
  onDraftClose?: () => void
}) {
  const queryClient = useQueryClient()
  const messages = useQuery(() => ({
    queryKey: ['surface', props.slug, 'fan-messages'],
    queryFn: () => surface.read<FanMessage[]>(props.slug, capability('communications').read!.path),
    staleTime: 30_000,
    retry: 1,
  }))
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'fan-messages'] })
  const segmentName = (slug: string) => (props.segments ?? []).find(s => s.slug === slug)?.name ?? slug.replaceAll('-', ' ')
  const active = () => (props.segments ?? []).filter(s => s.active)

  // ── Draft ──────────────────────────────────────────────────────────────
  const [drafting, setDrafting] = createSignal(false)
  const [draft, setDraft] = createSignal<Draft>(blankDraft())
  const [slugEdited, setSlugEdited] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [failure, setFailure] = createSignal<unknown>(null)
  const [valuesError, setValuesError] = createSignal<string>()
  const openDraft = (segment = '') => {
    setDraft(blankDraft(segment))
    setSlugEdited(false)
    setFailure(null)
    setValuesError(undefined)
    setDrafting(true)
  }
  // A Segments row's "Message" opens the drawer with that segment chosen.
  createComputed(on(() => props.draftFor, segment => { if (segment != null) openDraft(segment) }))
  const closeDraft = (open: boolean) => { setDrafting(open); if (!open) props.onDraftClose?.() }

  const update = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(current => {
    const next = { ...current, [field]: value }
    // The short name follows the name until someone types their own.
    if (field === 'name' && !slugEdited()) next.slug = slugify(value)
    return next
  })
  const segmentSize = useQuery(() => ({ ...segmentSizeQuery(props.slug, draft().segment), enabled: drafting() && draft().segment !== '' }))

  const parsedValues = (): Record<string, unknown> | string => {
    const text = draft().values.trim()
    if (!text) return {}
    try {
      const value = JSON.parse(text)
      return value && typeof value === 'object' && !Array.isArray(value) ? value : 'Template values must be a JSON object, in curly braces.'
    } catch {
      return 'Template values aren’t valid JSON. Check the quotes and commas.'
    }
  }
  // Field rules show under their own field, not in the card pinned above the
  // footer — that card covered the very field it was about.
  let valuesInput: HTMLTextAreaElement | undefined
  let slugInput: HTMLInputElement | undefined
  const slugTaken = () => {
    const slug = draft().slug.trim()
    return slug !== '' && (messages.data ?? []).some(m => m.slug === slug)
  }
  const submitDraft = () => {
    if (slugTaken()) { slugInput?.focus(); return }
    const values = parsedValues()
    if (typeof values === 'string') { setValuesError(values); valuesInput?.focus(); return }
    void createDraft()
  }
  const createDraft = async () => {
    const d = draft()
    setSaving(true)
    setFailure(null)
    try {
      await surface.write(props.slug, 'POST', capabilityAction('communications', 'Draft a campaign').path, {
        slug: d.slug.trim(),
        name: d.name.trim(),
        channel: d.channel,
        segment_slug: d.segment,
        template_key: d.template.trim(),
        subject: d.subject.trim() || undefined,
        content: parsedValues(),
      })
      toast.success('Message drafted. Nothing is sent until you schedule it.')
      closeDraft(false)
      refresh()
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.status === 409 ? 'A message with this short name already exists. Change the short name and try again.'
        : error instanceof ApiError && error.status === 404 ? 'That segment is no longer active. Choose another segment.'
        : error,
      )
    } finally {
      setSaving(false)
    }
  }

  // ── Schedule ───────────────────────────────────────────────────────────
  const [scheduling, setScheduling] = createSignal<FanMessage | null>(null)
  const [sendAt, setSendAt] = createSignal('')
  const [scheduleFailure, setScheduleFailure] = createSignal<unknown>(null)
  const [scheduleSaving, setScheduleSaving] = createSignal(false)
  const scheduleSize = useQuery(() => ({ ...segmentSizeQuery(props.slug, scheduling()?.segment_slug ?? ''), enabled: scheduling() !== null }))
  const openSchedule = (m: FanMessage) => {
    setSendAt(localInputValue(new Date(Date.now() + 60 * 60_000)))
    setScheduleFailure(null)
    setScheduling(m)
  }
  const validateSchedule = () => new Date(sendAt()).getTime() < Date.now() - 60_000 ? 'Choose a time from now on. A send can’t be scheduled in the past.' : undefined
  const schedule = async () => {
    const m = scheduling()
    if (!m) return
    setScheduleSaving(true)
    setScheduleFailure(null)
    try {
      await surface.write(props.slug, 'POST', fillPath(capabilityAction('communications', 'Schedule').path, { campaign_id: m.id })!, {
        scheduled_at: new Date(sendAt()).toISOString(),
      })
      toast.success(`Scheduled for ${formatTimestamp(new Date(sendAt()).toISOString())}`)
      setScheduling(null)
      refresh()
    } catch (error) {
      setScheduleFailure(error instanceof ApiError && error.status === 409 ? 'This message was already scheduled or cancelled. Close this and check the table.' : error)
    } finally {
      setScheduleSaving(false)
    }
  }

  // ── Cancel ─────────────────────────────────────────────────────────────
  const [cancelling, setCancelling] = createSignal<string | null>(null)
  const cancel = async (m: FanMessage) => {
    const ok = await confirmAction({
      title: `Cancel “${m.subject ?? m.name}”?`,
      body: m.status === 'scheduled'
        ? `It won't be sent to ${segmentName(m.segment_slug)}. You can't undo this, so draft it again to send it later.`
        : `The draft is closed for good. You can't undo this.`,
      confirmLabel: 'Cancel message',
      cancelLabel: 'Keep it',
      destructive: true,
    })
    if (!ok) return
    setCancelling(m.id)
    try {
      await surface.write(props.slug, 'POST', fillPath(capabilityAction('communications', 'Cancel').path, { campaign_id: m.id })!)
      toast.success('Message cancelled')
      refresh()
    } catch (error) {
      toast.error("Couldn't cancel the message", error)
    } finally {
      setCancelling(null)
    }
  }

  const columns: ColumnDef<FanMessage, any>[] = [
    {
      id: 'message', header: 'Message', accessorFn: m => m.subject ?? m.name, meta: { class: 'min-w-56' },
      cell: c => <div class="max-w-md">
        <span class="font-medium text-foreground text-pretty">{c.row.original.subject ?? c.row.original.name}</span>
        <Show when={c.row.original.subject}><span class="block text-xs text-muted-foreground">{c.row.original.name}</span></Show>
      </div>,
    },
    { id: 'to', header: 'To', accessorFn: m => segmentName(m.segment_slug), cell: c => segmentName(c.row.original.segment_slug) },
    { id: 'channel', header: 'Channel', accessorFn: m => channelLabel(m.channel), meta: { class: 'whitespace-nowrap' }, cell: c => channelLabel(c.row.original.channel) },
    {
      id: 'status', header: 'Status', accessorFn: m => status(m.status).label, meta: { class: 'whitespace-nowrap' },
      cell: c => <Pill tone={status(c.row.original.status).tone}>{status(c.row.original.status).label}</Pill>,
    },
    {
      id: 'when', header: 'When', accessorFn: m => m.completed_at ?? m.scheduled_at ?? '', meta: { class: 'whitespace-nowrap' },
      cell: c => {
        const m = c.row.original
        return <Show when={m.completed_at ?? m.scheduled_at} fallback={<span class="text-muted-foreground">Not scheduled</span>}>
          {formatTimestamp(m.completed_at ?? m.scheduled_at)}
        </Show>
      },
    },
    {
      id: 'delivered', header: 'Delivered', accessorFn: m => m.delivered_count ?? -1, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => {
        const m = c.row.original
        return <Show when={m.recipient_count != null} fallback={<span class="text-muted-foreground">—</span>}>
          {(m.delivered_count ?? 0).toLocaleString()} of {m.recipient_count!.toLocaleString()}
          <Show when={(m.failed_count ?? 0) > 0}><span class="block text-xs text-error-foreground">{m.failed_count!.toLocaleString()} failed</span></Show>
        </Show>
      },
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false, meta: { class: 'w-px whitespace-nowrap text-right' },
      cell: c => {
        const m = c.row.original
        const name = m.subject ?? m.name
        return <div class="flex justify-end gap-1">
          <Show when={m.status === 'draft'}>
            <Button variant="outline" size="sm" writes onClick={() => openSchedule(m)}>Schedule<span class="sr-only"> {name}</span></Button>
          </Show>
          <Show when={m.status === 'draft' || m.status === 'scheduled'}>
            <Button variant="destructive-ghost" size="sm" writes disabled={cancelling() === m.id} onClick={() => void cancel(m)}>Cancel<span class="sr-only"> {name}</span></Button>
          </Show>
        </div>
      },
    },
  ]

  const draftButton = () => (
    <Button size="sm" writes onClick={() => openDraft()}>
      <Plus aria-hidden="true" /> Draft a message
    </Button>
  )
  const channelLabelId = createUniqueId()

  return (
    <Section
      title="Messages to fans"
      icon={<SectionIcon name="mail" />}
      count={messages.data?.length}
      description="What a segment is told, on which channel, and when. Nothing is sent until you schedule it."
      action={draftButton()}
    >
      <Show when={!messages.error} fallback={
        <SectionFailureCard error={messages.error} title="Couldn't load your messages" onRetry={() => void messages.refetch()} />
      }>
        <Show when={messages.data} fallback={<SkeletonRows count={3} />}>
          <DataTable
            data={messages.data!}
            columns={columns}
            getRowId={m => m.id}
            pageSize={8}
            searchText={m => [m.subject, m.name, segmentName(m.segment_slug), channelLabel(m.channel), status(m.status).label].filter(Boolean).join(' ')}
            searchPlaceholder="Search messages"
            empty={<EmptyState icon={<Mail />} label="No messages yet" hint="Draft one for a segment. Nothing is sent until you schedule it.">
              <Button variant="outline" size="sm" writes onClick={() => openDraft()}><Plus aria-hidden="true" /> Draft a message</Button>
            </EmptyState>}
          />
        </Show>
      </Show>

      <FormDrawer
        open={drafting()}
        onOpenChange={closeDraft}
        size="lg"
        title="Draft a message"
        description="Saved as a draft. Nothing is sent until you schedule it."
        submitLabel="Save draft"
        pendingLabel="Saving…"
        pending={saving()}
        error={failure()}
        errorTitle="Couldn't save the draft"
        onSubmit={submitDraft}
      >
        <Field
          label="Who it goes to"
          hint={draft().segment
            ? <Show when={segmentSize.data != null} fallback="Counting the fans in this segment…">About {segmentSize.data?.toLocaleString()} fans right now.</Show>
            : 'Only active segments can be messaged.'}
        >
          <NativeSelect required value={draft().segment} onChange={e => update('segment', e.currentTarget.value)}>
            <option value="">Choose a segment…</option>
            <For each={active()}>{s => <option value={s.slug}>{s.name}</option>}</For>
          </NativeSelect>
        </Field>

        <div class="flex flex-col gap-1.5">
          <span id={channelLabelId} class="text-sm font-medium leading-none text-foreground">Channel</span>
          <RadioGroup
            aria-labelledby={channelLabelId}
            name="channel"
            value={draft().channel}
            onChange={value => update('channel', value)}
            class="grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            <For each={CHANNELS}>{c => (
              <RadioGroupItem value={c.value} class="items-start space-x-0 gap-2.5 rounded-md border border-border p-3 has-[[data-checked]]:border-primary">
                <RadioGroupItemLabel class="flex flex-col gap-1">
                  {c.label}
                  <span class="text-xs font-normal text-muted-foreground">{c.hint}</span>
                </RadioGroupItemLabel>
              </RadioGroupItem>
            )}</For>
          </RadioGroup>
        </div>

        <Field label="Name" hint="For your team. Fans don't see it.">
          <Input required maxlength={160} autocomplete="off" placeholder="B90 showcase reminder" value={draft().name} onInput={e => update('name', e.currentTarget.value)} />
        </Field>
        <Field
          label="Short name"
          hint="Lowercase letters, numbers, - or _. Filled in from the name; it must be unique."
          error={slugTaken() ? 'Another message already uses this short name. Change it.' : undefined}
        >
          <Input
            ref={slugInput}
            aria-invalid={slugTaken() ? 'true' : undefined}
            required maxlength={128} pattern={SLUG_PATTERN} title="Lowercase letters, numbers, - or _, starting with a letter or number"
            autocomplete="off" autocapitalize="off" spellcheck={false} class="font-mono"
            placeholder="b90-showcase-reminder"
            value={draft().slug}
            onInput={e => { setSlugEdited(true); update('slug', e.currentTarget.value) }}
          />
        </Field>
        <Field label="Subject" note="Optional" hint={draft().channel === 'email' ? 'The line fans see in their inbox.' : 'Shown as the title where the channel has one.'}>
          <Input maxlength={240} autocomplete="off" placeholder="See you at B90 on Friday" value={draft().subject} onInput={e => update('subject', e.currentTarget.value)} />
        </Field>
        <Field label="Template" hint="The key of the template the sender fills in and sends.">
          <Input required maxlength={160} autocomplete="off" autocapitalize="off" spellcheck={false} class="font-mono" placeholder="show-reminder" value={draft().template} onInput={e => update('template', e.currentTarget.value)} />
        </Field>
        <Field label="Template values" note="Optional" error={valuesError()} hint={'A JSON object the template fills in, such as {"venue": "B90"}. Leave empty for none.'}>
          <Textarea
            ref={valuesInput}
            aria-invalid={valuesError() ? 'true' : undefined}
            rows={4} spellcheck={false} class="font-mono text-xs"
            value={draft().values}
            onInput={e => { setValuesError(undefined); update('values', e.currentTarget.value) }}
          />
        </Field>
      </FormDrawer>

      <FormDrawer
        open={scheduling() !== null}
        onOpenChange={open => { if (!open) setScheduling(null) }}
        title="Schedule the send"
        description={<Show when={scheduling()}>{m => <>“{m().subject ?? m().name}” by {channelLabel(m().channel).toLowerCase()} to {segmentName(m().segment_slug)}.</>}</Show>}
        submitLabel="Schedule send"
        pendingLabel="Scheduling…"
        pending={scheduleSaving()}
        validate={validateSchedule}
        error={scheduleFailure()}
        errorTitle="Couldn't schedule the send"
        onSubmit={() => void schedule()}
      >
        <Field label="Send at" hint="Your local time.">
          <Input required type="datetime-local" min={localInputValue(new Date())} value={sendAt()} onInput={e => setSendAt(e.currentTarget.value)} />
        </Field>
        <Alert tone="warning" title="This sends to real fans">
          <Show when={scheduleSize.data != null} fallback="Everyone in the segment at send time gets it.">
            About {scheduleSize.data?.toLocaleString()} fans get it. You can cancel until it goes out.
          </Show>
        </Alert>
      </FormDrawer>
    </Section>
  )
}
