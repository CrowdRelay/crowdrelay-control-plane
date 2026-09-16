# Control Plane — the UX plan

Companion to `CROWDRELAY_LEVERAGE_PLAN.md`. That document says what the system
should do. This one says how a person is supposed to use it, and it exists
because the answer today is *"with difficulty, and only if you built it."*

---

## The rule that governs this document

Every other plan in this project adds. This one is the only place allowed to
**subtract**, and it must, because the leverage plan adds roughly ten new
capabilities to a console that is already at its limit.

> **A capability added to the console is a cost until it is attached to a moment
> someone is already having. Nothing gets a tab because it was hard to build.**

Four working rules under it:

1. **Removal and merging count as delivery.** A sprint that deletes a surface and
   loses nothing is a good sprint.
2. **New capability attaches to an existing object.** If there is no object it
   belongs to, that is the finding — build the object, not a tab.
3. **One question per screen.** If a screen answers three, it is three screens or
   it is one screen with two things demoted.
4. **The test is a stranger.** Not the person who built it. A band member who
   opened it twice.

---

## 1. The complexity case, measured

Counted today, not estimated:

| | Count |
|---|---|
| Routes | 21 |
| Pages | 17 |
| Components | 81 |
| Tabs across pages | ~31 |
| Tenant nav links | 12, in 3 groups |
| Global nav links | 4 |
| Largest page | `OverviewPage.tsx`, 593 lines |

Three specific symptoms fall out of those numbers.

**Tab names collide across pages.** `overview` exists twice, `runtime` twice,
`communities` twice, and `intelligence` and `intel` are two different tabs on two
different pages. A person cannot hold that map, and neither can a URL — the same
word means a different thing depending on where you already were.

**Grouping has been doing the work that removal should do.** `lib/nav.ts` carries
its own honest confession: *"Fourteen links, four groups, all expanded, was the
whole product laid out as a menu"* — and the fix was a disclosure that remembers
its state, with the note *"Nothing was removed."* That was the right move at the
time and it is now the pattern to stop. Three rounds of regrouping later, the
surface is the same size and the structure is a layer deeper.

**The console is shaped like the backend.** `Runtime`, `AREA`, `Notifiers`,
`Automation`, `Integrations`, `Deployment`, `Process map` are the names of
subsystems. They are correct and they are the architecture with a login screen in
front of it.

---

## 2. The actual problem: two users, one interface

This is the root cause, and every symptom above is downstream of it.

The repository states what this plane is: *"Infrastructure and operator plane."*
It was built for one person running many tenants — provisioning, runtime health,
blue/green deploys, credential rotation. For that person it is good. Dense is
correct when the job is operations.

The leverage plan now makes it serve a **band**: four people with jobs, opening
this after rehearsal to find out what to do this week. That person has no use for
Runtime, AREA, Deployment, Notifiers, the process map, or the word "tenant" —
which is what the product calls them, in their own console.

One interface cannot be both without deciding which one it is by default.

**The decision: the console is the tenant's, and the operator's tools live inside
it as a clearly separate area.** Reasons, in order of weight: the tenant is the
customer and the operator is one person who already knows where everything is;
the leverage plan's Phase 0.5 detaches Virya into an ordinary tenant, so the
operator surfaces stop being the main event by design; and an operator can
tolerate a click of indirection while a band cannot tolerate a wall of subsystem
names.

---

## 3. What the panel already gets right — do not rebuild

Read this before changing anything. The answer to most of this document already
exists in one page and needs generalising, not inventing.

**`TenantIntelligencePage` names its tabs in human questions:** *Where we stand ·
What it believes · What it may say · What it decided · What moved · What it
learned.* That is the design language. One page solved the whole problem and
nothing else adopted it.

**`lib/north-star.ts`** does the same for goals, with the right architecture: the
server owns the list, the console owns the wording, and anything unknown falls
back to the server's label. Copy this pattern rather than a vocabulary.

**`components/ui/metric.tsx`** — `Metric` and `MetricRow`, with `unknown()`
detecting an absent reading so a missing number is drawn as missing.

**`lib/incomplete.ts`** — `whileIncomplete` driving `refetchInterval`, because
read models fan out and answer HTTP 200 while still incomplete. Without it a
panel stays empty for the life of the tab.

