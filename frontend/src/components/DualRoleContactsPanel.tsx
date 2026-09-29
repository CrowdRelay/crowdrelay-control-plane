import { For, Show, createSignal } from 'solid-js'
import { SkeletonRows } from './Skeleton'
import { Users } from 'lucide-solid'
import { failureLine } from '../lib/errors'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { api, ApiError } from '../lib/api'
import { writeGuard } from '../lib/read-only'
import type { DualRoleContact, LatarnikInviteResult } from '../lib/types'
import { KpiCard, KpiStrip, PanelTitle, ErrorCard, ShowMore, useShowMore } from './layout'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { Card } from './app/card'
import { Badge } from './app/badge'
import { Button } from './app/button'
import { Spinner } from './Spinner'

// P.1 — one person, two roles.
//
// The industry list (the beacons the band works with) is joined to the fan
// list by address, for reading only — the two stay apart on purpose, because
// a fan consented to hear the dates and a beacon did not. What the join buys
// is the three questions neither list could answer alone: which of these
// people already hear the dates, which could be asked, and which must not be
// asked right now — with the sentence saying why.
//
// The invitation is one person, once, ever. The button re-asks upstream at
// the click — standing, reason and words are all recomputed, so a contact
// whose situation changed since the read answers with the rule's own
// sentence instead of a send.

const ROLE_LABELS: Record<string, string> = {
  press: 'Press',
  radio: 'Radio',
  playlist: 'Playlist',
  media_patronage: 'Media patronage',
  endorsement: 'Endorsement',
  creator: 'Creator',
  organiser: 'Organiser',
  promoter: 'Promoter',
  venue: 'Venue',
  festival: 'Festival',
  local_press: 'Local press',
  photographer: 'Photographer',
}
const roleLabel = (role: string) => ROLE_LABELS[role] ?? role.replace(/_/g, ' ')

const lastContact = (days: number | null): string => {
  if (days === null) return 'never contacted'
  if (days < 1) return 'contacted today'
  if (days === 1) return 'contacted yesterday'
  return `last contact ${days}d ago`
}

/** One contact row. The invite button owns its own pending/result state so
 *  a refusal lands next to the person it is about, and a sent answer flips
 *  the row without a refetch — the list then catches up on invalidate. */
function DualRoleRow(props: { slug: string; contact: DualRoleContact }) {
  const qc = useQueryClient()
  const [pending, setPending] = createSignal(false)
  const [answer, setAnswer] = createSignal<LatarnikInviteResult | null>(null)
  const [failed, setFailed] = createSignal<string | null>(null)

  const invite = async () => {
    if (pending() || answer()) return
    setPending(true)
    setFailed(null)
    try {
      const result = await api.inviteToLatarnik(props.slug, props.contact.beacon_id)
      setAnswer(result)
      void qc.invalidateQueries({ queryKey: ['beacon-dual-role', props.slug] })
    } catch (error) {
      // A 404 means the beacon is gone, not that the click failed — but the
      // distinction is upstream's to make; here any transport fault reads
      // the same way to the operator.
      setFailed(error instanceof ApiError && error.status === 404
        ? 'This person is no longer on the list — refresh to see the current list.'
        : failureLine("Couldn't send the invitation", error))
    } finally {
      setPending(false)
    }
  }

  const c = props.contact
  return <div class="rounded-md border border-border bg-background px-3 py-2 text-sm">
    <div class="flex items-center gap-2 flex-wrap">
      <strong class="text-foreground">{c.display_name}</strong>
      <Badge variant="outline">{roleLabel(c.role)}</Badge>
      <Show when={c.city}><span class="text-xs text-muted-foreground">{c.city}</span></Show>
      <span class="text-xs text-muted-foreground ml-auto">{lastContact(c.days_since_last_contact)}</span>
    </div>

    <div class="mt-1.5 flex items-center gap-2 flex-wrap">
      <Show when={c.hears_the_dates}>
        <Badge variant="success">Hears the dates</Badge>
      </Show>
      <Show when={!c.hears_the_dates && c.known_but_not_consented}>
        <Badge variant="muted">Signed up once — no live consent</Badge>
      </Show>
      <Show when={!c.hears_the_dates && c.already_invited}>
        <Badge variant="outline">Already invited</Badge>
      </Show>
      <Show when={!c.hears_the_dates && !c.already_invited && c.invitable && !answer()?.outcome}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void invite()}
          disabled={pending()}
          {...writeGuard()}
        >
          {pending() ? <Spinner /> : 'Invite to the dates'}
        </Button>
      </Show>
      <Show when={!c.hears_the_dates && !c.already_invited && !c.invitable && c.hold_reason}>
        <span class="text-xs text-muted-foreground italic">{c.hold_reason}</span>
      </Show>
      <Show when={answer()?.outcome}>
        <Badge variant="success">Invited</Badge>
      </Show>
    </div>

    <Show when={answer()?.refused}>
      <span class="block mt-1 text-xs text-muted-foreground italic">{answer()?.refused}</span>
    </Show>
    <Show when={failed()}>
      <span class="block mt-1 text-xs text-destructive">{failed()}</span>
    </Show>
  </div>
}

export function DualRoleContactsPanel(props: { slug: string }) {
  const review = useQuery(() => ({
    queryKey: ['beacon-dual-role', props.slug],
    queryFn: () => api.dualRoleContacts(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  // The actionable rows first — somebody you could ask today outranks a
  // contact you may not touch — then a screenful, not the whole list.
  const ordered = () =>
    [...(review.data?.contacts ?? [])].sort((a, b) => {
      const rank = (c: DualRoleContact) =>
        !c.hears_the_dates && !c.already_invited && c.invitable ? 0
        : !c.hears_the_dates && !c.already_invited ? 1
        : !c.hears_the_dates ? 2 : 3
      return rank(a) - rank(b) || a.display_name.localeCompare(b.display_name)
    })
  const showMore = useShowMore(ordered, 15)

  return <Card flat class="space-y-4">
    <div>
      <PanelTitle icon={<SectionIcon name="users" />}>Also an audience</PanelTitle>
      <p class="text-muted-foreground text-sm mt-1">
        The people the band already works with, joined to the fan list by address — who already hears the dates, who could be asked, and why the rest must not be asked right now.
      </p>
    </div>

    <Show when={review.isError}>
      <ErrorCard title="Couldn't load the contact list" error={review.error} onRetry={() => void review.refetch()} />
    </Show>

    <Show when={review.isPending}>
      <SkeletonRows count={3} />
    </Show>

    <Show when={review.data}>
      {(data) => <>
        <Show when={data().total > 0} fallback={
          <EmptyState icon={<Users />}
            label="Nobody yet"
            hint="The industry list is empty — promoters, press and photographers land here as the band starts working with them."
          />
        }>
          <KpiStrip class="mb-0">
            <KpiCard label="People the band works with" value={data().total} />
            <KpiCard
              label="Already hear the dates"
              value={data().already_hear_the_dates}
              tone={data().already_hear_the_dates > 0 ? 'default' : 'warn'}
            />
            <KpiCard
              label="Could be asked now"
              value={data().invitable_now}
              tone={data().invitable_now > 0 ? 'default' : 'warn'}
            />
          </KpiStrip>

          <div class="flex flex-col gap-2">
            <For each={showMore.visible()}>{(contact) =>
              <DualRoleRow slug={props.slug} contact={contact} />
            }</For>
            <ShowMore
              hidden={showMore.hidden()}
              expanded={showMore.expanded()}
              onToggle={showMore.toggle}
              noun="people"
            />
          </div>
        </Show>
      </>}
    </Show>
  </Card>
}
