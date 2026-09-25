import { Deferred, PanelTitle } from './layout'
import { SectionIcon } from './SectionIcon'
import { BookingAgentsPanel } from './BookingAgentsPanel'
import { BeaconConsolePanel } from './BeaconConsolePanel'
import { BeaconSignalPanel } from './BeaconSignalPanel'
import { DualRoleContactsPanel } from './DualRoleContactsPanel'
import { DriveContactsPanel } from './DriveContactsPanel'

// Contacts — one directory of the people and orgs who can help the act.
//
// Five surfaces used to scatter this concept across Beacons, Audience and
// Operations, each named after the machinery that stored it. Here it is one
// tab framed by `kind`: booking contacts (the season door), amplifiers
// (people who carry word into an audience the act does not own — the beacon
// roster and its funnel), fan channels (fans who are also amplifiers), and
// the staged addresses awaiting a person's classification. "Beacon" stays
// in the panel names and copy where it is the entity's own vocabulary; the
// directory itself is Contacts.
//
// Each panel keeps its own queries and actions — the tab composes, it does
// not merge. Mounting all of them only when the tab is visited keeps the
// Fans-first page cheap.
export function ContactsPanel(props: { slug: string }) {
  return (
    <div class="space-y-8">
      <p class="m-0 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Every person and organisation who can help the act, in one directory —
        each with a kind: booking contacts to ask for nights, amplifiers who
        carry word into an audience the act does not own, fan channels, and
        staged addresses still waiting for a person to say what they are.
      </p>

      {/* Booking contacts — who the season door is open with. */}
      <div>
        <PanelTitle icon={<SectionIcon name="target" />}>Booking contacts</PanelTitle>
        <p class="m-0 mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Agents and bookers screened for this season — asking queues a letter
          that still waits for approval before it goes out.
        </p>
        <BookingAgentsPanel slug={props.slug} />
      </div>

      {/* Amplifiers — the beacon roster and its funnel. */}
      <div>
        <PanelTitle icon={<SectionIcon name="megaphone" />}>Amplifiers</PanelTitle>
        <p class="m-0 mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          People who carry a release or a show into a room the act does not
          own — press, playlisters, local champions. The roster is who they
          are; the funnel is where each of them sits.
        </p>
        <BeaconConsolePanel slug={props.slug} />
        <BeaconSignalPanel slug={props.slug} />
      </div>

      {/* Fan channels — fans who are also amplifiers. */}
      <div>
        <PanelTitle icon={<SectionIcon name="users" />}>Fan channels</PanelTitle>
        <p class="m-0 mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Fans who can also carry word — they already have an audience of
          their own, so a share from them lands warmer than an ad.
        </p>
        <Deferred><DualRoleContactsPanel slug={props.slug} /></Deferred>
      </div>

      {/* Awaiting review — staged addresses awaiting classification. */}
      <div>
        <PanelTitle icon={<SectionIcon name="inbox" />}>Awaiting review</PanelTitle>
        <p class="m-0 mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Addresses staged from connected sources — promote each to a fan,
          press or booking supply, or dismiss it.
        </p>
        <Deferred><DriveContactsPanel slug={props.slug} /></Deferred>
      </div>
    </div>
  )
}