**`lib/read-only.ts`** — `readOnly()`, `writeGuard()`, and the API refusing
non-GET on a viewer session. Roles are done.

**`lib/nav.ts` groups** — *Every day · How it is going · Set up once* is the right
axis. The problem is not the grouping; it is that everything survived it.

---

## 4. The missing noun: the gig

**There is no route for an event.** Zero of 21. No `/gigs`, no `/shows`, no
`/events`.

The leverage plan's Phase 1G makes one show, end to end, the load-bearing unit of
the whole product — nine steps from T-21 to T+7, all three sides meeting on one
night. In the console, that night does not exist as a thing you can open. Its
pieces are scattered across Operations, Attention, Audience and Portfolio, and
the person holding it together is doing so in their head.

**This is the single highest-value UX change in this document, and it is also how
the complexity problem gets solved rather than worsened.** Build the gig page and
most of the leverage plan's new capabilities have somewhere to live that is not a
new tab:

```
/tenants/$slug/shows          the list: next up, then past
/tenants/$slug/shows/$id      one night, T-21 to T+7, top to bottom
```

One page, one column, in time order. Each step shows its state, who owns it, and
the one action available now:

```
T-21  Announced            done          the post, where it went
T-14  Sales pace           behind        [ relay to 11 fans in Wrocław ]
T-7   Bands posting        1 of 3        [ nudge the other two ]
T-2   Nearby fans told     17 reached
T-0   Capture plan         with Tomek    3 shots
T-0   The scan             ready         [ show the QR ]
T+1   Recall               waiting
T+3   Harvest              waiting
T+7   The numbers          waiting
```

A band member opens that and knows the state of Friday in four seconds. A
promoter gets the same thing as an emailed artifact and never logs in at all.
Nothing else in the console does this, and no competitor has the data to.

### The second missing noun: the release

`CROWDRELAY_LEVERAGE_PLAN.md` §4i makes cadence a **per-tenant commitment the
system issues**, defaulting to one serious moment per month with fillers between.
The release is the serious moment that recurs most, and the console has no page
for it either.

```
/tenants/$slug/releases        the list, with each one's tier
/tenants/$slug/releases/$id    one release, R-28 to R+30
```

Same shape as the gig page: one column, time order, each step showing state,
owner and the one action available now. The backing exists — `growth_debt.rs`
already models a release plan with milestones and an `assets_ready` flag.

Two things the release page needs that the gig page does not:

- **The tier, decided at R-28** — single, track, or filler. A few real campaigns
  a year means each one carries weight, and a campaign behind everything is a
  campaign behind nothing.
- **The cadence, and whether it is being held.** One line: what is due this
  month, what filled last month's quiet weeks, and whether the commitment is
  slipping. §4i-0d makes slipping a growth debt, and Attention is where it
  belongs.
- **What was held back, and why.** At one moment a month the caps mostly do not
  bind; they bind in **collision weeks**, when a release lands on a gig. Both
  dates are known in advance, so those weeks are predictable and the console
  should show which moment was protected. A held post with no visible reason
  produces exactly one response, which is to raise the cap.

---

## 4b. The tenant's home — fans in the face

### What the daily page reports on today

`TenantOperationsPage` is the tenant's daily worklist, and its own comment states
its purpose honestly: *"What is left answers the two questions this page exists
for: is anything mine, and is anything broken."*

Four numbers sit at the top:

| Card | What it measures |
|---|---|
| Waiting for you | decisions queued |
| Health | is the machine moving |
| Growth delivered | messages sent |
| Autopilot | is the machine switched on |

**Three of four report on the machine. The fourth counts sends. None counts
fans.** A band opens their console and learns that the system is healthy — which
is our concern, not theirs. The question they came with is *are we getting
anywhere, and what should I do about it,* and the page does not contain it.

This is the same asymmetry the leverage plan names in §4e, surfacing in the
interface: the product measures its own throughput and calls it growth.

### The rule for the home screen

> **The first screen answers two questions: are we getting more fans, and what is
> the best thing I can do today. Everything else is below the fold or behind a
> click.**

