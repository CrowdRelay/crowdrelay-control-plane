import { For, Show, createSignal } from 'solid-js'
import { failureLine } from '../lib/errors'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { TenantShowTimelineResponse } from '../lib/types'
import { readOnly } from '../lib/read-only'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { SurfaceAction } from './capabilities/SurfaceAction'
import { capabilityAction } from '../lib/capabilities'

/** The two facts a night needs before the chain can work them: who is on the
 * bill (the crossbill step's only input — no bill, no shared audiences) and
 * who the T+7 report mails besides the band. Both are whole-resource PUTs
 * upstream; the forms edit the stored state, not a draft of it. */

type BillRow = { slug: string; name: string; ticketUrl: string; slugTouched: boolean }

const deriveSlug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

type CrossbillAct = { slug?: string; name?: string; position?: number; ticket_url?: string | null }

function billFromTimeline(timeline: TenantShowTimelineResponse): BillRow[] {
  const step = timeline.steps.find(s => s.key === 'announced')
  const crossbill = step?.detail?.crossbill as { acts?: CrossbillAct[] } | undefined
  return (crossbill?.acts ?? []).map(act => ({
    slug: act.slug ?? '',
    name: act.name ?? '',
    ticketUrl: act.ticket_url ?? '',
    slugTouched: true,
  }))
}

