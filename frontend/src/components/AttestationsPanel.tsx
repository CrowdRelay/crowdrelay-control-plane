import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { api, errorHeading } from '../lib/api'
import { errorMessage, formatTimestamp } from '../lib/format'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { ErrorCard, Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Input } from './ui/input'
import { writeGuard } from '../lib/read-only'
import type { AttestationSummary } from '../lib/types'

// The proof cards: every figure on one is measured from the tenant's own
// ledgers at issue time, signed, and carried by a share-token link that a
// reader can open and verify without an account. This panel is where the
// operator issues one and gets the link worth posting — and where a card
// that should stop circulating is revoked or re-linked.

const splitList = (value: string) =>
  value.split(',').map(part => part.trim()).filter(Boolean)

const shareUrl = (token: string) => `https://virya.music/proof?t=${token}`

const isCurrent = (card: AttestationSummary) =>
  !card.revoked && new Date(card.valid_until).getTime() > Date.now()

export function AttestationsPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = createSignal<string | null>(null)
  const [acting, setActing] = createSignal<string | null>(null)
  const [cities, setCities] = createSignal('')
  const [copied, setCopied] = createSignal<string | null>(null)

  const attestations = useQuery(() => ({
    queryKey: ['attestations', props.slug],
    queryFn: () => api.attestations(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const cards = createMemo(() => attestations.data ?? [])

  const run = async (key: string, action: () => Promise<unknown>) => {
    setActing(key)
    setError(null)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: ['attestations', props.slug] })
    } catch (e) {
      setError(errorMessage(e, 'The write failed.'))
    } finally {
      setActing(null)
    }
  }

  const issue = () =>
    run('issue', () => api.issueAttestation(props.slug, splitList(cities())))

  const revoke = (digest: string) =>
    run(`revoke:${digest}`, () => api.revokeAttestation(props.slug, digest))

  const rotate = (digest: string) =>
    run(`rotate:${digest}`, () => api.rotateAttestationToken(props.slug, digest))

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token))
      setCopied(token)
      setTimeout(() => setCopied(current => (current === token ? null : current)), 2000)
    } catch {
      setError('Could not copy the link — copy it by hand.')
    }
  }

  return (
    <Section
      title="Proof cards"
      icon={<SectionIcon name="shield" />}
      description={
        <>Signed, measured audience figures a sceptical reader can verify. Issue one, post the link.</>
      }
    >
      <Show when={error()}>
        <ErrorCard>{errorHeading(error(), 'Something went wrong')}: {error()}</ErrorCard>
      </Show>

      <Show
        when={!attestations.isLoading}
        fallback={<SkeletonRows count={2} />}
      >
        <Show
          when={attestations.isSuccess}
          fallback={
            <ErrorCard>
              {errorHeading(attestations.error, "Couldn't load proof cards")}: {errorMessage(attestations.error, 'That service is temporarily unavailable.')}
            </ErrorCard>
          }
        >
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <Input
              class="min-w-48 flex-1"
              placeholder="Cities to measure per-city reach, comma separated (optional)"
              value={cities()}
              onInput={event => setCities(event.currentTarget.value)}
              {...writeGuard()}
            />
            <Button
              size="sm"
              disabled={acting() !== null}
              onClick={issue}
              {...writeGuard()}
            >
              {acting() === 'issue' ? 'Measuring…' : 'Issue a card'}
            </Button>
          </div>
          <p class="m-0 mt-1 text-xs text-muted-foreground">
            Figures are measured from the ledgers at issue time — nothing typed here becomes a number.
          </p>

          <Show
            when={cards().length > 0}
            fallback={
              <EmptyState
                label="No proof cards yet"
                hint="Issue one and it measures the audience — reachable fans, tickets, attendance — then signs it. The link is what you post."
              />
            }
          >
            <ul class="m-0 mt-4 list-none space-y-3 p-0">
              <For each={cards()}>
                {card => (
                  <li class="rounded-lg border border-border bg-card p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-foreground">{card.act_name}</span>
                        <Show when={card.revoked}>
                          <Badge variant="destructive">withdrawn</Badge>
                        </Show>
                        <Show when={!card.revoked && isCurrent(card)}>
                          <Badge variant="secondary">current</Badge>
                        </Show>
                        <Show when={!card.revoked && !isCurrent(card)}>
                          <Badge variant="outline">out of date</Badge>
                        </Show>
                      </div>
                      <div class="flex items-center gap-2">
                        <Show when={!card.revoked}>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting() !== null}
                            onClick={() => copy(card.share_token)}
                            {...writeGuard()}
                          >
                            {copied() === card.share_token ? 'Copied' : 'Copy link'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting() !== null}
                            onClick={() => rotate(card.digest)}
                            {...writeGuard()}
                          >
                            New link
                          </Button>
                        </Show>
                        <Show when={!card.revoked}>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={acting() !== null}
                            onClick={() => revoke(card.digest)}
                            {...writeGuard()}
                          >
                            Withdraw
                          </Button>
                        </Show>
                      </div>
                    </div>
                    <p class="m-0 mt-2 text-xs text-muted-foreground">
                      Issued {formatTimestamp(card.issued_at)} · current until {formatTimestamp(card.valid_until)}
                    </p>
                    <p class="m-0 mt-1 truncate font-mono text-xs text-muted-foreground">
                      {card.digest}
                    </p>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </Section>
  )
}