Machine health does not disappear — it earns its place as *one line that is
usually silent*. A band needs to know when something is broken. They do not need
a permanent readout of it being fine.

### The layout

```
┌──────────────────────────────────────────────────────────────┐
│  Virya                                                        │
│                                                               │
│  31 fans you can reach          +9 this month                 │
│  ▇▇▇▇▇▇▇▇▇▇▇▇▁▁▁                                             │
│  Best source: the room at Klub X — 6 fans, 11% of who came    │
└──────────────────────────────────────────────────────────────┘

┌── Friday · Klub X, Wrocław · in 6 days ──────────────────────┐
│  Sales behind pace          [ Relay to 11 fans in Wrocław ]  │
│  1 of 3 bands posted        [ Nudge the other two ]          │
│  Scan ready                 [ Show the QR ]                  │
│                                              open the show → │
└──────────────────────────────────────────────────────────────┘

┌── Worth doing this week ─────────────────────────────────────┐
│  Announce with Kruk — 30% of their fans overlap yours         │
│     one campaign of your three left this month  [ Propose ]   │
│  Two people look like the same fan             [ Decide ]     │
│  r/PolishMetal gives you engagement and no fans [ Read why ]  │
└──────────────────────────────────────────────────────────────┘

  Everything is running · 2 decisions waiting · nothing broken
```

Four blocks, in this order, and the order is the argument:

1. **Fans you can reach**, the change, and **where they came from**. Reachable
   means consented and contactable — not a follower count on a platform that
   owns the relationship. Source attribution sits in the headline because §4e-4
   is what makes effort follow evidence, and a number without its source teaches
   nothing.
2. **The next show.** The highest-value single moment in the band's month, with
   the two or three steps that are actionable right now. Links to the gig page
   rather than reproducing it.
3. **Worth doing this week** — the ranked fan-getting moves, each with the reason
   it is worth doing and one action.
4. **One status line.** Silent when fine, loud when not.

### What belongs in "worth doing", and in what order

Ranked by warmth, which is the leverage plan's §4e ordering and the only ranking
that survives contact with conversion rates:

| Move | Why it ranks here | Surface |
|---|---|---|
| Show the QR at the next show | the room is the warmest audience the band ever stands in, and it is currently 100% loss | gig page, T-0 |
| Relay to fans in the show's city | owned, free, and the sales pace says it is needed | gig page, T-14 |
| Announce with a bill-mate | same night, same taste, honest reason to appear | gig page, T-21 |
| Nudge the bands who have not posted | costs one message, moves the whole room | gig page, T-7 |
| Decide a duplicate identity | wrong counts and double contact if left | Needs you |
| Post-show recall | the memory is warm for about two days | gig page, T+1 |
| Work a community queue | admitted places only, cooldown-governed | Audience |
| A channel producing no fans | stopping is also a move | Needs you |

Two rules on that list. **It is ranked by measured conversion once §4e-4 has
data, not by this table forever** — the table is the prior, the band's own
numbers replace it. And **never more than three at once.** A list of ten
suggestions is a list nobody works.

### The honest empty state

Virya today: 22 fans, zero attendees, no scan ever run. The home above would show
a headline of 22, no source breakdown, and an empty "best source" line.

Draw it honestly and make the emptiness the call to action:

```
22 fans you can reach          first month
No sources measured yet — the next show is where that starts.
```

Not a zero, not a placeholder chart, not a fake sparkline. The leverage plan's
§4e-6 arithmetic applies here as interface: **show rates as soon as they exist,
and do not dress up a total that is honestly small.** A first quarter is twenty
to thirty real people, and a home screen that implies otherwise is the same lie
as a `0` standing in for a `null`.

### What this demotes

- **Health** becomes the status line. Loud only when something is broken.
- **Autopilot on/off** moves to the Automation page, where its switches are.
- **Growth delivered** — sends, not fans — moves into Intelligence as a
  throughput figure, which is what it is.
- **The tab strip** on the daily page loses anything that is a report rather than
  a decision.

None of these are deleted. They stop being the first thing a band sees.

---

## 5. Where the leverage plan's new work goes — without new tabs

The rule from §4e-2 of the other plan applies here too: caps outvote ambition.
The console's cap is attention.

