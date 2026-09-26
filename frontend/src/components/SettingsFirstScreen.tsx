import { For, Show, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { AutopilotPolicy, TenantSummary } from '../lib/types'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import { Act, Card, Note, Row, Split, Tile, Tiles } from './ui/dash'
import { Bot, Mail } from 'lucide-solid'
import { cn } from '../lib/cn'

// Settings, first screen (mockup `console-mockups/settings.html`): who you
// are, and what the machine may do. How letters describe the act (the
// facts the outreach drafts use, with the home city flagged when it is
// guessed), autonomy per area in two words, and four quiet facts. The
// panels that edit all of it sit behind the Details buttons.

/** The areas a band recognises, in their words, in the order the mockup
 *  lists them. Any other area counts in the totals and the Profile panel. */
const AREA_LABEL: Record<string, string> = {
  show_growth: 'Show promotion',
  fan_lifecycle: 'Fan messages',
  content_supply: 'Your posts to fans',
  outreach: 'Letters to press',
  promotion_budget: 'Money, prices, ads',
  booking_opportunity: 'Booking asks',
  beacon: 'Local amplifiers',
}

export function settingsStatus(settings: Record<string, string> | undefined): { tone: 'good' | 'warn' | 'bad' | 'muted'; text: string } | null {
  if (!settings) return null
  if (!settings['act_home_city']?.trim()) return { tone: 'warn', text: 'Home city not set · letters guess it' }
  if (!settings['act_style']?.trim()) return { tone: 'warn', text: 'Sound not set · letters leave it out' }
  return { tone: 'good', text: 'Letters describe you' }
}

export function SettingsFirstScreen(props: { slug: string; tenant: TenantSummary; onOpen: (area: string) => void }) {
  const settings = useQuery(() => ({
    queryKey: ['tenant-settings', props.slug],
    queryFn: () => api.tenantSettings(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  // Policies ride the Today read the console keeps warm — same key, same
  // retry rule as its other observers.
  const today = useQuery(() => ({
    queryKey: ['tenant-today', props.slug],
    queryFn: () => api.tenantToday(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const s = () => settings.data?.settings ?? {}
  const policies = (): AutopilotPolicy[] => today.data?.autopilot?.policies ?? []
  const alone = (p: AutopilotPolicy) => p.enabled && p.autonomy_level === 'bounded_auto'
  const suggest = (p: AutopilotPolicy) => p.autonomy_level === 'observe' || p.autonomy_level === 'recommend'
  const shown = createMemo(() =>
    Object.keys(AREA_LABEL).map(context => policies().find(p => p.context === context)).filter((p): p is AutopilotPolicy => Boolean(p)).slice(0, 5))
  const site = () => s()['member_site_base_url']?.replace(/^https?:\/\//, '').replace(/\/+$/, '') || null
  const city = () => s()['act_home_city']?.trim() || null
  const style = () => s()['act_style']?.trim() || null

  const fact = (label: string, value: string | null, warn?: string) => (
    <Row class="text-xs">
      <span class="w-24 shrink-0 text-muted-foreground/70">{label}</span>
      <span class={cn('min-w-0 flex-1 truncate', value ? 'text-foreground' : 'text-warning-foreground')}>{value ?? warn ?? 'not set'}</span>
    </Row>
  )

  return (
    <>
      <Split even>
        <Card title="How letters describe you" icon={<Mail />} aside={<Act onClick={() => props.onOpen('workspace')}>Edit</Act>}>
          {fact('Name', props.tenant.displayName)}
          {fact('Sound', style())}
          {fact('From', city(), 'not set · letters guess it from where you played most')}
          {fact('Website', site())}
          <div class="mt-2.5 rounded-lg bg-muted/55 px-2.5 py-2 text-xs text-foreground">
            "I am writing from {props.tenant.displayName}{style() ? `, a ${style()} act` : ''}{city() ? ` from ${city()}` : ' from …'}"
          </div>
        </Card>

        <Card title="What it may do alone" icon={<Bot />} aside="per area">
          <Show when={today.data} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{today.error ? 'The areas could not be read.' : ''}</p>}>
            <For each={shown()}>{policy => (
              <Row class="text-xs">
                <span class="min-w-0 flex-1 text-foreground">{AREA_LABEL[policy.context]}</span>
                <span class="inline-flex overflow-hidden rounded-md border border-border">
                  <span class={cn('px-2 py-0.5', !alone(policy) ? 'bg-info-foreground/15 text-info-foreground' : 'text-muted-foreground')}>{suggest(policy) ? 'suggest' : 'ask'}</span>
                  <span class={cn('px-2 py-0.5', alone(policy) ? 'bg-info-foreground/15 text-info-foreground' : 'text-muted-foreground')}>alone</span>
                </span>
              </Row>
            )}</For>
            <Note>
              {policies().filter(alone).length} areas act alone · {policies().filter(p => !alone(p) && !suggest(p)).length} ask first · {policies().filter(suggest).length} only suggest.{' '}
              <Act onClick={() => props.onOpen('about')}>All {policies().length}</Act>
            </Note>
          </Show>
        </Card>
      </Split>

      <Tiles>
        <Tile label="Signal app" value={settings.data ? (s()['signal_enabled'] === 'true' ? 'On' : 'Off') : null} sub="the fans' app" />
        <Tile label="Connected sources" value={props.tenant.fanbaseSources.length} sub="where fans are counted" />
        <Tile label="Crew" value={today.data?.autopilot?.available_assignees?.length ?? null} sub="get show tasks by email" />
        <Tile
          label="Alerts to you"
          value={props.tenant.enabledNotifierChannels ?? null}
          valueTone={props.tenant.enabledNotifierChannels === 0 ? 'warn' : undefined}
          sub={props.tenant.enabledNotifierChannels === 0 ? 'no channel set' : 'channels on'}
        />
      </Tiles>
    </>
  )
}