export function ShowSetupPanel(props: { slug: string; eventSlug: string; timeline: TenantShowTimelineResponse }) {
  const queryClient = useQueryClient()
  const [acts, setActs] = createSignal<BillRow[]>(billFromTimeline(props.timeline))
  const [counterpartyName, setCounterpartyName] = createSignal(props.timeline.event.counterparty_name ?? '')
  const [counterpartyEmail, setCounterpartyEmail] = createSignal(props.timeline.event.counterparty_email ?? '')
  const [flash, setFlash] = createSignal('')

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['tenant-show-page', props.slug, props.eventSlug] })
    void queryClient.invalidateQueries({ queryKey: ['tenant-show-timeline', props.slug, props.eventSlug] })
  }

  const saveBill = useMutation(() => ({
    mutationFn: () =>
      api.showActsReplace(
        props.slug,
        props.eventSlug,
        acts().map((act, index) => ({
          act_slug: act.slug.trim().toLowerCase(),
          act_name: act.name.trim(),
          position: index,
          ticket_url: act.ticketUrl.trim() || null,
        })),
      ),
    onSuccess: async () => {
      await refresh()
      setFlash('Bill saved — the crossbill step reads this list.')
    },
  }))

  const saveCounterparty = useMutation(() => ({
    mutationFn: () =>
      api.showCounterparty(props.slug, props.eventSlug, {
        counterparty_name: counterpartyName().trim() || null,
        counterparty_email: counterpartyEmail().trim() || null,
      }),
    onSuccess: async () => {
      await refresh()
      setFlash('Report recipient saved.')
    },
  }))

  const updateAct = (index: number, patch: Partial<BillRow>) =>
    setActs(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const moveAct = (index: number, direction: -1 | 1) =>
    setActs(current => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const a = next[index]
      const b = next[target]
      if (a === undefined || b === undefined) return current
      next[index] = b
      next[target] = a
      return next
    })

  const billValid = () =>
    acts().length <= 32 &&
    acts().every(
      act =>
        /^[a-z0-9][a-z0-9-]{0,63}$/.test(act.slug.trim().toLowerCase()) &&
        act.name.trim().length > 0 &&
        act.name.trim().length <= 160 &&
        (act.ticketUrl.trim() === '' || /^https:\/\//i.test(act.ticketUrl.trim())),
    )

  const counterpartyValid = () =>
    counterpartyEmail().trim() === '' ||
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(counterpartyEmail().trim())

  const mutationError = () => saveBill.error ?? saveCounterparty.error

  return (
    <div class="mb-3 rounded-lg border border-border bg-background px-4 py-3">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Set up the night</p>
      <fieldset class="contents" disabled={readOnly()}>
        {/* The bill — the crossbill step's input. Row order is running order;
            the slug is the attribution identity, derived from the name until
            the operator overrides it. */}
        <div class="mt-2">
          <p class="text-xs font-medium text-foreground">The bill</p>
          <For each={acts()}>
            {(act, index) => (
              <div class="mt-1.5 flex items-center gap-2">
                <Input
                  class="w-40"
                  aria-label="Act name"
                  placeholder="act name"
                  value={act.name}
                  onInput={e =>
                    updateAct(index(), {
                      name: e.currentTarget.value,
                      ...(act.slugTouched ? {} : { slug: deriveSlug(e.currentTarget.value) }),
                    })
                  }
                />
                <Input
                  class="w-36 font-mono text-xs"
                  aria-label="Act slug"
                  placeholder="slug"
                  value={act.slug}
                  onInput={e => updateAct(index(), { slug: e.currentTarget.value, slugTouched: true })}
                />
                <Input
                  class="min-w-0 flex-1"
                  aria-label="Ticket URL"
                  placeholder="ticket url (https://…)"
                  value={act.ticketUrl}
                  onInput={e => updateAct(index(), { ticketUrl: e.currentTarget.value })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-1 text-xs"
                  disabled={index() === 0}
                  onClick={() => moveAct(index(), -1)}
                  title="Move up"
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-1 text-xs"
                  disabled={index() === acts().length - 1}
                  onClick={() => moveAct(index(), 1)}
                  title="Move down"
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-1 text-xs hover:text-destructive-foreground"
                  onClick={() => setActs(current => current.filter((_, i) => i !== index()))}
                  title="Remove"
                >
                  ×
                </Button>
              </div>
            )}
          </For>
          <div class="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              class="h-7 px-2 text-xs"
              onClick={() => setActs(current => [...current, { slug: '', name: '', ticketUrl: '', slugTouched: false }])}
            >
              Add act
            </Button>
            <Button
              class="h-7 px-2 text-xs"
              disabled={!billValid() || saveBill.isPending}
              onClick={() => saveBill.mutate()}
            >
              {saveBill.isPending ? 'Saving…' : 'Save bill'}
            </Button>
            <Show when={acts().length === 0}>
              <span class="text-xs text-muted-foreground">No acts yet — the crossbill step needs the whole bill.</span>
            </Show>
          </div>
        </div>

        {/* The counterparty — the T+7 report's second recipient. */}
        <div class="mt-4 border-t border-border pt-3">
          <p class="text-xs font-medium text-foreground">Report goes to</p>
          <div class="mt-1.5 flex items-center gap-2">
            <Input
              class="w-44"
              aria-label="Promoter or venue name"
              placeholder="promoter / venue name"
              value={counterpartyName()}
              onInput={e => setCounterpartyName(e.currentTarget.value)}
            />
            <Input
              class="min-w-0 flex-1"
              type="email"
              autocomplete="email"
              aria-label="Their email"
              placeholder="their email"
              value={counterpartyEmail()}
              onInput={e => setCounterpartyEmail(e.currentTarget.value)}
            />
            <Button
              class="h-7 px-2 text-xs"
              disabled={!counterpartyValid() || saveCounterparty.isPending}
              onClick={() => saveCounterparty.mutate()}
            >
              {saveCounterparty.isPending ? 'Saving…' : 'Save recipient'}
            </Button>
          </div>
          <Show when={!counterpartyValid()}>
            <p class="mt-1 text-xs text-destructive-foreground">Email needs a name@domain.tld shape — or leave it empty to send the report to the band only.</p>
          </Show>
        </div>
      </fieldset>

      {/* The two facts a booker asks before anything else: is there room on
          the bill for a support act, and is this night part of a festival.
          Each is one small whole-value write; the gig proposal and the
          support-slot ask read them. */}
      <div class="mt-4 flex flex-wrap items-start gap-2 border-t border-border pt-3">
        <SurfaceAction
          slug={props.slug}
          size="xs"
          action={capabilityAction('show-setup', 'Open support slots')}
          label="Support slots open"
          fixed={{ event_slug: props.eventSlug }}
          onDone={() => { refresh(); setFlash('Support slots saved.') }}
        />
        <SurfaceAction
          slug={props.slug}
          size="xs"
          action={capabilityAction('show-setup', 'Festival')}
          label="Part of a festival"
          fixed={{ event_slug: props.eventSlug }}
          onDone={() => { refresh(); setFlash('Festival saved.') }}
        />
      </div>

      <Show when={flash()}>
        <p class="mt-2 text-xs text-muted-foreground">{flash()}</p>
      </Show>
      <Show when={mutationError()}>
        {error => <p class="mt-2 text-xs text-destructive-foreground">{failureLine("Couldn't save the show setup", error())}</p>}
      </Show>
    </div>
  )
}