| New capability | Where it lives | Not |
|---|---|---|
| The scan ritual (§4e-1) | a step on the gig page, plus a QR view for the phone | a Scans page |
| Post-show recall | the T+1 step of that gig | a Messaging page |
| Crossbill per gig (§4e-2) | the T-21 step, as a proposal with the cap shown | a Crossbill page |
| Source ROI (§4e-4) | one column on Audience: where fans came from, and conversion | an Analytics page |
| Identity merges (§4e-5) | the Attention inbox — it is a decision, not a report | an Identity page |
| Corridor proposals (§4e-3) | Opportunities, beside bookings | a Routing page |
| Uncomfortable advice (§4g) | Attention, with its evidence inline | a Warnings page |
| Counterparty artifacts (§4f) | a preview on the gig's T+7 step | a Reports page |
| Venue / promoter knowledge | on the show and on the booking | a Registry page |

Nine capabilities, zero new top-level destinations, one new object. That is the
whole strategy of this document in one table.

---

## 6. Surface-by-surface verdict

Every current route, with a verdict. The point is the fourth column existing at
all.

| Route | Verdict |
|---|---|
| `/` Overview | **Keep**, operator-facing. Tenant sees their own home instead. |
| `/tenants` | **Keep** for the operator. Meaningless to a single tenant. |
| `/tenants/new` | **Keep**. Operator only. |
| `/flow` Process map | **Demote.** Explains the architecture to the person who wrote it. Move under the operator area. |
| `/automation` (global) | **Merge** into the operator area. |
| `/tenants/$slug` Settings | **Keep**, thinner. Brand settings is the tenant's; deployment and access are the operator's. |
| `/tenants/$slug/operations` | **Keep** — this is the daily page. Should become the gig list's neighbour, not compete with it. |
| `/tenants/$slug/attention` | **Keep.** The best surface in the product: it is a queue of decisions, which is what a person actually has. |
| `/tenants/$slug/audience` | **Keep**, gains the source-ROI column. |
| `/tenants/$slug/intelligence` | **Keep.** Already correctly named. |
| `/tenants/$slug/portfolio` | **Merge** into Audience — it is where fans come from, which is the same question. |
| `/tenants/$slug/funnel` | **Merge** into Audience. |
| `/tenants/$slug/communities` | **Merge** into Audience. It is one source among several, not a peer of the whole audience. |
| `/tenants/$slug/health` | **Split.** Tenant sees "is anything broken for me"; the rest is operator. |
| `/tenants/$slug/beacons` | **Keep**, set-up. Becomes tenant-facing once the scan ritual uses it. |
| `/tenants/$slug/actions` | **Merge** into Attention. |
| `/tenants/$slug/area` | **Operator only.** |
| `/tenants/$slug/notifiers` | **Operator only.** |
| `/tenants/$slug/integrations` | **Operator only** — the tenant should never meet an AI provider list. |
| `/tenants/$slug/automation` | **Operator only.** Policies and confidence floors are not band vocabulary. |
| — | **Add** `/tenants/$slug/shows` and `/shows/$id`. |

Result: a band sees roughly six destinations — Today, Shows, Attention, Audience,
Intelligence, Settings. An operator keeps everything, one level in.

**Nothing is deleted from the backend.** Every route above still exists and still
works; this is about what a given role is shown first.

---

## 6b. The wizard does not ask what kind of tenant this is

A gap found on 2026-09-15, and the only one in this document that is already
half-built.

Migration `0025_tenant_lifecycle_capabilities.sql` added the archetype column,
with all four kinds from the leverage plan's §4a and the reasoning written into
the migration itself:

```sql
ADD COLUMN IF NOT EXISTS archetype text NOT NULL DEFAULT 'band'
    CHECK (archetype IN ('band', 'roster', 'label', 'festival_org'))
```

> *"Stored now so the second tenant's archetype is a column value, not a code
> change — no per-archetype behaviour ships until a second exists."*

That is the right call, and the path to set the value does not exist:

- **`CreateTenantRequest` has no `archetype` field.** Every tenant created
  through the console becomes a `band` by column default, silently.
- **`TenantWizardPage.tsx` has no archetype step.** It asks for the north star
  and the fanbase sources, and never asks what this tenant is.
- Nothing in the brain reads the column yet, which is correct and deliberate.

**Why this matters before the second customer, not after.** §4h-5 of the leverage
plan argues customer two should be a roster or management company. The column
exists precisely so that is a value rather than a code change — but created
through the wizard, that roster arrives as a band, and somebody has to notice and
correct it in SQL.

**The fix is one change across both sides, because it cannot be either alone.**
`CreateTenantRequest` is `#[serde(deny_unknown_fields)]`, and
`scripts/test_wizard_payload_contract.py` gates the wizard's posted keys against
the struct's fields — so adding the step without adding the field fails CI, which
is the gate working. Add the field, add one wizard step with four options
defaulting to band, and the gate passes. `PortfolioSettingsPanel`'s
`north_star_metric` selector is the pattern to copy: the server owns the list,
the console owns the wording.

---

## 7. Interaction rules

These are the ones that get broken repeatedly, each with the reason it matters.

- **An absent number is drawn as absent.** `Metric`'s `unknown()` already does
  this. A fan-out that could not reach a section reports `degraded` and `null` —
  rendering that as `0` is a lie the operator will act on.
- **Every query over a read model with `degraded` passes `whileIncomplete`.**
  Otherwise the panel stays empty for the life of the tab. Both observers of a
  shared query key must pass the same rule, or whichever mounts first decides for
  both.
- **Optimistic layout, honest values.** Show the shape immediately; fill numbers
  as they land. Never a spinner where a number will be, never a zero standing in
  for a pending answer.
- **One primary action per card.** Everything else is secondary or in a menu. A
  card with four equal buttons has no primary action and the user picks by
  guessing.
- **Write controls respect `writeGuard()`** — already enforced both in the console
  and at the API.
- **Destructive actions state what they affect, in nouns**, before confirming.
- **Mobile is a real case.** A band member checks this on a phone, backstage,
  before a set. The gig page especially must work at 375px.

---

## 7b. Visual system — the outliers, counted

Sections 1 to 7 are about structure. This one is about the surface, and it is a
short list because the design language is already decided. The work is removing
what does not follow it.

Everything below was counted across `components/` and `pages/`, not estimated.

### The audit

| What | Found | Should be |
|---|---|---|
| Radius scales | 5 (`lg` 239, `md` 80, `full` 52, `sm` 19) plus 5 corner-specific one-offs | 3: `md` controls, `lg` containers, `full` pills |
| Shadows | 12 uses across 5 scales (`xl`, `lg`, `md`, `sm`, `shadow-blocked`) | overlays only |
| Border colours | 3 tokens, plus tinted one-offs at two different opacities (`/30` and `/40`) | 3 tokens, one tint opacity |
| Arbitrary pixel values | 39 outside skeletons, over 8 files | 0 outside skeletons |
| Raw hex colours | 85, of which 28 in `GrowthMetricsPanel.tsx` | 0 outside charts, and charts use tokens |
| Raw `<button>` | 33, across 20 files, 6 with any aria | 0 |
| Raw `<input>` / `<select>` | 16 files | 0 |
| Type scale | `text-sm` 513, `text-xs` 279, then a cliff to `xl` 21, `base` 13, `lg` 4, `2xl` 1 | a real hierarchy |

### The five that matter

**1. Shadows contradict the design system's own rule.** `components/ui/card.tsx`
opens with *"Card — flat surface with one border colour. No glassmorphism, no
shadow"*, and there are twelve shadows in the codebase across five scales. Either
the rule holds or it does not. It should hold: **shadow only where something
floats over something else** — dropdown, dialog, toast. Everything else is a
border. `shadow-blocked` is a custom one-off and should go.

**2. Two type sizes carry 94% of the interface.** `text-sm` and `text-xs`
together are 792 of 831 uses. Headings barely rise above body text, so nothing
leads the eye and every screen reads as one flat wall — which is a large part of
why the panel feels dense. This is the highest-impact visual change in the list,
and it costs almost nothing: give `PageHeader`, `SectionTitle` and `Metric` a
real step up, and let the rest stay small.

**3. Thirty-nine arbitrary pixel values.** `Skeleton.tsx` documents why it uses
them and that is legitimate — a skeleton imitates specific text metrics. The 39
outside it are not: `h-[18px]`, `w-[180px]`, `[22px]` and friends in `Shell.tsx`,
`OverviewPage.tsx`, `BrainDecisionPanel.tsx`, `LearningLoopPanel.tsx`. Each one
is a value that will not move when the scale does.

**4. Eighty-five raw hex colours, 28 of them in one file.**
`GrowthMetricsPanel.tsx` carries its own palette. Charts need explicit colours,
so the fix is not to ban them — it is to read them from the theme tokens, so a
chart in dark mode is not a separate act of faith.

**5. Thirty-three raw `<button>` elements** beside a `components/ui/button.tsx`
that exists and works. Every one skips the variant system, the focus ring and the
disabled treatment.

A sample of the write-capable panels found only local state toggles behind them —
expand a row, open a form — so this is **a latent risk, not a live hole**, and
`lib/api.ts` refuses non-GET on a read-only session regardless, so the guarantee
does not rest on the console alone. The risk is the next write control someone
adds as a bare button, which would look disabled to nobody and be caught only at
the API. Same for the 16 files with raw `<input>` and `<select>`.

### Focus and keyboard

**Eight of seventeen `ui/` primitives style `focus-visible`.** For a console
whose main surface is a queue of decisions, that is the difference between
keyboard-workable and mouse-only. Every primitive gets the same ring, from one
definition, and the ring is visible against all three surface levels.

### The rules, once fixed

- **Three radius steps.** `md` for controls, `lg` for containers, `full` for
  pills. Corner-specific radii only where two elements physically join.
- **Borders separate; shadows float.** One border token language — `border`,
  `border-subtle`, `border-strong` — and tinted borders at a single opacity.
- **No arbitrary pixel values** outside `Skeleton.tsx`, which keeps its documented
  exemption.
- **No hex outside chart series**, and chart series read from tokens.
- **No raw `<button>`, `<input>`, `<select>`, or `<textarea>`.** The primitives
  exist for all four.
- **One divider idiom.** `Card flat` already defines it — a top rule and the
  heading does the separating. Nothing else draws its own boxes inside a card.
- **Density is deliberate, not accidental.** An operator page may be dense. The
  tenant home and the gig page are not.

### How this stays fixed

`playwright/tests/css-audit.spec.ts` already gates **runtime** layout on eight
subpages — overlap detection and `document.scrollWidth` against the viewport,
with a documented allow-list of bounded scrollers. It is good and it cannot see
any of the above, because token drift is not a layout error.

Add a **static** gate beside it, in the shape the repository already uses for
contract gates (`scripts/test_*.py`, run by `just script-test`): count radius
scales, shadows outside the overlay primitives, arbitrary pixel values outside
`Skeleton.tsx`, hex outside chart files, and raw form elements. Fail on increase.

Ratchet, do not bulk-fix: the current numbers become the ceiling on the day the
gate lands, and each sprint's §10 polish pass lowers them. A design system with
no gate returns to five radius scales within a quarter, which is how it got
there.

---

## 8. Language

The other plan's `north-star.ts` comment states the principle exactly: the server
names things the way the domain models them, and *"every one of those is accurate
and none of them says what you are choosing between."*

Apply it to the console's own furniture:

| Now | For a tenant |
|---|---|
| Tenant | the band's name |
| Operations | Today |
| Attention | Needs you |
| Portfolio | Where your fans come from |
| Beacons | Places we can reach people |
| AREA / Runtime / Notifiers | not shown |
| Autopilot policy | What it may do without asking |
| Degraded | Couldn't check this |

Two guards so this does not become decoration. Keep the exact technical name
wherever the precise value matters — a settings row recording what was stored
shows the stored key, the way `northStarTechnicalName` already does. And keep one
word per concept: today the product says fans, audience, and members for
overlapping things.

---

## 9. Order of work

**UX-1 — Stop the bleeding.** No new top-level destination without deleting or
merging one. Adopt the §5 table as the placement rule for every leverage-plan
capability. Costs nothing, prevents the next year of drift.

**UX-2 — The gig page.** `/shows` and `/shows/$id`, the nine steps in time order.
Ships with Phase 1G and is the reason that phase is legible at all.

**UX-2b — The home screen.** Section 4b: fans and their source in the headline,
the next show under it, three ranked moves, one status line. Ships with UX-2
because block two is a summary of the gig page and there is nothing to summarise
before it exists.

Most of it is a reordering, not new plumbing: `active_fans`,
`marketing_consented_fans`, `attendees` and `top_cities` already reach the
console. **One piece does not.** Acquisition source has no representation in
`read_models.rs` — `fan_acquisition_events` lives in the tenant and stops there.
The "best source" line in the headline needs that section added to the fan-out
first, with the same discipline as every other section: named in `degraded` when
it cannot be reached, `null` rather than `0`, and `whileIncomplete` on the query.
Until it exists the headline shows the count and omits the source line, which is
the honest empty state below.

**UX-3 — The merges.** Portfolio, funnel and communities into Audience. Actions
into Attention. Four destinations become one, and one question gets one screen.

**UX-4 — The role split.** Operator surfaces move behind an operator area.
Tenant default becomes six destinations. Depends on Phase 0.5, which is what
makes Virya an ordinary tenant in the first place.

**UX-5 — Language pass.** Section 8, everywhere, with the technical name kept
where the value is what matters.

**UX-6 — Density and mobile.** The 593-line Overview, the tab-name collisions,
375px on the gig page.

**UX-7 — Visual polish.** Section 7b. Land the static token gate first, at
today's numbers, then lower it. Two items are worth doing immediately because
they are cheap and felt everywhere: the type hierarchy (two sizes currently carry
94% of the interface) and `focus-visible` on the nine primitives missing it. The
raw-element replacements matter most on write controls, where a bare `<button>`
silently escapes `writeGuard()`.

UX-1 is free and must come first. UX-2 is the one a customer feels.

---

## 10. How this is proven

Not by screenshots or taste. By time-to-answer on real questions, measured with a
stopwatch on someone who did not build it:

| Question | Now | Target |
|---|---|---|
| Are we getting more fans? | not answerable on any screen | first line of the home |
| What is the single best thing to do today? | not answerable | first screen, ranked, three |
| What is the state of Friday's show? | not answerable in one place | under 10 seconds |
| What needs me today? | Attention page, close | unchanged, it works |
| Where did our last 20 fans come from? | not answerable | under 15 seconds |
| Did the other bands post? | not answerable | on the gig page |
| Is anything broken for us? | mixed with operator health | one line, plain |

Add one standing count: **destinations a tenant must understand.** Twelve today.
Six is the target, and it is a number that can only go down.

---

## 11. What this plan will not do

- **Not a redesign.** The visual language, `Metric`, the shadcn components and the
  read-only handling are done and good. This is about structure and naming.
- **Not a deletion of backend surface.** Every route keeps working. Roles decide
  what is shown first.
- **Not a dashboard.** Nobody's job is looking at a dashboard. The product is a
  queue of decisions and one page per night that matters.
- **Not a promise that fewer screens means less power.** The operator keeps every
  control. It moves one level in, and the level is labelled.

---

## 12. The prune, on the console side

`CROWDRELAY_LEVERAGE_PLAN.md` §11 sets the rule for the system as a whole: cut
what returns nothing, keep what returns a little, and measure only while the loop
is working. Three things follow for the interface specifically.

**The §6 verdict table is a merge list, not a delete list.** Portfolio, funnel and
communities fold into Audience because they answer one question between them.
Nothing is removed from the backend, and every route keeps working.

**Duplicate names are the cheapest win and should go first.** `overview` twice,
`runtime` twice, `communities` twice, `intelligence` and `intel` for one idea.
Renaming costs nothing and removes the worst of the map problem.

**Usage is measurable per role, and the console has one telling number**: how
many destinations a tenant must understand. Twelve today, six the target. It can
only be lowered by merging or by moving something behind the operator area —
never by deleting a capability someone uses.

## Outcome

A console that is easy to use and understand, with an intuitive layouts, usability
and a real potential to grow tenant's fanbases and leverage full crowdrelay potential.