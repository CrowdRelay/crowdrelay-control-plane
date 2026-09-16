# CrowdRelay — From Machinery to Leverage

**Written 2026-09-14. Companion to `AGENT_GROWTH_PLAN.md`, which describes the
machinery. This describes what the machinery is for.**

---

## The rule that governs this document

This system has Expected Free Energy scoring, a causal model, per-skill
follow-through tracking and a template kill switch. It also has a change-point
detector that runs every cycle and only writes a log line, a calibration
module that records every prediction against its outcome and is never read,
and a hypothesis lifecycle whose promotion ladder is a design nothing calls.

It has **one ticket buyer and zero attendees**.

That contrast is the whole problem. The engineering is better than almost
anything in this space. The outcome is worse than a spreadsheet and a person who
posts on Tuesdays. Any plan that does not close that gap is decoration, however
well argued.

**Four rules, in force over everything below:**

1. **Nothing new is built while something built is broken.** An n8n node with an
   empty required field is currently costing more than any unbuilt feature.
2. **Every phase ends with something a band can feel**, not with a module that
   passes tests. If the acceptance criterion cannot be checked by the person
   paying, it is not an acceptance criterion.
3. **When the choice is more machinery or more delivery, deliver.** The maths
   is already ahead of the product by a wide margin. It does not need help.
4. **Sections 4c and 4d are a map, not a work list.** They exist to stop
   somebody rebuilding what is already written. Nothing in them is a task.

The failure mode to watch for is not laziness. It is the opposite: an elegant
mechanism, carefully reasoned, shipped into a loop where nobody was ever told
there was something waiting for them.

---

## How to read this document

The section letters record the order things were worked out, not the order to
read them in. They are kept as written so existing cross-references stay valid.
**Read in this order instead:**

| Read | Sections | What they give you |
|---|---|---|
| 1. The situation | 0, 1, 2, 3 | what is broken, what exists, what not to rebuild |
| 2. The rules | 4 (principles), 4a, 4a-2, 4a-2b | archetypes, what 10/10 means, the three-sided lens |
| 3. The ground truth | 4a-2c, 4a-3 | the lived reality per side; festivals |
| 4. What to make | 4b, 4b-2, 4b-3, 4b-4 | the plan hierarchy, formats, harvest, Pareto |
| 5. How fans arrive | **4e**, 4f, 4g | aggregation, value before adoption, honest advice |
| 6. Where the money is | **4h** | roster and festival, by Pareto |
| 7. The rhythm | **4i** | the cadence the system issues |
| 8. The machinery map | 4c, 4d | what exists already; what the LLMs are for |
| 9. The work | 5, 6, 7, 8, 9 | phases, proof, non-promises, decisions, order |
| 10. Operating rules | 10, 11 | the autonomous build loop, the prune |

Sections 4e, 4h and 4i are the newest and carry the most load. An implementer
reading top to bottom without this table will hit the archetypes before the
principles and the formats before the aggregation engine that decides which
formats matter.

---

## 0. The problem, stated honestly

The engineering is good. The architecture is genuinely strong: leased
crash-recoverable provisioning, contradictory terminals failing closed,
blue/green with health-gated cutover, separated authorities, expand-only
migrations, cross-repo contract gates, a deterministic brain with a causal
model behind it.

The product does not yet help anybody.

Measured in production on 2026-09-14:

| Reading | Value |
|---|---|
| Autopilot succeeded / failed, 24h | 1 / 8 |
| Actions waiting on a human | 11 |
| Active fans | 20 |
| Ticket buyers | 1 |
| Attendees | 0 |
| Last decision emitted by the brain | 13 Sep — two days earlier |

Fourteen days of emissions against confirmations:

| Action kind | Emitted | Confirmed |
|---|---|---|
| `show.task.escalate` | 91 | **0** |
| `fan.lifecycle.message.request` | 21 | 21 |
| `community.engage.request` | 10 | **0** |
| `team.assignment.email` | 7 | 6 |
| `content.artifact.request` | 4 | **0** |
| `agent.content.request` | 2 | **0** |
| `outreach.request` | 2 | **0** |

One capability works end to end. Ninety-one show escalations went into silence.

The diagnosis is not "the loop is expensive" or "the loop is unfinished". It is
that the loop **decides things nobody asked for, and the few good decisions
never reach a person**.

The clearest evidence is a commit from 2026-09-14:

> *The community pipeline posted a fabricated anecdote to r/metalgearsolid, a
> video game forum admitted on member count alone, targeted by name, written
> from nothing.*

A metal band's agent invented a story and posted it to a Metal Gear Solid
subreddit. That is the failure mode in one sentence: **content invented out of
the sky, aimed at a place chosen by a number**.

---

## 1. What this becomes

A tool that takes cumbersome work off the shoulders of the person who would
otherwise do it by hand, for a band, a roster, or a label.

Three questions it must answer, every week, with evidence:

1. **What did we just do, and where should it go?** — the band played, released,
   filmed; the system carries it everywhere it belongs, in words a person would
   write.
2. **What should we make next, why, who does it, and where will it go?** —
   grounded in what comparable bands are doing, what our own fans are engaging
   with, and what the calendar says; routed to the band member with the skill;
   and carrying its distribution plan before anyone agrees to make it.
3. **Where are our people, and what should we organise there?** — fan
   geography, routing, venues, festivals, press, with the arithmetic done.

Everything already built serves those three. Nothing below replaces the
machinery; it connects it to reality.

### The flywheel

```
  machinery augments the band  ─────────────┐
     (what to make, who does it,            │
      when, and where it will go)           │
                │                           │
                ▼                           │
     band produces real content             │
     (a show, a release, a video,           │
      a story only they can tell)           │
                │                           │
                ▼                           │
     content feeds the machinery            │
     (ContentSource, trusted facts)         │
                │                           │
                ▼                           │
   machinery spreads it everywhere ─────────┘
   (communities, press, fans, socials)
                │
                ▼
          more fans, more reach,
          more to augment next turn
```

**The machinery has no content of its own, and that is the point.** Every
failure so far came from the machine trying to originate — a fabricated anecdote
written from nothing, posted to a forum picked by member count. Every success
came from it carrying something real: sixteen fan-lifecycle messages that
actually reached people.

The band is the only source of truth. The machine supplies timing, routing,
reach and memory — the cumbersome parts — and never the substance. Strategy and
distribution are not two features; they are the two halves of one wheel, and the
wheel only turns if the band keeps feeding it something true.

---

## 2. What already exists — do not rebuild

Read this section before designing anything.

**Content supply chain** — `crowdrelay-domain/src/content_supply.rs`. A band
fact becomes scheduled artifacts, deterministically, with no LLM in the
decision. Source kinds `Event`, `Release`, `ShowCompleted`, `Video`, `Story`.
Artifacts `SignalPush`, `NewsletterBlock`, `SocialFeed`, `SocialStory`,
`LiveListing`, `PressHook`, `PostShowRecap`. Its own rule: *"Trusted facts only:
title, link, published timestamp; the story around it is never invented."*

**The brain** — `crowdrelay-brain`, 22.7k lines and 546 tests. **Written is not
the same as wired, and this section is the one place that confusion is
expensive**, because a module listed here is a module nobody builds. §4c carries
the audit; the short version:

- *Called by production:* `causal_model`, `efe`, `portfolio`, `reach`,
  `exploration`, `decision_value`, `strategy_learning`, `tenant_preference`,
  `platform_yield` (reranks template priority inside the growth-intelligence
  evaluators), `treatment_effect` (its `use_treatment_effect` flag gates the
  EFE scorer at four sites), and `hypothesis`'s persisted state, which gates
  whether a template may act and at what size.
- *Runs but is not consumed:* `change_point` detects shifts
  on the North Star series every cycle and only logs them. `hypothesis`'s
  promotion ladder is the one piece truly called by nothing — its own module
  doc calls it *"a design nothing calls."* Treat these as work to do, not as
  capability in hand.

**Creative attribution** — `crowdrelay-domain/src/creative.rs`, and the
discipline this whole document follows:

> *"A label cannot be added to an outcome after the fact."*
> *"Building the estimator before the data exists is how you end up with
> machinery that has never been evaluated."*

**Worker templates (14)** — reddit / telegram / metal-archives / bandcamp
scanners, community-engager, press-pitch, social-post, discord-poster,
telegram-poster, signal-inviter, growth-strategist, audience-research,
campaign-analysis. All are prompt builders producing structured drafts.

**Contact governance** — `viryaos_contact_governor`: 7-day cooldown per
normalised contact, `do_not_contact` honoured, reservation taken atomically
before send.

**Admission and topical screening** — the three walls added on 2026-09-14
between a draft and Reddit, after r/metalgearsolid.

**Booking supply** — `booking_discovery.rs`, with the rule that governs the
whole opportunity surface: **a candidate is not a target.** Promotion is a
human confirmation. `RouteKind` is `Email | SubmissionForm | Handle`.

**Live opportunity economics** — `live_opportunities.rs`: travel bands, costing
from real logistics (`costed_from_logistics`), committed vs pipeline shows,
annual target and stretch. An uncosted show can be prepared but never
auto-submitted.

**Fan geography** — the Signal overview already returns `top_cities` with
active fans per city. Virya today: Wrocław 11, Częstochowa 2, Namysłów 2, and a
tail. 17 of 22 fans are nearby-enabled.

**Task routing to the right band member** — `autopilot/team.rs` and
`domain/team_operations.rs`, and the most complete part of the whole system.
`TeamSkill` covers `Booking`, `Video`, `Photography`, `Social`, `EnglishCopy`,
`PolishCopy`, `Technical`, `Visual`, `People`, `Operations`, `Approval`,
`General`. `select_team_assignee` picks **capability first, fairness second**,
with stable tie-breaking so retries are deterministic, and a neutral score for a
member with no history — *"a new member has not failed to do anything"*. It
tracks capacity, open and recent assignments, and follow-through **per skill**,
so it learns who actually delivers what. It assigns an owner, schedules bounded
reminders, and queues provider-confirmed email through the normal execution
plane. Emissions: 7, confirmed 6.

**Approval surface** — per-context autopilot policies with confidence floors and
daily caps, the approval queue, evidence per decision, full audit trail,
inline approve on the Attention page.

**Executor** — `virya-n8n-primary` on `virya-home`: 70 active workflows,
heartbeat and receipt spooler on a five-minute schedule, 16 fan-lifecycle
messages genuinely delivered.

---

## 3. The three breaks (found 2026-09-14, all cheap)

**Break 1 — the operator is never told there is something to approve.**
`CrowdRelay — CrowdRelayOS approval notification` fails every run, seven times a
day:

```
WorkflowHasIssuesError
The 'Called by verified ingress' node has issues:
- At least 1 field is required.
```

One empty required field in one n8n node. This is why eleven actions sit in
`awaiting_approval` and nobody knows. **Highest value fix in this document.**

**Break 2 — n8n cannot authenticate.** Fifty `Authorization failed - please
check your credentials` in 24 hours, plus `Your request is invalid or could not
be processed by the service`. The heartbeat and the Spotify metric adapter work
(24/24 successes); everything that must claim and report work does not.

**Break 3 — nothing has been emitted since 13 September.** Separate cause,
trace after 1 and 2 are fixed.

**Not a break:** the paid verifier flag. `AGENT_VERIFIER_PAID_FALLBACK` gates a
chain on a path that carries no traffic. The default ceiling is already
`5_000_000` micro-USD ($5/month per workspace). Turning it on before breaks 1
and 2 are fixed buys nothing and would falsely mark a blocker cleared.

**Also not a break:** the production `agent-service` is vestigial in this
deployment — 48 hours of nothing but `/health`. The `crowdrelay-bridge` on
virya-home serves AREA (`/release`, `/verify-claim`, `/commit`, `/mailer`), not
the growth loop.

---

## 4. Principles

These are the rules that keep this from becoming another laboratory exhibit.

**1. Silence beats invented work.** If a cycle has no band activity to amplify
and no opportunity that clears its floor, it does nothing and says so. Most of
the "weird decisions out of the sky" disappear under this single rule.

**2. Every outward artifact states its evidence before it is sent.** Three
questions, answerable from data, not from a prompt:
- Which band fact is this about? (a `ContentSource` row, never a generated premise)
- Why this recipient specifically? (their own words — the community's notes and
  genre tags, the writer's recent coverage, the venue's routing)
- What did they last receive from us, and when? (`viryaos_contact_governor`)

Make it a type, not a convention. An action that cannot answer all three is not
sendable. Then "human-like" stops being a hope about prompt quality.

**3. A draft that would read identically to fifty recipients is refused.**
Checkable, and therefore a gate.

**4. Label first, estimate later.** Ship attribution now so outcomes carry their
reason; build the estimator when the labels have accumulated. This is
`creative.rs`'s rule and it is not negotiable.

**5. A candidate is not a target.** Promotion to anything that contacts a human
is a human confirmation.

**6. Provenance or refusal.** No contact without a recorded source. No peer
observation without a dated link.

---

## 4b. The plan hierarchy — what "shape the roadmap" means

A stream of good daily suggestions is still noise. Shaping a career means the
suggestions ladder into something. Four levels, each constraining the next:

**Horizon (6–12 months).** Where the band is trying to get. *"Headline 300-cap
rooms in PL / CZ / DE by next autumn."* The operator sets it; the system helps
by showing what comparable bands did on the way to the same place, and what the
current trajectory implies.

**Arc (4–12 weeks).** A campaign with a spine. *"Single in November: announce,
playthrough, video, then a five-date run through the corridor where the fans
are."* The system proposes arcs from peer evidence, band capability, the
calendar and fan geography. **The band approves the arc, not every step in it.**

**Week.** What has to happen this week to keep the arc on track. Derived, not
invented — if the video shoots on the 14th, the teaser is cut by the 10th.

**Day.** The one or two things to do now — and **who in the band does them**.
This is where `select_team_assignee` earns its keep: the beat needs video, the
member with the `Video` skill and the capacity gets it, with a reminder and a
follow-through record. Most days this is execution of an already-approved arc,
so nothing needs approving at all — it needs *doing*, by a named person who was
told.

### Why the hierarchy is the product

It converts the tool from *a thing that asks you questions every day* into *a
thing that runs a plan you agreed to*. That is the difference between augmenting
the work and adding to it.

It also fixes the daily-cadence trap directly:

- **Approve the plan, not every step.** Once an arc is approved, actions inside
  it run under the existing autopilot policy — the confidence floor and daily
  cap already exist per context. Approval becomes weekly-ish, not daily.
- **A suggestion that serves no current arc is refused**, unless it is genuinely
  urgent and time-boxed (a festival call closing, a peer moment worth riding).
  That is the anti-noise rule, and it also makes the output feel coherent instead
  of scattershot.
- **Cap what is outstanding.** No more than a few open suggestions at a time. A
  backlog of unanswered proposals is a chore, and chores get ignored.
- **One briefing, not N notifications.** A day's output arrives as a single
  readable thing: here is where the arc stands, here is what is due, here is
  what changed outside.
- **Suggestions expire.** Anything tied to a window dies when the window passes,
  and says so rather than rotting in a list.

### When the arc is off track

The most valuable thing a manager does is notice drift early. The system should
say it plainly: *"the single lands in 18 days, the video has no shoot date, and
the two support slots you wanted are now booked."* That is worth more than any
individual suggestion, and it falls out of having a plan to measure against.

### Roster and label

The same hierarchy, one level up. A label has a horizon across acts, arcs that
must not collide (two releases the same week), and a weekly view of which band
needs what. Routing, support slots and press capacity are all shared resources —
which is precisely the thing no collection of single-artist tools can coordinate.

---

## 4a. Four tenant archetypes, one machine

The loop does not change. The **outcome it is pointed at** changes, and so does
what counts as a peer, a fact and a fan.

| Archetype | The sentence they would say | Their "fans" | Their production events |
|---|---|---|---|
| **Band** | *Get more fans* | Listeners, followers, app installs | Shoots, studio, shows |
| **Roster / management** | *Every act grows, nobody is neglected* | The sum, per act | Each act's days, shared crew |
| **Label** | *Sell more* | Buyers, subscribers, catalogue listeners | Releases, campaigns, samplers |
| **Festival** | *Make a better festival* | Ticket buyers, returning attendees | The event itself, announcements |

### A festival is not an archetype. It is a shared object with three sides.

The table above lists festival as a tenant because a festival organisation can
hold an account. But the deeper truth is that **a festival is an event that
three different parties relate to at once**, and the same festival appears in
several tenants' worlds with different needs:

| Side | Who they are | What they want from that festival |
|---|---|---|
| **Organiser** | A label, a promoter, sometimes a band | Sell tickets, book a lineup that sells, fill the site, make people return next year |
| **Performer** | A band on the bill | Get booked, convert the slot into fans, harvest the day |
| **Audience** | Fans | Know it is happening, decide to go, bring somebody |

So the model is a `Festival` object — name, dates, site, capacity, lineup,
submission routes — and a **role** held by each tenant against it: `Organiser`,
`Performer`, `Partner`. A label may organise its own festival while three of its
bands play at other people's. The role decides what the machinery does; the
festival object is shared.

### What each side needs, from the same machine

**Organiser.** Lineup announcements phased across weeks, each one a
`ContentSource` and each one a reason for every act on the bill to post. Ticket
sales as the north star, which is the cleanest conversion of anything in this
document — a ticket is a purchase with a date on it. Peers are other festivals
in the same tier and region; watch them for announcement cadence, pricing moves
and bill shape. The harvest is the largest in the plan: one weekend yields sets,
crowds, backstage, artist interviews, the aftermovie and next year's teaser, and
almost none of it is captured well because nobody issues a capture plan before
the gates open.

**Performer.** Getting booked is Phase 3 — `booking_discovery` already models
published submission routes and the rule that a candidate is not a target. Once
booked, the slot is a production event with its own capture plan, and the
announcement is a `ContentSource` that should reach the band's own fans *and*
the festival's. Afterwards the day is harvested like any other.

**Audience.** Not a tenant, but the reason the other two exist. What they need is
simple and usually done badly: to hear it from the act they already follow,
early enough to plan, with a route to a ticket.

### The meeting point is where the leverage is

This is the part worth building carefully, because it is the thing no
single-artist tool can do.

**Announcement relay.** The organiser announces the bill. Every performing act
should carry that to its own audience — and in practice half of them forget,
post late, or post a flyer with no link. That is a scheduling and notification
problem with a distribution promise attached, which is exactly what this system
is for. The organiser gets reach they cannot buy; the band gets content it did
not have to make.

**Bill-mate discovery.** A festival lineup is a natural consent-edge graph.
Everyone on the bill shares an audience for one weekend — fans of act A are,
by construction, a warm audience for act B. The consent edge already exists and
is already capped, revocable and audited. A festival is the most defensible
occasion to use it, because the shared context is real and public.

**Shared harvest.** One weekend, many capture plans. The organiser films the
site and the crowds; each band films its own set and backstage; the material
cross-feeds. An act gets professional footage it could not afford; the organiser
gets a dozen acts posting all weekend.

### The boundary that must hold

Three sides means three trust boundaries, and this is where a careless
implementation would do real harm.

**An organiser never receives a performer's fan list, and a performer never
receives the organiser's ticket buyers.** Reach across the boundary happens only
through the consent edge — capped, revocable, audited, with a record of every
use — or through each party posting to its own audience. The festival being a
shared object must never become a shared database.

The same rule that governs cross-artist sharing on a roster governs this. It is
already built, and it is the reason this can be offered to three parties at once
without any of them having to trust the others with their audience.

**What stays identical across all four:** the evidence rule, the contact
governor, the approval queue, the harvest rule, Pareto, the arc hierarchy, the
distribution promise, the audit trail. **What is configured per archetype:** the
north star, what a peer is, which production events exist, and which formats
the catalogue surfaces first.

This is why the north star had to become a per-tenant choice rather than a
hardcoded metric, and why `weighted_audience` matters: a festival weighting
ticket buyers above followers is the same machinery as a band weighting Signal
fans above TikTok.

---

## 4a-2b. The three-sided lens — a rule of thumb for every interaction point

A festival is one meeting point. Gigs, interviews, releases, support slots,
merch and community posts are others, and the same four questions crack each of
them open.

**The lens:**

1. **What is each side *actually* buying?** Never the transaction. The
   transaction is the fee, the ticket, the stream. The purchase is the durable
   thing underneath it.
2. **Where do the three align?** That is where the machine should push, because
   effort there is not zero-sum.
3. **Where do they conflict?** Name it. A tool that pretends the conflict is not
   there will give confident, bad advice.
4. **What is the metric nobody measures?** Usually the proof that the shared
   asset is growing — and usually invisible to any party that sees only its own
   side.

### Applied

**Gig — promoter, band, crowd.**
The promoter is not buying tonight's bar take; they are buying **a room people
trust**, where an unknown band can be booked and still draw. The band is not
buying the door split; it is buying **a city** — one show in Wrocław is nothing,
three is a local base you can return to. The crowd is not buying a ticket; they
are buying **a night out**, and the band is often the occasion rather than the
point. *Shared asset:* a local scene where all three recur. *Metric nobody has:*
what share of tonight's room was at the last one.

**Interview or podcast — outlet, band, audience.**
The outlet is not buying content; it is buying **authority** — being the place
that covered them first. The band is not buying exposure; it is buying **a story
other people can repeat**, because a quotable line travels without you. The
audience is not buying information; they are buying **intimacy**, knowing
something before others do. *Shared asset:* the story itself. *Metric nobody
has:* whether an outlet's early coverage predicts which acts rise — which would
make that outlet provably worth pitching.

**Release — label, band, fans.**
The label is not buying week-one streams; it is buying **a catalogue that earns
for years**. The band is not buying a launch; it is buying **the next
opportunity** the release unlocks — the booking, the press, the sync. The fans
are not buying music; they are buying **belonging**. *Shared asset:* the long
tail. *Metric nobody has:* what share of day-one listeners are still listening
at ninety days.

**Support slot — headliner, support act, crowd.**
The headliner is not buying a cheap opener; they are buying **a night that feels
curated** and does not drain the room before they walk on. The support is not
buying exposure; it is buying **conversion in a room it could never fill
alone**. *Shared asset:* the evening's coherence. *Metric nobody has:* what
share of the headliner's crowd followed the support afterwards — which is the
number that should decide who gets the tour.

**Merch — band, fan.**
The band is not buying margin; it is buying **walking advertising and a superfan
marker**. Somebody wearing the shirt has self-identified as the top of the
funnel's inverse. The fan is not buying a shirt; they are buying **membership**.
*Metric nobody has:* whether merch buyers attend more shows than non-buyers —
almost certainly yes, and worth knowing by how much.

**Community post — community, band, members.**
The community is not buying content; it is buying **the health of the room**.
The band is not buying reach; it is buying **standing** — the right to be heard
there again. Members are buying **something worth reading**. *Shared asset:* the
room's quality. *Metric nobody has:* whether a band's presence in a community
actually produces fans from it, which is the only honest reason to post there.

### The pattern underneath

Every "metric nobody has" above is a **cross-side measurement**. Not one of them
can be taken by a party that sees only its own side:

- A promoter sees tickets, not who followed the band afterwards.
- A band sees followers, not which room produced them.
- An outlet sees traffic, not whether its coverage moved anything.
- A ticketing platform sees the transaction, not the fandom.

**This is the defensibility of the whole product, stated once.** The moat is not
the brain or the templates — those can be rebuilt. It is standing between sides
that each hold half of a measurement neither can complete, with a consent model
that lets the measurement happen without either handing over its audience.

### How to use the lens

When a new interaction point appears — a sync placement, a label showcase, a
livestream, a fan-club tier — run the four questions before designing anything.
The answers give the north star for that surface, the synergy to automate, the
conflict to leave to humans, and the number that proves it worked.

---

## 4a-2c. In their shoes — the lived reality, and what to actually do about it

The lens above is abstract. This is the ground truth it has to survive contact
with. Each item is a real frustration, paired with the specific behaviour that
answers it. Nothing here is a feature idea in search of a user.

### The band

**Four or five people with jobs.** Rehearsal twice a week, everyone tired.

- **One person does all the admin**, and it is always the same person. They
  resent it quietly and eventually stop. *Answer:* `select_team_assignee` spreads
  tasks by skill and capacity, and the follow-through record makes the imbalance
  visible before the resentment does.
- **"Someone should film this."** Nobody does. The shoot happens, and the
  making-of that would have carried three weeks of posts does not exist.
  *Answer:* the capture plan, issued the day before, to a named person.
- **Photos die on a phone.** Forty good shots from Saturday, used never.
  *Answer:* an ingest prompt after every production event — *"you have Saturday's
  photos; here are five posts they make."*
- **The gig is Friday and forty people come instead of ninety**, because the
  announcement went out on Wednesday. *Answer:* the promotion chain, scheduled
  backwards from the date, not forwards from when someone remembers.
- **Emails to promoters vanish** and the band cannot tell whether the pitch was
  bad or simply unread. *Answer:* Phase 3's routes, with reply tracking, so
  silence is measured rather than interpreted.
- **A great show ends and nobody in that room can be reached again.**
  *Answer:* the post-show capture, which is the single largest leak in a
  working band's life.
- **The group chat is where plans die.** *Answer:* one weekly briefing with what
  is due and who owns it.

**What really matters to them:** not looking like amateurs, and not burning out
the one person doing everything.

### The promoter

**Three to eight shows a month on thin margins.** One bad night hurts for a
quarter.

- **The fear is an empty room** — guarantee, sound, door staff, all sunk before
  anyone walks in. *Answer:* an advance-sales trajectory compared against past
  comparable shows, with the warning at T-14 when something can still be done,
  not at T-2 when it cannot.
- **Bands promise to promote and do not.** *Answer:* the relay, plus visibility
  of who actually posted. Not to punish — to know.
- **No way to tell who draws from who claims to.** *Answer:* fans-in-this-city
  before booking, and which act's announcement moved ticket clicks after.
- **Chasing assets every week** — photo, bio, links, stage plot. *Answer:* pull
  them from the act's own profile; stop asking humans for things a system holds.
- **The repeat crowd is the whole business** and nobody tracks it. *Answer:*
  repeat attendance per room, which no promoter currently has.

**What really matters to them:** knowing early whether the room fills, and
having something other than goodwill to make bands promote.

### The fan

**Follows two hundred bands, sees five in a feed.**

- **Finds out the day after.** The most common and most painful failure.
  *Answer:* nearby alerts for acts they actually follow — already built, and 17
  of Virya's 22 fans have it enabled.
- **Wants to go, has nobody to go with.** *Answer:* bring-a-friend mechanics,
  which the referral and voucher machinery already supports.
- **Discovers a band live and forgets the name by Tuesday.** *Answer:* the
  post-show recall — *"here is who you saw"* — within a day or two, while it is
  still a memory rather than a fact.
- **Buys a ticket, then hears nothing until the doors.** *Answer:* the run-up,
  including the running order for the acts they care about.

**What really matters to them:** not missing something they would have loved,
and having someone to go with.

### The thing all three want on the same night

Read the three lists together and the same event keeps appearing. The band's
half-empty Friday, the promoter's fear of it, and the fan who found out on
Saturday are **one failure seen from three angles**.

That is the argument against building per-side features. Build **one interaction
point end to end, for all three sides at once** — and the gig is the right first
one:

- It happens most often, so it produces learning fastest.
- All three sides are present, so the cross-side measurements start
  accumulating immediately.
- Virya plays them, so the first customer is served in week one.
- Almost every piece is already built: events sync, nearby alerts, referrals,
  the contact governor, team routing, the content chain — and even the
  ticket-sales-behind-pace detector. The genuinely missing piece is the capture
  plan: `capture_plan` matches nothing anywhere in the codebase. **Phase 1G**
  names that gap and the two others honestly.

**The gig, done properly, end to end:**

```
T-21  announce, with assets pulled not chased
T-14  advance-sale trajectory checked; if behind, targeted relay to fans in that city
T-7   each act prompted to post; promoter sees who did
T-2   fans who follow any act on the bill, within range, get told
T-0   capture plan in the hands of whoever is filming
T-0   the scan — QR at set end and at the merch table (§4e-1)
T+1   post-show recall to the room, which the scan is what makes reachable
T+3   harvest becomes three weeks of posts
T+7   the numbers: who came, who was new, who repeated
```

Every line of that is either already built or a small connection between things
that are. None of it needs a new model. **That is what nailing it looks like** —
and it is a better first target than any of the larger ideas in this document,
because it can be true within one month for one real band in one real city.

---

## 4a-3. Festivals, properly — what makes one good, and where the synergy is

### What each side is actually buying

**Organiser.** Not ticket revenue for one year — a **brand that returns**. A
festival that sells out once and dies has failed. The asset being built is
curatorial trust: the point at which people buy *before* the lineup is
announced, because the curation has earned it. That is the highest-margin
ticket in the industry and almost nobody reaches it. Everything else — bar,
merch, camping, sponsor — follows from attendance, and attendance follows from
trust.

**Performer.** Not the fee. A festival slot is worth playing when it produces
**fans who were not yours when you walked on stage**. A band playing to 400
people of whom 380 already knew them has been paid to stand still. The other
goods are real but secondary: professional footage, the artist area (bookers,
press, other bands), and the invitation back next year one rung higher.

**Audience.** Two things, and only one is the lineup. They came for the acts they
know; they *remember* the festival for the act they did not. Discovery is the
emotional payload. Everything else — clashes, queues, toilets, getting home — is
hygiene that can only lose you the year, never win it.

### Where the three conflict

Worth naming, because a tool that pretends these are aligned will give bad
advice.

- **Headliner spend versus bill identity.** Big names sell tickets and eat the
  budget that would have made the bill coherent.
- **Slots are scarce.** Every performer wants prime time; most cannot have it.
- **Multi-stage guarantees clashes.** The audience's "no clashes" and the
  organiser's "more acts" are directly opposed.
- **Who owns the attendee.** The organiser wants the data; the performer wants
  the relationship. This is the boundary from the previous section, and it is a
  genuine conflict, not a technicality.

### Where they align — the one shared asset

**Successful discovery.** Trace it:

```
audience discovers a band they did not know
        │
        ▼
that band gains a real fan from the weekend
        │
        ▼
organiser's curation is proven — "they book things I end up loving"
        │
        ▼
next year sells earlier, on trust, before the lineup drops
        │
        ▼
better acts accept, because the festival sells without them
```

Every side wins from the same event, and it compounds annually. **This is the
gist: a festival's durable asset is curatorial trust, and curatorial trust is
manufactured by discovery events.**

### The metric nobody has

Festivals measure tickets, bar spend, and social reach. Nobody measures the
thing that actually builds the brand:

> **Discovery rate — what share of attendees became a fan of an act they did
> not know before they arrived.**

It is unmeasurable for a normal festival. It is measurable here, because the
platform holds both sides of the edge: it can see a person attend, and see that
person follow, sign up to, or buy from an act on that bill afterwards — with
consent, through the edge that is already capped and audited.

Derived numbers that fall out of it, each useful to a different side:

| Metric | Who it serves |
|---|---|
| Discovery rate per festival | Organiser — the brand-building number |
| New fans gained per set | Performer — was this slot worth playing |
| Discovery rate per stage and per slot time | Organiser — which slots actually convert |
| Which act's announcement drove ticket clicks | Organiser — real pull versus vanity following |
| Attendee return rate year over year | Organiser — the only retention number that matters |
| Share of attendees who came for act X | Both — settles the fee argument with evidence |

The second-to-last is worth dwelling on. Bills are negotiated on follower counts
and guesswork. **Which act's announcement actually moved tickets** is knowable
here, and it changes how a festival is curated — and what a band can charge.

### Synergy at each phase of the festival year

**Booking, 6–12 months out.** Match acts to bills by *measured audience
overlap*, not genre tags. The platform can see that act A's fans overlap 30%
with the festival's past attendees and 5% with act B's — that is a curation
input nobody else has. For the performer, this is `booking_discovery`: published
routes, deadlines, a candidate is not a target.

**Announcement, 3–6 months out.** The relay from the previous section, done
properly: phased reveals, each act carrying its own announcement to its own
audience, timed so they do not collide. Measure which relay produced clicks.

**Selling.** Geography. The organiser knows which regions are under-selling;
the platform knows which acts on the bill have fans there. Target the relay at
the gap instead of blasting everyone. This is Pareto applied to ticket sales.

**Preparing, weeks out.** Clash detection using real overlap rather than genre
similarity — if 60% of act A's fans also follow act B, scheduling them opposite
each other is a self-inflicted wound. Capture plans issued to every act on the
bill. The audience gets a personal schedule built from who they actually follow.

**The weekend.** Shared harvest. Everyone filming, material cross-feeding, one
weekend producing a year of content for a dozen parties.

**After — the phase everybody wastes.** This is where the value leaks out, every
year, at every festival:

- The attendee discovered three bands and by Tuesday remembers one name, badly.
- The band played to new people and has no way to reach a single one of them.
- The organiser goes quiet for eleven months and rebuys attention next spring.

The follow-up is the single largest untapped thing in this document. Within
days: *"here are the acts you saw, with links"* to the attendee; *"here is the
size of the audience you played to and how many followed you after"* to the
band; and the discovery rate to the organiser. Each of those is a consent-edge
use with an unusually clean justification — the person was there, the context is
real, and the offer is something they actually want.

### Why this is defensible

A ticketing platform sees the transaction and not the fandom. A social platform
sees the fandom and not the bill. A festival's own CRM sees its attendees and
none of the artists' audiences.

**Only something holding all three sides can close the loop from bill to
discovery to next year's early sales** — and only with a consent model that lets
it do so without any side handing its audience to another. That model is already
built: capped, revocable, audited, with a record of every use.

---

## 4a-2. What 10/10 means

**The tenant works with the tool and sees a steady rise.**

Not a dashboard that looks busy. Not a clever decision log. A number the tenant
cares about, going up, over months, with the tool's fingerprints on it — and the
tenant able to say *why* it went up without being told what to think.

Three conditions, all required:

1. **Synergy.** The machine amplifies what the tenant already does rather than
   running a parallel programme they have to service. If the tenant is working
   *for* the tool, it has failed regardless of its metrics.
2. **Steady rise.** Not a spike. `change_point.rs` already runs the detection
   every cycle on the North Star series — it can tell a viral week from a
   changed slope, but nothing consumes the shifts it finds, and the honest
   claim needs a consumer (§4c).
3. **Visible attribution.** The tenant can see which actions preceded the rise
   and what the system claimed beforehand. `calibration.rs` is what would stop
   this being a story told afterwards — it records every prediction against its
   outcome and nothing reads it, which is why §4c puts the read path ahead of
   the rest.

**The failure that looks like success:** numbers rise because the band toured
hard that quarter, and the tool takes the credit. Guard against it by recording
the prediction *before* the outcome — which the evidence rule and the label-first
discipline already require.

---

## 4b-2. The content format catalogue — stable, seeded, genre-aware

Two kinds of knowledge, and they age very differently.

**Who is setting the pace** changes every few months and no model can be trusted
on it — that is the peer list, typed in by the band.

**Which formats work** has been stable for a decade across metal, dance and pop.
Playthroughs, making-ofs, collabs, live sessions, gear rundowns: these were
working in 2015 and they work now. This is safe to ship as seed data, and it is
the difference between an empty suggestion engine and one that is useful on day
one.

The catalogue is a **prior, not a rule.** `hypothesis.rs` then learns which
entries work for *this* band and retires the ones that do not.

### What each entry carries

| Field | Why |
|---|---|
| `name` | What to call it to the band |
| `purpose` | Acquisition, retention, conversion, or credibility |
| `effort` | Low / medium / high — decides whether it fits this week |
| `skill` | Maps to `TeamSkill`, so it routes to the right member |
| `requires` | A release, a show, or nothing |
| `distribution` | Which artifacts and channels it feeds — the promise |
| `cadence` | One-off, recurring, or tied to a release |
| `genre_fit` | Where it lands hardest |

The `requires: nothing` entries matter most. They are what the system suggests
when no release is coming, and they are how daily cadence works without
inventing a premise.

### Tied to a release

| Format | Effort | Skill | Notes |
|---|---|---|---|
| Single announce with pre-save | Low | Social | The spine every release campaign hangs on |
| Lyric video | Low | Visual | Cheapest way to give a track a video surface |
| Official video | High | Video | The arc's centrepiece; plan backwards from the shoot date |
| Playthrough | Medium | Video | Metal staple, and the most reliable format in the genre |
| Track-by-track commentary | Low | EnglishCopy / PolishCopy | One session yields a week of posts |
| Making-of / studio diary | Medium | Video | Works *during* the work — no extra day needed |
| Behind the artwork | Low | Visual | Carries the styling trend directly |
| Stripped or acoustic version | Medium | Technical | Second life for a song already released |
| Remix or extended edit | Medium | Technical | Dance-first; also a collab surface |

### Collaboration — the highest-leverage category

Every entry here reaches somebody else's audience, which is the only format
class that does.

| Format | Effort | Skill | Notes |
|---|---|---|---|
| Guest feature | Medium | People | Both audiences, one track |
| Split release | Medium | Operations | Shared cost, shared reach, common in metal |
| Cover of a peer's song | Low | Video | Cheap, and the peer usually notices — which is the point |
| Remix swap | Medium | Technical | Dance equivalent of a split |
| B2B set | Medium | People | DJ-native collaboration |
| Compilation or label sampler | Low | Operations | Label-level lever across a roster |
| Fan cover feature | Low | Social | Costs nothing, rewards the people who already care |

### Live

| Format | Effort | Skill | Notes |
|---|---|---|---|
| Tour or show announce | Low | Social | Feeds `LiveListing` automatically |
| Live session, one take | High | Video | The credibility format |
| Soundcheck or backstage clip | Low | Video | Filmed on a day already spent |
| After-movie | Medium | Video | Sells the *next* show, not the last one |
| Tour diary | Low | Social | Recurring, low effort, high attachment |
| Listening party or meet-up | Low | People | Converts fans into attendees |

### Evergreen — requires nothing

| Format | Effort | Skill | Notes |
|---|---|---|---|
| Gear rundown | Low | Video | Reliably over-performs in metal and dance |
| Influences / what we are listening to | Low | Social | Also a peer-discovery signal in itself |
| Q&A or AMA | Low | People | Works in communities where the band is admitted |
| Rehearsal clip | Low | Video | Filmed during work already happening |
| Reaction to own older material | Low | Video | Anniversary-friendly |
| Merch drop or restock | Low | Visual | Conversion, not reach |
| Release anniversary | Low | Social | The calendar supplies the trigger |
| Fan content feature | Low | Social | Tattoos, covers, photos from the pit |

### Credibility

| Format | Effort | Skill | Notes |
|---|---|---|---|
| Interview or podcast | Medium | People | Phase 3 finds the shows |
| Press feature | Medium | EnglishCopy | Phase 3 finds the writers |
| Playlist curation | Low | Social | Positions the band among its peers |
| Cause or charity tie-in | Medium | People | Only when genuine; fake ones are read instantly |

### How the catalogue is used

1. The arc needs a beat. The catalogue is filtered by what the band can
   actually make — `requires`, `effort`, and which skills exist on the roster.
2. The trend layer raises or lowers entries: peers are doing playthroughs and
   the fans are reacting, so playthrough moves up this fortnight.
3. `efe.rs` ranks what survives, balancing expected fans against what the band
   would learn by trying something new.
4. The suggestion carries its distribution promise, because `distribution` is a
   field on the entry rather than a guess.
5. The outcome updates the concept's lifecycle state for this band.

**Genre-neutral by design.** Every entry above works in metal, dance and pop
with only the platform mix changing. `genre_fit` biases the ranking; it never
removes a format, because the lateral peer tier exists precisely to import moves
a genre has not tried yet.

---

## 4b-3. The harvest rule — one day of work, many outputs

**The governing efficiency rule: never leave a production day with one asset.**

A video shoot is a day of five people's time, a location, gear and probably
money. It should not produce one video. It should produce the video, the
making-of, the behind-the-scenes, the outtakes, the stills for artwork and
socials, the gear shots, two teasers, and a vertical cut. Same day, same people,
same cost — eight outputs instead of one.

This is the difference between a band that posts twice a month and a band that
looks constantly active, and it costs no extra days.

### The catch, which is the whole design problem

**The multiplier is only available if the band is told before the shoot.**
Nobody can film a making-of afterwards. The behind-the-scenes shot that did not
happen cannot be recovered, and "we should have filmed that" is the most common
sentence in a band's history.

So the capture plan must be issued **ahead of the production day**, routed to
the member who will be holding the camera, with a short list of what to get
while everyone is already there. That is the single highest-leverage thing this
system can do for a working band, and it is pure scheduling — no model required.

### Three new units

**Production event** — a day the band is doing something that generates
material: a video shoot, a studio session, a rehearsal, a show, a long drive, a
merch photoshoot, a festival appearance.

**Capture plan** — issued before the event. *"Wednesday's shoot: get 10 minutes
of handheld on set, one interview clip per member, 30 stills, the gear laid out,
and a vertical of the last take. Tomek has the camera."* Assigned through
`select_team_assignee` like any other task, with a reminder the morning of.

**Harvest** — the outputs, each landing as its own `ContentSource` with its own
distribution and its own place in the arc's calendar. One shoot on the 14th
becomes posts on the 16th, 19th, 23rd, 28th and into the next month.

### What this changes in the model

**Effort must be marginal, not absolute.** The catalogue scores each format in
isolation, which is wrong the moment a production day is already happening. A
making-of is *high* effort standalone and *near-zero* during a shoot. Every
format therefore carries two numbers:

- `effort_standalone` — the cost of doing this on its own day.
- `effort_marginal` — the cost when attached to a production event that is
  already scheduled.

The suggestion engine should almost always prefer marginal work. That is what
"minimum energy, maximum effect" means arithmetically.

**The objective becomes fans per band-hour, not fans per action.** `efe.rs`
already carries a risk term; adding a cost term denominated in the band's own
hours makes the ranking optimise what the band actually pays: their time. A
suggestion that adds one output to an existing day should outrank a suggestion
that adds a day, unless the second is dramatically better.

**Yield ratio is a headline metric.** Outputs per production day, tracked over
time. A band at 1.0 is wasting most of what it does. A band at 6 has found the
leverage. This number belongs on the console next to the fan counts, because it
is the one the operator can move directly.

### Harvest maps for the big three

**Video shoot day** — official video, making-of, behind-the-scenes, outtakes and
bloopers, stills for artwork and socials, gear and setup shots, one vertical
cut, two teasers, one interview clip per member.

**Studio session** — track-by-track commentary, tracking clips, a producer or
engineer moment, room and gear shots, a rough-mix teaser, a "how this part came
about" story.

**Show or tour day** — live footage, crowd shots, soundcheck, backstage,
after-movie material, merch table stills, fan content collected on the night,
a tour-diary entry, and the next show's promo shot.

### Why this also fixes daily cadence

Section 4b worried that daily suggestions become a chore. The harvest rule
resolves it: **the band works occasionally, the machine publishes continuously.**
One shoot day fills three weeks. Most days need no new band effort at all — only
the distribution the system already does. The daily briefing becomes *"this goes
out today, nothing needed from you"*, which is the correct shape for a tool that
claims to remove work.

---

## 4b-4. Pareto — find the vital few, then stop

The harvest rule says get many outputs from one day. Pareto says **not all
outputs, days, channels or fans are worth the same** — and the system's job is to
find the few that carry the result and ignore the rest without guilt.

This is a stop rule as much as a ranking rule. Most tools fail by doing
everything adequately. The band has four people and evenings.

### Where the 80/20 actually sits

**The diagnosis already proved it.** One empty required field in one n8n node is
currently costing more than every unbuilt feature in this document combined.
That is the whole principle in one example: the fix is minutes, the return is
the entire loop. Rule 1 at the top of this document — *nothing new is built
while something built is broken* — is Pareto, stated as a build rule.

**Channels.** Most fans arrive through a few surfaces. `reach.rs` measures
which; `platform_yield.rs` already reranks template priority by platform
audience growth — a different question than §4e-4's channel-to-retained-fan
provenance, which §4c resolves separately. The distribution promise should lead with the
two or three that carry the tenant's actual return, not list nine to look
thorough. A promise of nine places where seven are dead is worse than a promise
of two that work.

**Fans.** A small fraction of any fanbase drives most attendance, merch and
word of mouth. Virya has 20 active fans, 18 marketing-consented, 17
nearby-enabled — at this size the vital few are nameable individuals. Treating
all 20 identically wastes the handful who would bring a friend to a show.

**Formats.** Two classes carry disproportionate return and both are already in
the catalogue:
- **Collaborations** — the only class that reaches someone else's audience.
- **Harvest-attached work** — near-zero marginal cost on a day already spent.

Everything else is the tail. Useful, but not where the arc should start.

**Communities and contacts.** A handful of places and people will produce most
replies. The refusal sets and the screening walls already exist to find them;
the point of a short list is that it is short.

**Research spend.** The same logic applies to the LLM budget: a few sweeps
return most of the usable rows. Peer observation and press discovery earn their
cost; broad speculative crawling does not. Spend where the rows land.

### The rules that follow

1. **Rank, then cut.** The suggestion engine proposes the top two or three, not
   everything above a threshold. `efe.rs` already produces the ordering; the
   discipline is truncating it.
2. **Name the tail out loud.** *"Six other things are possible this month;
   these two carry most of it."* The operator can ask for the rest. They rarely
   will, and that is the point.
3. **Effort-weighted, always.** Value per band-hour, not value. A thing worth
   half as much at a tenth of the cost wins.
4. **Cut what does not earn.** `hypothesis.rs` already has `Retired` as a kill
   switch. Use it. A concept that has not produced in six attempts stops being
   offered.
5. **Concentrate, do not spread.** Two communities engaged properly beat nine
   posted at. The same is true of press contacts, platforms and cities.
6. **Measure the concentration.** What share of new fans came from the top
   channel, the top city, the top format? If the answer is flat, either the
   measurement is wrong or nothing is working yet — both are worth knowing.

### The honest caveat

Pareto is a heuristic for allocating attention, not a law of nature. Two places
where it misleads:

- **Early on there is no data to rank by.** With 20 fans and one measured
  outcome, "the vital few" is a guess. This is exactly what `exploration.rs` is
  for: spend a little deliberately on the unknown until there is something to
  concentrate on. Concentrating on noise is worse than spreading.
- **Some low-return work is structural.** Consent records, provenance, the
  audit trail and the evidence rule never appear in an 80/20 cut and must
  happen anyway. Pareto governs *where effort goes*, never *which rules hold*.

---

## 4c. The stochastic machinery — what production calls, and what it does not

An earlier draft of this section listed eight brain modules and said each one
"already answers" a question the suggestion layer needs. That was checked on
2026-09-15 by looking for each type in `crowdrelay-application`, `-infra`,
`-worker` and `-api`, and re-checked against actual call sites. The finding is
not "dark modules" but **unconsumed machinery**: `change_point`
detects North Star shifts every cycle and only logs them; `hypothesis`'s
promotion ladder is the one piece genuinely called by nothing. `platform_yield`
and `treatment_effect` are wired and deciding. `calibration` now both corrects
predictions (it always did) and reports itself — the operator read path landed
in Sprint 2 (`0073e14`): `/ops/attention` and `/ops/cycles` carry per-regime
`{predictions, bias, slope, mae}`, null where a regime has no observations.
What is still missing is a *decision* that reads it — it informs, it does not
yet gate or alert.

The distinction matters more here than anywhere else in this document, because
this section sits next to §2, which is titled *do not rebuild*. A module listed
as existing is a module nobody builds. If it is written but uncalled, the
feature is absent and the plan has hidden that fact behind a filename.

`hypothesis.rs` says this about itself, and it is the model for the rest:

> *"So the promotion ladder described above — `Testing` → `Paper` →
> `MicroLive` → `Active`, resurrection counting, the observation thresholds —
> is a design nothing calls. Saying so here costs a paragraph; leaving a reader
> to infer from the type that a template earns its way up the ladder costs them
> the afternoon it takes to find out it does not."*

| Module | Called by production | Verdict |
|---|---|---|
| `causal_model` | yes — 9 files | use |
| `reach.rs` | yes — `ReachChannel`, `ReachMetrics` | use |
| `exploration.rs` | yes — `ExplorationMemory` | use |
| `efe.rs` | yes — 3 files | use |
| `hypothesis.rs` | **state only**; the ladder is uncalled | use the state, build the ladder |
| `calibration.rs` | **yes** — corrects predictions (3 sites) + reported on `/ops/attention` and `/ops/cycles` | a decision/alert that reads it — §4g's remaining piece |
| `change_point.rs` | **runs, unconsumed** — detects North Star shifts, logs only | Phase 3.5: a consumer plus peer streams |
| `treatment_effect.rs` | **yes, self-gating** — `use_treatment_effect` at 4 sites | none — the flag already waits for real n |
| `platform_yield.rs` | **yes** — `rank_templates` inside both evaluators | keep; §4e-4 is a different question, built separately |

### What is wired, and what it buys

**`efe.rs` — which suggestion is worth the band's weekend.**
Expected Free Energy balances the trade-off directly:

```text
EFE = -(w_pragmatic * expected_fans
      + w_epistemic * information_gain * predict_std
      + w_exploration * novelty)
      + w_risk * predict_std
```

A content suggestion has a pragmatic value (this may win fans) and an epistemic
one (we learn whether playthroughs work for *this* band). Ranking suggestions by
EFE is the operation the opportunity queue already performs — a new candidate
type feeding an existing scorer, no new theory.

**`causal_model` — did the action do anything.** Wired and in use.

**`reach.rs` — where the distribution promise points.** The promise lists
places; this decides which places are worth listing.

**`exploration.rs` — deliberate variety.** Without it the band repeats the one
thing that worked until it stops working.

**`hypothesis.rs` — partly.** `HypothesisState` is live: persisted per
`(workspace, template)`, loaded onto every growth snapshot, and read for
`may_act` and `sizing_bps`. Production moves a template between `Active` and
`Degraded` through walk-forward validation, and a `Retired` template produces
nothing — a kill switch at template level. The promotion ladder is not wired.

### The four the audit named, and the decision for each

**`calibration.rs` — read path landed; the decision that reads it is next.**
This document already argues the case in its own words: *"a suggestion engine
that cannot report its own miscalibration is a horoscope."* Done in Sprint 2
(`0073e14`): `BrainSelfAssessment.calibration` carries each regime's
`{predictions, bias, slope, mae}` to `/ops/attention` and `/ops/cycles`, read
straight out of the persisted causal-model checkpoint — every regime
independently `null` until it has observations, so "no evidence" and "zero
bias" stay different answers. Deliberately informational for now: it does not
feed `needs_attention`, and nothing decides from it yet. The remaining work is
that decision — §4g's uncomfortable advice and §6's proof metrics are the
consumers this was built for.

**`change_point.rs` — give it a consumer in Phase 3.5, and not before.** It
already runs: `detect_fan_growth_shifts` fires every cycle on the North Star
series, and a detected shift reaches a `tracing::info!` and nothing else. The
Phase 3.5 work is the missing half — peer-observation streams, where CUSUM
detects trend *onset*: *"playthroughs went from 2 of 9 peers to 6 of 9 in
three weeks"* is a change point rather than a vibe. That is the whole value of
trend-following in §3.5 — and it needs both the streams and a decision that
reads the result.

**`treatment_effect.rs` — already holding; leave it.** §4i-5 establishes that
release-level n stays in single digits for years. The "hold" is already
implemented: `use_treatment_effect` is read at four production sites and only
flips on when the posterior carries evidence, so the estimator self-gates
rather than being wired off. `TreatmentAssignment` and `TreatmentAwareStats`
keep recording treatment vs control on every dispatch meanwhile — the evidence
accumulates and the estimator earns its way in at post level, where n is real
inside a year.

**`platform_yield.rs` — keep it; it is not the §4e-4 candidate.** It is called
— `rank_templates` reranks the strategy's template priority inside both
growth-intelligence evaluators and the cycle preview. But it answers "which
platform's audience grows," measured on `platform_growth` rows — not §4e-4's
"which channel produced retained fans," which needs `fan_acquisition_events`
provenance joined to retention. Folding it into §4e-4 would mean changing what
it measures; leaving it doing template rerank is honest because that is a real,
used function. Source ROI is separate work.

### The rule this section now follows

**A module named here carries its wiring status.** "It exists" and "it runs" are
different claims, and only the second one means the feature is available. When
that changes, this table changes with it.

---

## 4d. What the LLMs are for, and what they are not

First-party LLM support exists and the scanners already use web access:
`metal-archives-scanner`'s own comment notes *"the LLM has web access via its
provider and can fetch the MA search results directly"*. The capability is there.
The question is what it is allowed to produce.

**LLMs fetch and extract. The Rust brain decides.** That split is the
architecture's most valuable property, and it is why a fabricated anecdote was a
single incident rather than a systemic failure.

Every research task returns **rows, not conclusions**:

- A `PeerObservation` with a dated link — not "Spiritbox are doing well with
  playthroughs lately".
- A press contact with the article that proves the beat — not "this writer
  covers metal".
- A venue with a published route and a capacity — not "this looks like a good
  fit".
- A styling note with three linked examples — not an adjective.

Anything a research task cannot attach a link to is dropped on write, against
the same kind of refusal set the community screen already uses.

**Where LLM research pays most, in order:**

1. **Peer observation sweeps** — what the archetypes released this fortnight.
2. **Press and interview discovery** — who covered comparable records, with the
   article as evidence and a staleness horizon.
3. **Venue and festival routes** — published submission routes, deadlines and
   capacities, for `booking_discovery` to screen on write.
4. **Fan-side signal** — what the communities the band is admitted to are
   engaging with this month.
5. **Styling sweeps** — the visual wave, as links.

This is where the spend goes once the loop runs, and it is worth it. Research is
the one job where an LLM beats a human with a weekend, and it is exactly the
cumbersome work the band should never have to do.

---

## 4d-2. The voice rule — and the half of it that is not built

Every template that drafts something a person receives now carries one
instruction: sound like the tenant, learned from the tenant's own recent
material rather than from a style description. It is wired — `voiceRule()` in
`crowdrelay-agents/src/templates/catalog.ts`, applied to the six `content`
templates, with `list_content_sources` added to all of their data scopes so the
samples are actually in front of the model. Five of the six could not see a
line the band had written before this.

It was worth doing because the alternative was already visible: two templates
drafting for the same band disagreed about its register, one told to avoid
"hype stacking" and the other to write "energetic" posts with `#metalmusic`
hashtags. Both were producing drafts for real people.

**What is not built, and needs deciding rather than coding:**

- **Nothing verifies the draft matches.** The rule is an instruction to a model,
  and `src/agent/verify.ts` already runs a grounding gate on structured
  outcomes. A style check could live there, but "does this sound like them" is
  not a fact a verifier can settle the way it settles "is this contact real".
  The operator approving the draft is the real gate today, and that is honest —
  it should not be described as enforced.
- **A tenant with no material gets the fallback.** "Write plainly, invent no
  personality" is the right default and it is still a default. §4i's cadence
  work is what fills the shelf; until a tenant has posted, the machine has
  nothing to imitate and should not pretend otherwise.
- **`community-engager` still hardcodes one tenant's voice** — *"This is Virya's
  voice"* — in its own prompt. That predates the general rule and is being
  actively edited in another session, so it was left alone. It needs the same
  treatment: the post *shape* for Reddit is tenant-neutral and should stay; the
  register belongs to the samples.
- **The brain does not know about any of this.** It dispatches the template and
  reads the outcome; register is a prompt-layer concern. If voice ever becomes
  something to measure — did posts in the band's own register outperform the
  generic ones — that is a treatment-effect question and §4c's rules about n
  apply before any estimator is built.

## 4e. GET MORE FANS — the aggregation engine

### 4e-0. The gap this section closes

This section exists because of an asymmetry in everything before it. The plan up
to here is strong on **amplification** — take what the band made and get it in
front of the people who already follow them — and was thin on **aggregation**:
turning people who do not yet follow the band into people who do. §4e, §4f and
§4h are the correction.

That asymmetry sets the outcome ceiling. Amplification of a 22-fan audience is
amplification of 22 people. The machine can be perfect and the number stays
small, because nothing in the loop adds anyone. §7 correctly refuses to promise
follower growth; that refusal is about *promising*, not about *trying*.

So state the rule plainly, because it is the north star in the repository's own
words and every section below serves it:

> **Get more fans. Real ones. The people are already online and reachable —
> gather them properly rather than shouting at them.**

Four places produce new fans, ranked by how warm the person already is. Warmth
is the only thing that matters, because a warm person converts at a rate a cold
one never approaches, and every one of these is consented by construction.

| Rank | Source | Why warm | State |
|---|---|---|---|
| 1 | **The room** — people physically at a show | They chose to be there, tonight | machinery built, ritual missing |
| 2 | **The bill** — fans of the other acts playing | Same night, same taste, self-selected | `EventCrossbill` exists, used rarely |
| 3 | **The corridor** — audience overlap with a peer tenant | Measured overlap, not guessed | needs two tenants, not thirty |
| 4 | **The places** — communities the band is admitted to | Admitted, screened, cooldown-governed | `audience_graph.rs`, built |

Nothing below is a new subsystem. Every one is a ritual, a cadence change, or a
measurement placed on machinery that already exists.

### 4e-1. The room — the scan ritual

**This is the highest-leverage item in the entire document.**

§4a-2c names the biggest leak in a working band's life: *a great show ends and
nobody in that room can be reached again.* The plan so far answers it with the
post-show recall, which is a notification — it can only reach people already
known. The room itself still evaporates.

Correct a statement made earlier in this document while planning Phase 1G: the
capture machinery for the room **is built**. `crowdrelay-infra/src/concert_qr.rs`
holds *"concert QR campaigns and check-ins"* with campaign creation, revocation,
signed tokens, and **idempotent fan check-in**. `beacon_signal` exists alongside
it. The gap is not code. The gap is that no show has ever run one — Virya has
zero attendees on record, and a check-in table nobody triggers is worth exactly
as much as one that does not exist.

So make it a **designed moment**, not a feature:

- The capture plan (Phase 1G, gap 1) ends with **the scan** — QR on the screen
  at set end, held at the merch table, on the setlist taped to the monitor.
- Scan gives instant follow plus consent, in one tap, with no account.
- Next day the post-show recall lands referencing **that night** — *"here's who
  you saw at Klub X on Friday"* — which is the moment the memory is still warm.

Why this bends the band's ceiling more than anything else here: the room is the
largest warm audience a band ever stands in front of, and it is currently 100%
loss. A band playing 40 shows a year that captures **8% of each room** out-earns
every other channel in this plan combined, and it compounds, because those people
are then reachable for the next show in that city.

It also fixes the measurement gap honestly — see the Phase 1G correction below.

### 4e-2. The bill — make crossbill routine, not ceremonial

`AmplificationPurpose::EventCrossbill` already exists in
`crowdrelay-domain/src/portfolio.rs`, described as *"shared-billing push around a
co-attended event or festival slot"*. The plan uses it for festivals. Festivals
happen a few times a year. **Bills happen every week.**

Bill-mate audiences are the warmest cold audience that legally exists: same
night, same room, same taste, and the introduction has an honest reason — *"we
are playing together on Friday."* Make it the routine occasion:

- At T-21, compute audience overlap with the other acts on the bill.
- Above a threshold, propose a joint announcement — both audiences, one night.
- After the show, the reciprocal offer: their crowd is offered the other act.

**Two hard constraints, both already in the code, neither to be weakened:**

1. `portfolio.rs` states *"Caps outvote ambition"* — `max_campaigns_per_month`
   and a per-fan cooldown bind. A weekly cadence of crossbill will hit a monthly
   cap, and the correct outcome is that it **stops**, not that the cap rises.
   Which bill to spend the month's allowance on becomes a real decision, and it
   is exactly the kind of decision `efe.rs` exists to make.
2. **Reciprocity, or this becomes spam between tenants.** If every act asks every
   bill-mate for audience, the network is a mutual extraction machine and fans
   pay for it. The rule: **an act that has never carried a bill-mate's
   announcement does not get carried.** Give before take, measured, visible to
   both sides. This is not politeness — without it the whole crossbill idea
   poisons its own well within a year.

### 4e-3. The corridor — form bills, do not only service them

The earliest genuinely multi-sided value in this document, and it needs **two
tenants, not thirty**:

> Band A and Band B share 30% audience overlap. A's confirmed dates and B's
> bracket a four-day gap. There is a bookable room between them. Split the drive.

`live_opportunities.rs` already costs travel from real logistics, and
`CalendarRoutingConflict` in `growth_debt.rs` already reasons about distance
between consecutive shows. The missing piece is *"who shares this corridor"* —
overlap plus geography plus an open date.

A single-tenant tool cannot structurally do this. That makes it the first thing
the network earns from, and it arrives long before festival density does.

### 4e-4. Source ROI — where the hours actually go

*Corrected 2026-09-15 against the code (the earlier paragraph described a table
that does not exist):* `fan_acquisition_events` records `source` (consent
free-text), `campaign_id`, `anonymous_visitor_id`, `referrer_fan_id`,
`occurred_at` — the `event_kind`/`channel`/`source_target` columns live on
`fan_provenance_events` (migration 0175). `acquisition_channel.rs` carries
`ChannelAttribution` with an explicit `UnattributedReason`.

**The read half is already built and live** — this section's "nothing reads
it" was wrong. `load_acquisition_channels` serves
`/v1/control-plane/autopilot/acquisition-channels` and
`/v1/admin/autopilot/acquisition-channels`, and the console renders it
(`AcquisitionChannelsPanel.tsx`): per-channel `signups`, `activated_30d`
(trailing-window meaningful action — net of churn), `activation_basis_points`,
and named `UnattributedGroup`s, joined click→signup through the visitor
cookie. What is still true: **nothing decides from it.**

The measured state in prod today: 23 acquisition events, all
`source='public_signup'`, zero campaign-bound, one via referrer — one
measured channel, honestly reported.

**The real remaining gaps, in order:**

1. **Every production fan-creation path now writes an acquisition event —
   DONE 2026-09-15, `4aebe35` + `47e4f39`, deployed `da39b05`.** The earlier
   read ("only `POST /v1/fans`") is closed: `record_fan_arrival` (now `pub`
   in `crowdrelay-infra::acquisition`) covers the room (`concert_qr`,
   correlated by the check-in's request id) and CTE-folded provenance covers
   `fan_import:{origin}` / `fanbase_ingest:{run_id}` — written only for fans
   the INSERT actually creates. The two api-side paths resolved without the
   feared port: the ratchet counts literal writes, and a repository call adds
   none — `ticketing/payments.rs` reads `xmax = 0` on its upsert to tell a
   created fan from a repeat buyer (`ticket_purchase`, correlated by
   `ticket_order:{order_id}`), and `synesthesia/rewards.rs` records
   unconditionally because reaching its INSERT arm already means the fan is
   new (`synesthesia_claim`, correlated by `synesthesia_run:{run_id}`). The
   contract gate's exception list is empty; every `INSERT INTO fans` site is
   instrumented, and a live-Postgres test pins the xmax on-conflict contract
   across two transactions.
   *Done when:* ~~the two named api-side paths write acquisition rows in the
   same transaction~~ — met.
2. **No decision reads the channel table.** `efe.rs` has no channel input;
   the causal hierarchy stops at `target_key = "community:<uuid>"`. A
   channel-level ROI input is an estimator built before its data exists —
   at one measured channel it has nothing to rank. *Done when:* the
   evaluator consumes channel-level `activation_basis_points` only when
   ≥2 channels carry measured conversions (self-gating, like
   `use_treatment_effect`), and reports "insufficient evidence" below
   that — the machinery self-describes rather than vacuously ranking.
3. **Two retention definitions coexist** and §4e-4's "net of churn" must
   pick one deliberately: the channel readout uses trailing-30d
   `fan_last_meaningful_action`; the measurement spine (Y30) uses
   `status='active'` at `created_at + 30d`. *Done when:* the channel
   readout and §6's "still engaged at 30/90 days" cite the same
   definition in one named place.

Verified non-gaps (checked before "fixing"): `record_community_conversion`
requiring `channel_community IS NOT NULL` is correct scoping, not a hole —
every `conversion` reader filters `community = $2`, and the channel
readout joins clicks→signups itself rather than reading provenance.
`fan_provenance_events` `interaction`/`durability` kinds have zero writers
by design (durability is derived, `observation.rs`).

### 4e-4b. Which objective wins — the precedence rule

This document now contains **three different things the system maximises**, and
nowhere until this paragraph says which one governs. That is a real hole, and it
produces contradictory dispatch the first time they disagree.

- **The north star metric**, chosen per tenant — `weighted_audience`,
  `spotify_followers`, `activated_fans_30d`, and the rest.
- **Source ROI** (§4e-4) — spend hours where fans provably come from.
- **The portfolio optimizer**, which maximises *expected incremental fans*
  subject to budget, overlap and fatigue.

The conflict is concrete. A tenant whose north star is Spotify followers, whose
measured best source is the room, and whose optimizer ranks by incremental fans,
has three answers to *"what should we do on Tuesday?"*

**The precedence, in order:**

1. **The north star decides what counts as a win.** It is the tenant's own
   declared choice and the one thing they set deliberately. Source ROI and the
   optimizer both measure *progress toward it*, not toward fans-in-general. A
   room scan for a Spotify-north-star tenant is worth what it contributes to
   Spotify followers, not what it contributes to a generic fan count.
2. **Source ROI decides where the effort goes** among the actions that serve the
   north star. It is an input to value, never a competing goal.
3. **The optimizer decides the final set**, applying budget, overlap and fatigue
   to candidates already valued by 1 and 2. It arbitrates; it does not set the
   objective.

Two consequences worth stating, because both are easy to get wrong:

- **`expected_fans` in the optimizer must be expressed in north-star units**, or
  step 1 is decorative. A tenant measured on ticket buyers and a tenant measured
  on Signal installs should get different dispatch from identical candidates.
  This is the single most important line in this subsection.
- **When the north star and the measured evidence disagree persistently, say so
  rather than silently overriding.** If a tenant chases Spotify followers while
  every fan they keep arrives through the room, that is exactly the
  uncomfortable advice §4g exists to deliver — *"your goal and your evidence
  point different ways; here is the comparison."* The tenant may change the goal
  or keep it. The system does not change it for them.

### 4e-5. The identity spine — the unglamorous thing all of it rests on

**This is not in any of the ideas above and it is load-bearing for all of them.**

A person arrives as a QR check-in with no email, a ticket order with a buyer
email, a Signal install with a device, a newsletter signup, and a bill-mate
crossbill click. Same human. Five records.

Today the only join is `normalized_email`. `audience_graph.rs` is a graph of
*places*, not people, so it does not help here. The consequences are concrete
and they break the headline metrics:

- *"Who came, who was new, who repeated"* is uncountable when the same person is
  three rows.
- Source ROI (4e-4) **double-counts** — the room scan and the later newsletter
  signup both claim the same fan.
- The contact governor's 7-day cooldown is per normalised contact, so a person
  known under two identities can be contacted twice in a week. That is the
  failure mode that actually loses people.

What it needs is deliberately small: a fan identity with **multiple verified
identifiers**, a merge that is explicit and reversible, and — the part that
matters — **an unmerged record stays unmerged rather than being guessed.** A
wrong merge joins two strangers' data, which is a privacy incident, not a bug.
Same discipline as the rest of this system: honest `null` over a confident wrong
answer.

Do the minimum version inside Phase 1G, because the first scan ritual creates
the first duplicate on day one.

### 4e-6. The honest arithmetic of the first 90 days

The single most likely way this fails is not technical. It is **quitting at week
six because the numbers look like nothing.** So write them down in advance.

Virya: 22 fans, 17 nearby-enabled, top cities Wrocław 11, Częstochowa 2,
Namysłów 2. A club show is 40–90 people.

- One show, 60 in the room, an 8% scan rate: **5 new fans.**
- Four shows in a quarter: roughly **20 new fans** — which is a doubling of the
  entire fanbase, and also twenty people.
- Crossbill on two of those bills, modest overlap: a handful more.

**Twenty to thirty real, reachable, consented people in a quarter.** That is the
honest projection. It is unimpressive on a chart and it is a doubling, and both
of those statements are true at once.

Two things follow. Judge the first quarter on **rate, not total** — scan rate per
room, recall response rate, repeat rate — because rates are measurable at n=20
and totals are not. And do not let anyone, including this document, sell the
total as the story.

---

### 4e-7. What is still missing after all of the above

Everything in §4e and §4f is now written down. These five holes are not, and each
one can quietly invalidate a section above. They are listed in the order they
would hurt.

**1. A scanned person may not be a reachable person.** The whole arithmetic in
§4e-6 assumes a scan produces a fan you can contact later. A scan gives consent
and a follow; it does not automatically give an address. If the scan lands
someone on a web follow with no email, no phone and no Signal install, the count
goes up and the reachable audience does not. **Decide what a scan must yield
before the first show runs one** — Signal install is the strong version, email is
the workable one, a follow alone is a vanity number and this document has already
corrected one of those.

**2. Per-gig crossbill needs the bill-mate to be a tenant.** §4e-2 computes
"30% audience overlap" between two acts. Our system holds one side of that
unless the other act is also a customer. At one tenant, the overlap is
uncomputable and the count of eligible bills is zero. So crossbill is real from
customer two onward, and until then the bill step is a manual ask between bands.
Say that plainly rather than shipping a step that silently never fires.

**3. The recall may be refused by the contact governor.** The governor enforces a
7-day cooldown per normalised contact, with the reservation taken before send. A
fan who scans on Friday and gets a welcome has been contacted; the T+1 recall on
Saturday is one day later. Either the scan's welcome *is* the recall, or the
recall waits, or the scan sends nothing at the time. Pick one — this is the same
class of collision as the monthly crossbill cap, and the cap wins again.

**4. Source ROI must be net of churn, or it rewards the wrong channel.** §4e-4
measures which channel produced fans. A channel with high acquisition and high
unsubscribe looks excellent on that measure. §6 already asks for the share still
engaged at 30 and 90 days; §4e-4 must **use** it, so the ranking is by fans who
stayed rather than fans who arrived.

**5. Nothing in this plan tries to raise the scan rate.** The 8% in §4e-6 is an
assumption, and it is the master variable of the entire aggregation argument —
3% versus 12% is the difference between a slow compound and a fast one. What
moves it is not code: whether it is announced from the stage, where the QR is
placed, whether it offers something, and whether the band remembers. That makes
it the first thing to measure per show and the first thing to iterate, and it
belongs in the capture plan rather than in a model.

---

## 4f. Value before adoption — artifacts, not accounts

The hardest problem in this plan is not the machine. It is that the promoter, the
venue and the festival are **counterparties, not customers**, and none of them
will log into a dashboard to find out whether they should care.

So never ask them to. **Send the value as a finished artifact.**

### 4f-1. The counterparty rule

- The promoter gets an email after the show: *"Your room: 31% repeat attendance.
  This act's announcement moved the most ticket clicks."* No account. No login.
- The festival gets its first discovery-rate report as a **deliverable**, free,
  before any conversation about tenancy.
- The venue gets its own numbers, which no venue currently has.

Every artifact is simultaneously the value and the onboarding. Pull, not push.
This is what compresses the dangerous middle where the product is a good
single-tenant tool waiting to become a network: **the network starts delivering
before the network exists.**

### 4f-2. Shared objects that do not require tenancy

`Festival` is the first shared object. Add **`Venue`**, **`Promoter`**, `Bill`.

Three bands each marking *"played Klub X"* aggregates room-level knowledge —
typical draw, repeat attendance, how that room treats this genre — **without the
venue ever signing up.** Density of reference precedes density of tenancy, and
the cross-side metrics become computable years earlier than waiting for
venues-as-customers.

One rule, from the same discipline as everywhere else: a shared object holds
**observations contributed by tenants**, not scraped facts, and a tenant sees
aggregates rather than another tenant's raw rows.

### 4f-3. Every measured number ships as something worth publishing

The T+7 summary, discovery rate, *"you gained 9 fans in Wrocław this month"* —
design them as cards the band and the promoter **want to post**.

The receipts become the distribution. Each one is proof-of-work in public,
carrying the product into rooms it has never touched, at zero acquisition cost.
The marketing is the measurement — which is only available to a product whose
measurements are real, and is therefore the one growth loop competitors making
claims cannot copy.

### 4f-4. The business is the evidence, not the tooling

This document already contains the business model in one line — *settles the fee
argument with evidence* — and files it as a side benefit. It is not.

- Bands pay tool money. $20–50/month, and they are poor. That is the **wedge**.
- The numbers that settle money arguments — which act moved tickets, discovery
  rate, repeat attendance per room, fans-in-city before booking — are what
  promoters, festivals and labels **negotiate with**. That is the **business**.

Tiering follows the evidence, not the feature list. This is the difference
between a monthly SaaS seat and a measurement layer an industry argues over.

---

## 4g. The uncomfortable advice

A dashboard informs. A manager tells you the thing you did not want to hear, and
turns out to have been right. The second one is the deeper product, and it is
the one nobody else can build, because nobody else holds evidence from three
sides at once.

The plan handles arc drift. It does not handle **honest decline**. The 9/10
version says the hard true thing, with the evidence attached:

- *"This format peaked. The last four performed at half the first four."*
- *"Wrocław has cooled. Three shows, falling each time."*
- *"That community gives you engagement and has produced zero fans in five
  months."* — the plan already asks whether a place produces fans; this is what
  to do when the answer is no.
- *"The premise of this arc expired. Stop it."*

Three rules so this stays trustworthy rather than discouraging:

1. **Evidence or silence.** No decline claim without the comparison that supports
   it, shown.
2. **Always paired with the alternative.** *"Stop this; here is what the same
   hours buy instead"* — never the diagnosis alone.
3. **The band can disagree, and that is recorded.** If they continue and it
   works, the system was wrong and must learn it. `tenant_preference` already
   exists for exactly this.

---

## 4h. Where the money is — roster and festival, by Pareto

A band is the best product in this plan and the worst business: poor customers,
a $20–50/month ceiling, and no amount of quality moves it. The roster and the
festival are where the money is. This section finds the 20% of work that buys
80% of both, and the answer for each is different from what it looks like.

### 4h-1. The roster optimizer is already built

`crowdrelay-brain/src/portfolio.rs` describes itself:

> *"The brain doesn't dispatch candidates context-by-context — it collects ALL
> candidates from ALL contexts into a global pool and selects the optimal
> portfolio. This is the 'GET FANS' optimizer: it maximizes expected incremental
> fans across the entire action space, subject to budget constraints, audience
> overlap, and fatigue."*

Submodular greedy selection, an audience-overlap penalty, a fatigue decay, a
cost budget, a minimum marginal value, and **DO NOTHING as a real candidate**.
It is Pareto, implemented, with the honesty note about approximate submodularity
attached.

Two facts make this the cheapest large win available:

- **It is workspace-agnostic.** The whole module contains no reference to a
  workspace or tenant. The signature is
  `select(&self, candidates: Vec<PortfolioCandidate>) -> PortfolioSelection`. It
  does not care whose candidates they are.
- **Its overlap key already anticipates this.** `audience_key`'s own example is
  `"venue:Warsaw_Palladium"` — a key that is shared between acts by nature.

Today it pools across *contexts* inside one act. Pool it across *acts* and a
manager gets the thing they actually need: **of everything my eight acts could do
this week, which five things are worth doing.** No new model. No new maths.

### 4h-2. The 20% for rosters

Four changes, in order of value:

1. **An act identifier on `PortfolioCandidate`**, and a roster-level
   `PortfolioConfig` with its own `max_dispatches` and `cost_budget`. This alone
   turns the existing optimizer into a roster optimizer.
2. **A fairness term — and this is a correctness fix, not a nicety.** The
   optimizer has no fairness or starvation handling: zero occurrences of
   fairness, starvation or equity in the module. It is a pure value maximiser.
   Pooled across eight acts it will spend every slot on the two acts with the
   best posteriors and give the other six nothing, permanently — which
   contradicts the roster's own stated north star in §4a, *"Every act grows,
   nobody is neglected."* The pattern to copy is already in this codebase:
   `select_team_assignee` picks **capability first, fairness second**, with a
   neutral score for a member with no history because *"a new member has not
   failed to do anything."* A newly signed act needs exactly that.
3. **Cross-act audience overlap, which is a harm and not only an inefficiency.**
   Two acts on one roster share fans. Unpooled, each act's loop contacts the
   same person independently and the contact governor's cooldown — which is per
   normalised contact — is the only thing standing between that person and being
   messaged twice about two different bands in the same week. Pooling candidates
   makes the overlap penalty do this work before the send, which is where it
   belongs.
4. **Roster-level source ROI.** §4e-4 measured per act is eight small samples.
   Measured across the roster it is one usable sample, and that is the n-problem
   dissolving — the single strongest argument for a roster being customer two.

That is the whole list. Everything else a roster needs — consent edges between
own acts, crossbill, corridor, shared learning — **already works inside one
roster account**, because a roster is a network of eight on the day it signs.

### 4h-3. The festival answer is not a festival product

The obvious move is to build the `Festival` object and the discovery-rate report
for organisers. That is the wrong 20%, for a reason no code fixes: discovery rate
needs density on three edges at once — several tenant acts on one bill, attendees
checking in, follows flowing through consent edges. A festival with two tenant
acts out of thirty and a 5% check-in rate produces an honest, thin number that
sells nothing.

**Serve festivals through the performer side first.** A festival slot is the
highest-yield single gig in a band's year: the biggest room, the most strangers,
the most bill-mates, and the band is already going. Running the Phase 1G gig
vertical on a festival slot needs **no festival machinery at all** — the slot is
a show with a bigger room and a longer bill.

Which means the festival product is not a separate build. It is the gig vertical,
pointed at the one date per year where every number is five times larger.

### 4h-4. Rosters create festival density — the link worth naming

The organiser product becomes possible the moment several tenant acts appear on
one bill. Nothing makes that happen faster than a roster: **one management
company with eight acts produces multi-act bills automatically**, at every
festival any of them plays.

So the two answers are one answer. Sign a roster, and festivals become
measurable as a side effect of the roster's own gigs. Chase festivals directly
and you are selling a thin number to a customer who buys once a year and goes
dormant for ten months.

### 4h-5. What this changes about who is customer two

§8's fourth open decision asks about second-customer *timing*. The Pareto above
says the sharper question is *which archetype*, and the answer is a **roster or
management company**:

- It is the cheapest large feature win — the optimizer exists and is already
  generic.
- It has no cold start. Crossbill, corridor and shared learning all work inside
  one account on day one.
- It fixes the n-problem for source ROI.
- It is the fastest route to festival density.
- The buyer sells their own time, so saved hours convert to money in a way a
  band's do not.

The band stays the first customer and the wedge. It should not be the second.

**One thing blocks this mechanically, and it is small.** Migration
`0025_tenant_lifecycle_capabilities.sql` already added the archetype column with
all four kinds — `band`, `roster`, `label`, `festival_org` — and its own note
that this is *"stored now so the second tenant's archetype is a column value, not
a code change."* But `CreateTenantRequest` has no `archetype` field and the
wizard has no step for it, so a roster created through the console arrives as a
`band` by column default and has to be corrected in SQL. Fix it before the second
customer rather than after. See §6b of `CONTROL_PLANE_PLAN.md`.

### 4h-6. The honest limits of this section

- **A roster inherits every act's ceiling.** Eight acts with no material produce
  eight quiet loops. Variance across eight helps; it does not replace output.
- **Fairness and value genuinely trade off.** Spreading effort evenly across
  eight acts produces less total growth than concentrating it on two. The
  fairness term is a product decision about what a manager is buying, not an
  optimisation — and it should be a visible setting, not a hidden constant.
- **A festival slot is one date.** Nailing it is worth a great deal to the band
  and does not make the organiser a customer.

---

## 4i. The cadence the system issues

### 4i-0. The system sets the rhythm; it does not wait to discover one

Two sections above treat the band's own output as the binding constraint, in the
form *"the machine cannot write the songs."* That is true and it is not the
useful framing, because it implies the machine waits for material and reacts to
whatever turns up. A band that already worked that way does not need this
product.

**The cadence is something the system issues.** It is the whole meaning of the
earlier requirement that this tool shape the roadmap rather than comment on it:

> **The system holds a rhythm the tenant agreed to, tells them what is due and
> when, and fills the space between. The band produces to a schedule instead of
> producing when someone remembers.**

That is the difference between a machine that amplifies whatever arrives and a
machine that keeps a band moving. The second one is worth paying for.

### 4i-0b. Cadence is per tenant, and it is a setting

An earlier draft of this section built the plan around one composer's output —
eight to ten releasable songs a year plus about ten demos. That is Virya's
rhythm, and writing it into a multi-tenant plan is the same mistake as the
hardcoded slug in Phase 0.5: a tenant-specific fact living where a general
mechanism belongs.

Every band has its own rhythm and frequency. A band recording an album disappears
for four months. A producer ships weekly. A heritage act releases nothing and
plays twenty shows. **Cadence is a per-tenant commitment**, held in
`tenant_preference` beside the other per-tenant settings, and everything in this
section reads it rather than assuming it.

**The default, and the planning number for Virya:**

```
one serious moment per month        release, video, or a show
fillers for the rest of the time    demos, harvest, catalogue, work in progress
```

Conservative by choice. A tenant who beats it moves their own setting up; a
tenant who misses it is in growth debt, which the system already knows how to
say.

### 4i-0c. Two classes: serious moments, and fillers

The split matters more than the numbers, because it decides what gets spend and
what gets scheduled.

**Serious moments** — twelve a year at the default. Each gets a vertical: the
release timeline in §4i-1, or the gig timeline in Phase 1G. Assets are gated,
the tier is decided, campaign budget is available.

**Fillers** — everything between, and there is more of it than of the moments.
No campaign spend, no assets gate, no vertical. A filler is posted or it is not.
Four sources, all of which already exist:

- **Demos and work in progress.** A riff costs the band nothing beyond what
  writing already produced, and work in progress is what an audience wants from
  a band between records.
- **Harvest output.** §4b-3 already turns one day of work into three weeks of
  posts.
- **Catalogue rotation.** §4i-4 — free, and it grows every month.
- **Show material.** Everything the capture plan produced.

**The filler calendar is the system's job, not the band's.** If the band has to
remember to post between releases, the quiet weeks stay quiet — which is the
failure this whole section exists to prevent. The machine schedules from what it
already holds, and asks the band only when the shelf is empty.

### 4i-0d. When the cadence slips, the system says so

A rhythm nobody is held to is a wish. The enforcement already exists in
`growth_debt.rs`: `ReleaseMilestonesMissed` fires on *"an active release plan
whose milestones stopped being recorded while the release date kept
approaching."* Point the same mechanism at the cadence commitment.

Three rules so this stays useful rather than nagging:

1. **It reports, it does not scold.** The debt surfaces in Attention as a fact
   with a date.
2. **Missing once is information, not failure.** Bands tour, get ill, and have
   jobs. Repeated slippage against a rhythm the band chose is the signal —
   either the work is not happening, or the rhythm was set too fast and should
   be lowered.
3. **Lowering the cadence is a legitimate outcome**, offered explicitly. A
   commitment that is quietly missed every month teaches the band to ignore the
   product.

### 4i-1. The release, end to end — the second vertical

Phase 1G makes one gig load-bearing because it is where three sides meet. The
**release is the other serious moment**, and at the default cadence it is the one
that recurs most. It deserves the same treatment and has the same advantage: most
of it is already built.

`growth_debt.rs` already models a **release plan** with milestones and asset
state — `ReleaseMilestonesMissed` for *"an active release plan whose milestones
stopped being recorded while the release date kept approaching"*, and
`ReleaseAssetsMissing` for one whose *"own declaration says its assets are not
there: no listen URL, or its `assets_ready` flag still false"*. Both are built on
the operator's own declarations, so nothing guesses. `content_supply.rs` carries
`Release` as a source kind with its own artifact fan-out.

What is missing is the same thing the gig was missing: **a timeline you can
open**, and a page that shows it.

```
R-28  the song exists; decide its tier (§4i-3)
R-21  assets: art, listen URL, one line that is true
R-14  the making-of, from material that already exists
R-7   pre-save and the fans most likely to listen on day one
R-0   release; Signal first, platforms second
R+3   who listened, who did not, which city moved
R+14  the second wave — the fans who missed it
R+30  into the catalogue rotation (§4i-4)
```

Every one of those is either built or a small connection, exactly as with the
gig. Build it as the second vertical, after Phase 1G and before the capability
phases resume.

### 4i-2. Attention is spent in collisions, not in floods

At one bigger moment a month the caps are **near the right level, not constantly
refusing.** An earlier draft of this section assumed a fortnightly release
cadence and claimed the caps would bind constantly; at twelve a year they do not,
and planning around a flood that is not coming would be planning for the wrong
system.

Where they bind is **collisions**. A release week that lands on a gig week is one
month's attention spent twice in seven days, and those weeks are predictable
because both dates are known in advance. So the rule is narrower and more useful:

> **When two moments collide, the system drops sends rather than raising caps,
> and it says which moment it protected.**

The mechanism exists: `PortfolioConfig` carries `fatigue_decay` — *"audience
burnout (seeing too many posts from the same artist)"* — beside the overlap
penalty and the cost budget. The parameters matter most in collision weeks and
should be visible then.

The console still has to show what was held and why. A held post with no visible
reason produces exactly one response, which is to raise the cap.

### 4i-3. Not every serious moment is a campaign

Twelve serious moments a year is a workable number of campaigns and not twelve
campaigns, because a campaign behind everything is a campaign behind nothing. A
tier decision at R-28:

- **Single.** Full release vertical, pre-save, the month's crossbill allowance,
  the push. A few a year, whatever the cadence.
- **Track.** Announced, catalogued, one wave. No campaign spend.
- **Filler.** Posted into a quiet week. No vertical, no assets gate, no spend.

A small number of real campaigns a year means each one carries weight, and it
also means **the evidence base for "what makes a single work" grows slowly.** See
§4i-5 — a reason to record every one from the first, not a reason to run more of
them.

The tier is the band's call, informed by evidence rather than replaced by it.
What the system contributes is the honest comparison: how the last three singles
performed, and whether the tier chosen last time turned out right.

### 4i-4. The catalogue is an asset nobody is using

Search the codebase for a back catalogue and it appears once, in a warning
comment. Nothing re-surfaces old material.

At one serious moment a month, **the quiet weeks between moments are the real
problem this solves**, and it solves them with material that already exists. The
steadier the cadence, the more valuable rotation becomes: a flood fills its own
gaps and a rhythm does not.

After two years at the default cadence there are roughly two dozen serious
moments behind the band plus every filler, and **a fan who joined in month twenty
has never heard month three.** To them a two-year-old song is new. Rotation costs
nothing, needs no new material, and grows in value every month the band keeps
working.

Rules so it does not become a spam engine: rotate by what a specific fan has not
seen, never by what is oldest; a rotated post is labelled as catalogue, never
dressed as new; and rotation spends from the same attention budget as everything
else, so it competes rather than adds.

### 4i-5. What the brain can and cannot learn at this cadence

An earlier draft of this section claimed a fortnightly cadence would give the
brain usable n within months. At the real numbers that is wrong, and the
correction matters because it decides what the machinery may claim.

**Split the question by what is being counted:**

- **Release-level learning is slow.** A few singles a year is n=3 or 4. No amount
  of Bayesian machinery makes that a conclusion, and the empty-denominator
  invariants should keep saying *"insufficient evidence"* for a long time. Two
  years in it is still single digits, for any cadence a real band can hold.
- **Post-level learning is fast.** Demos, harvest output, gig posts, catalogue
  rotation and crossbill run weekly. Content **format** — which kind of post
  travels for this band — reaches usable n inside a year comfortably.

So the brain learns *what to post* long before it learns *what makes a single
work*. Point it at the first question and let it stay honestly silent on the
second. Claiming otherwise at n=4 is exactly the failure `creative.rs` warns
about: *"building the estimator before the data exists is how you end up with
machinery that has never been evaluated."*

Record tier, timing and outcome on every release from the first one anyway. The
sample only exists if it was being collected before it was useful — but do not
draw a line through four points.

### 4i-6. Protect the maker's hours — the machinery must not eat what feeds it

The system's whole value depends on material arriving. Every tenant has one or
two people the material comes from, and in a small band that person is usually
also the one answering the console. The failure mode is quiet and fatal: **a
machine that needs five hours a week from the one person who should be making
the thing it runs on.**

`select_team_assignee` already tracks capacity, open assignments and
follow-through per skill. What it does not have is a notion that one person's
hours are worth more than another's because they are upstream of everything.

Make it explicit:

- **A weekly ceiling on what each upstream person is asked for**, set by them,
  enforced by the router rather than by willpower.
- **Over that ceiling, work routes elsewhere or waits.** A task nobody else can
  do and that person has no hours for is not reassigned — it is dropped, and the
  system says so.
- **Measure it.** Hours asked of each member per week, beside the follow-through
  record that already exists. If the number climbs while output falls, the
  machinery is eating its own supply and nothing else in this document matters.

A system that produces ten more fans a month and costs four hours of composing
is a bad trade at this cadence. The machinery exists so the songs keep coming.

---

## 5. Phases

### Phase 0 — Make the loop able to act

Not a purchase. A diagnosis and three repairs.

1. Fix the approval-notification node. Minutes of work, unblocks everything.
2. Fix the n8n credential; confirm claims stop failing authorization.
3. Re-read the emitted/confirmed table. If `community.engage.request` and
   `content.artifact.request` begin confirming, the loop is alive.
4. Trace why emission stopped on 13 September.
5. **Capture the baseline by hand, for one week**: how many things the band did,
   how many got shared, how long it took, how many hours the operator spent.
   Without a before, nothing below can be proven. Cheapest item here and the
   one most likely to be skipped.

**Done when:** a dispatched action reaches a worker and reports back, and the
operator is notified of something waiting.

### Phase 0.5 — Detach Virya into a customer

Virya is CrowdRelay's first customer, not a testbed. Its lifecycle is internally
owned, so it can be an ordinary tenant.

The coupling is three things:

- `tenant_lifecycle_is_externally_owned(slug) { slug == "virya" }` — a hardcoded
  slug behind eight guards.
- Four config fields (`virya_workspace_id`, `virya_crowdrelay_url`,
  `virya_signal_url`, `virya_management_url`) and an `if slug == "virya"` branch
  in `area_routes::target()`. The general path — `latest_management_url` — already
  exists.
- Shared infrastructure. Fine at one customer; a boundary problem at two.

**Split the predicate into three columns, not one boolean.** The read model
already publishes `canSuspend`, `canProvision`, `canRemove` as one value three
times. Back them with three facts:

- `can_suspend = true` — a customer can be paused.
- `can_provision = false` for Virya until the agent genuinely owns its
  deployment; an accidental provision would stand up a competing instance.
- `can_remove = false`, permanently. Deleting the only customer must get
  *harder*, not easier.

Do this **after** Phase 0. The env-var shortcut may be why dispatch works at
all.

**Consequences for how we work:** production data stops being a sandbox;
configuration changes are made by the customer in the console, not by us
through the admin API; the spend ceiling becomes a plan limit the customer
agreed to; a bad send is a breach of what was sold, not an embarrassment.

### Phase 1G — The gig, end to end (the first vertical slice)

Section 4a-2c argues that per-side features are the wrong unit and that one
interaction point served end to end is the right one. Everything from Phase 1
onward is organised by capability — watch, amplify, opportunities, place. That
is a correct description of the machine and a poor description of the order to
build it in, because no single capability produces a result anyone can feel.

This phase reconciles the two. **The capability phases stay exactly as written;
Phase 1G decides how far each one gets built first.** Each capability is taken
only as far as one real Virya show needs it, then the next step of the timeline
is joined to it. A vertical slice, not a layer.

#### The nine steps, against what actually exists

| Step | What it needs | Where it already lives |
|---|---|---|
| T-21 announce, assets pulled not chased | event → artifacts, assets from the profile | `content_supply.rs` (`Event` source), `event_sync/announcements.rs` |
| T-14 sales trajectory, relay if behind | pace vs own history, city-targeted send | `growth_debt.rs::TicketSalesBehindPace`, Signal `top_cities` |
| T-7 each act prompted, promoter sees who did | task to a named person, follow-through record | `autopilot/team.rs::select_team_assignee` |
| T-2 nearby fans of any act on the bill told | nearby alerts, consent, cooldown | built; 17 of Virya's 22 fans enabled; `viryaos_contact_governor` |
| T-0 capture plan to whoever is filming | a task with named shots | **nothing** — see gap 1 |
| T-0 **the scan** — QR at set end and merch table | campaign, signed token, check-in | `concert_qr.rs`, built and never used — gap 3 |
| T+1 post-show recall to the room | recap artifact, a reachable list | `PostShowRecap` artifact; the scan is what makes the list real |
| T+3 harvest becomes three weeks of posts | ingest → many artifacts | the harvest rule, §4b-3 |
| T+7 who came, who was new, who repeated | attendance | partial — gap 3 |

Six of eight are wiring between things that exist. The value of writing the
table is the other two.

#### Gap 1 — The capture plan does not exist

`capture_plan` matches nothing in `crates/`. It is referenced three times in
this document as the answer to *"someone should film this"*, and it is the one
piece with no code behind it. It is also the piece everything downstream needs:
T+3's harvest, the content catalogue, and most of §4b-3 all assume material
exists. No footage, no harvest, and the rest of the chain runs on nothing.

The smallest honest version needs no new model and no LLM: on a confirmed show,
at T-1, `select_team_assignee` issues one task to whoever holds `TeamSkill::Video`
or `Photography`, carrying three named shots. Deterministic, routed by the most
complete subsystem in the codebase, and the highest leverage per hour anywhere
in this plan.

#### Gap 2 — The pace detector is correct and currently inert

`TicketSalesBehindPace` compares a show against *"the workspace's own historical
pace at the same lead time"*, and its empty-denominator invariant keeps it silent
until enough past shows exist — it says *"insufficient evidence"* rather than
inventing a baseline. That rule is right and must not be weakened.

The consequence is concrete: Virya has one ticket buyer and zero attendees, so
T-14 will correctly refuse to answer for the first several shows. Do not fake a
baseline to make the demo work. Two things follow instead:

- For the first shows, T-14 is a **human call** — the operator sees the number
  and decides whether to relay. The relay itself is already free and owned.
- **Log every show from now on, including ones already played.** The detector
  becomes useful exactly when the history exists, and nothing else creates that
  history. This is the cheapest item in the phase and the easiest to skip.

#### Gap 3 — Attendance is observable and has never once been observed

An earlier draft of this phase said attendance does not exist. That was wrong,
and the correction changes what this phase should build.
`crowdrelay-infra/src/concert_qr.rs` holds concert QR campaigns with signed
tokens, revocation and **idempotent fan check-in**; `beacon_signal` sits beside
it. The capability is built and complete.

It has never been used. Virya has zero attendees on record, because no show has
ever run a scan. **The missing piece is a ritual, not a table** — which makes
this the same item as §4e-1, and moves it from "measurement gap" to "the largest
growth channel in the plan, currently switched off."

So Phase 1G gains a step. T-0's capture plan ends with **the scan**: a QR at set
end and at the merch table, one tap, follow plus consent, no account. It turns
every gig from a conversion event into an **aggregation** event, and it is what
makes T+1's recall able to reach the room rather than only the people already
known.

Until a scan has actually run, T+7's *"who came, who was new, who repeated"* can
only be assembled from three proxies — buyers, recall responders, and reachable
fans in that city — and each must be **labelled as the proxy it is**. A single
number called "attendance" would be the same failure as the `total_audience`
label this project already corrected once. After the first scan, attendance is a
real observation for the people who scanned, and still a proxy for everyone else.
Say which is which.

One dependency, from §4e-5: the first scan creates the first duplicate identity
on day one — a check-in with no email beside a ticket order with one. Do the
minimum identity spine in this phase, or the T+7 count is wrong the first time it
is produced.

One related limit, worth knowing before promising it: §4a-3 wants *"which act's
announcement drove ticket clicks"*, but `ticket_url` is a single field on the
event, shared by every act on the bill. Per-act attribution needs a per-act
tagged link before that question is answerable at all.

#### Done when

One real Virya show has run all nine steps with nothing chased by hand, **at
least one stranger has scanned and become a reachable fan**, and the T+7 summary
exists with observations and proxies labelled separately. One show. Not a
framework for shows.

That scan condition is the real bar. Nine steps running perfectly with an empty
check-in table means the gig was serviced and the room still evaporated.

---

### Phase 1R — One real release, end to end (the second vertical)

§4i makes cadence something the system issues: one serious moment a month, with
fillers between. The gig is one kind of serious moment. The **release** is the
other, and at the default cadence it recurs more often, so it needs its own
vertical rather than being a capability spread across Phase 2.

Same method as Phase 1G. One real release, every step, nothing chased by hand.

#### The steps, against what exists

| Step | What it needs | Where it already lives |
|---|---|---|
| R-28 tier decided — single, track, filler | a field and a record of the choice | built + deployed — `tier` on `viryaos_release_plans`, staff panel |
| R-21 assets gate: art, listen URL, one true line | asset state on the release plan | `growth_debt.rs::ReleaseAssetsMissing`, built |
| R-14 the making-of, from material already held | source to artifacts | `content_supply.rs`, `Release` source kind |
| R-7 pre-save, and the fans most likely to hear it | owned audience, city and platform | Signal, `top_cities` |
| R-0 release — Signal first, platforms second | delivery, ordered | built |
| R+3 who listened, who did not, which city moved | per-release outcome | built + deployed — `release_r3_report.rs` rides Sustain; `campaigns.release_plan_id` binds attribution (a87531b) |
| R+14 the second wave, to the fans who missed it | reach the non-openers | contact governor bounds it |
| R+30 into catalogue rotation | rotation by what a fan has not seen | **nothing** — §4i-4 |

Seven of eight exist. The release plan with milestones and an `assets_ready` flag
is already modelled, and `ReleaseMilestonesMissed` already fires when *"an active
release plan whose milestones stopped being recorded while the release date kept
approaching."* The timeline is mostly wiring that machinery to a page.

#### Gap 1 — the tier has nowhere to live

§4i-3 makes the tier the decision that keeps campaigns from being spread across
everything. It is a field on the release, chosen by the band at R-28, recorded
with its outcome so §4i-5's slow release-level learning can accumulate from the
first one. Without it, every release is implicitly a single and the month's
campaign budget goes to whatever happens to be next.

#### Gap 2 — per-release outcome is not separated from ambient growth

**Built and deployed (a87531b).** R+3 asks who listened because of this release.
Fans arrive continuously; a release week's growth includes people who would have
arrived anyway. The report compares against the tenant's own trailing 28-day
baseline and says *"above_trend"* / *"within_noise"* / *"insufficient_evidence"*
rather than attributing every new fan to the release — and names
`streams_not_measured` every time, since no listen count reaches this system.
The empty-denominator discipline in `growth_debt.rs` was the pattern; what it
still cannot see is a listen, because nothing measures one.

#### Done when

One real release has run all eight steps with a tier recorded at R-28, the assets
gate enforced rather than advisory, and an R+3 answer that distinguishes what the
release moved from what was going to happen anyway. One release. Then the cadence
carries the next one.

---

### Phase 1 — Watch the band

Every band action becomes a `ContentSource` automatically.

- **Release sync** — Bandcamp, Spotify, SoundCloud: new release, new track,
  new merch item.
- **Social sync** — a post on Instagram, Facebook or X becomes a source fact.
- **Story** — one field in the console ("what happened?"), the only first-person
  material an agent may narrate.
- **Show completed** — already modelled; wire the trigger from the calendar.
- **Video** — done (`video_source_sync`).

**Honesty rules:** a `ContentSource` may only come from an account the tenant has
authenticated as owner, or from operator input — never from search. Every source
carries provenance and a link, both shown in the console. A disowned source is
tombstoned, not deleted, and anything already sent from it is listed.

**Done when:** for one week, every band action appears as a source within an
hour, with zero sources the operator disowns.

### Phase 2 — Amplify, for real

The existing artifact chain fires, with two changes.

**Delivery exists.** Press pitch gets a real sender — one recipient at a time,
reply-to the band. Social posting turns on per platform behind the publish
guard. Community posts go only where the band is already admitted.

**Email is a legal surface, not a channel.** Decide before writing the sender:
sender identity on the band's domain with SPF/DKIM/DMARC aligned; a working
unsubscribe on cold outreach that writes `do_not_contact`; a lawful basis
recorded per address, refusing any with no provenance; a per-day workspace
ceiling on top of the 7-day per-contact cooldown; and a monitored reply-to,
because a pitch nobody can answer is worse than no pitch.

**Done when:** ten consecutive outward artifacts pass the evidence rule and are
approved without editing the substance. If the operator rewrites every draft,
the phase failed and the drafting is what gets fixed.

### Phase 3 — Opportunities, timed to the moment

A scheduled task whose input is *where the band is right now* — release week,
tour gap, a video gaining traction — and whose output is a shortlist with
evidence and a link:

- **Bookings** — venues and promoters routing this genre and size, in the
  corridor between confirmed dates. Costed through `tour_economics` before it is
  shown; an uncosted show is prepared, never submitted.
- **Press** — writers and outlets who covered comparable records in the last 90
  days.
- **Interviews and podcasts** — shows that book acts at this level.
- **Festival calls, compilation deadlines, sync briefs.**

**Recency and truth.** Every opportunity carries a dated source link and a
staleness horizon after which it drops off. A venue that closed in 2024 on a
shortlist destroys trust in the whole list.

**A refusal set**, same shape as the community screen: reasons a candidate is
rejected on write, so the list stays short. Five checked beats fifty maybes.

**Done when:** of ten shortlisted opportunities the operator accepts at least
four and rejects none as obviously wrong.

### Phase 3.5 — Peer observation, trends, and the plan

The layer that turns the tool from a distributor into a career instrument. It
produces the **arcs** of section 4b, not a feed of loose ideas.

**Five new units:**

1. **Peer** — a named artist the band watches, with a tier. Aspirational at the
   top, near-peers at the bottom. **Operator-curated in the control plane, never
   guessed by a model.**

   This is a settings surface, not a constant. A hardcoded list of "current
   trendsetters" is stale the month it ships, and no model's training data is a
   reliable source for who is setting the pace in a genre right now. The band
   and the label know. They type it in.

   **Per peer:** name, platform handles (Spotify, YouTube, Bandcamp, socials),
   tier, and why they are on the list. A `watch_for` field decides what is worth
   observing — some peers are worth watching for format, some for styling, some
   only for how they route a tour.

   **Tiers matter because they mean different things:**
   - **Aspirational** — where the band wants to be in three years. Watch for
     direction and styling; do not copy their scale-dependent moves, since what
     works for an act with a crew does not work for four people and a van.
   - **Near-peer** — one or two rungs up, same circuit. The most actionable
     tier: what they do is reproducible with the band's actual resources.
   - **Lateral** — same size, different scene. The source of moves nobody in
     this genre has tried yet.

   **The system may propose candidates; the operator confirms.** The same rule
   as everywhere else — *a candidate is not a target*. `metal-archives-scanner`
   already finds bands in the tenant's genre and region, `bandcamp-scanner`
   already finds artists whose collectors overlap with the tenant's. Those are
   exactly the inputs for a suggested peer list. The operator accepts, rejects
   or re-tiers, and the rejection is recorded so the same wrong name is not
   proposed twice.

   **Genre-neutral by construction.** Metal, DJ and pop set trends through
   different surfaces — a metal act through videos and festival bills, a DJ
   through sets, edits and B2Bs, a pop act through short-form and visual eras.
   The peer list holds handles and a `watch_for`; the observation sweep adapts
   to whichever platforms that peer actually uses. Nothing in the model is
   metal-specific, which is what lets one roster hold three genres.
2. **PeerObservation** — one dated fact with a link. *"Spiritbox posted a
   playthrough on 4 Sep, 1.2M views in 9 days."* Never a summary, never a vibe.
3. **Trend** — a pattern over observations with its evidence attached. *"6 of 9
   tracked peers released a playthrough within 3 weeks of a single, last 90
   days."*

   **Three sources, not one.** Peers are only the first:
   - **Peer behaviour** — what comparable bands are making right now.
   - **Fan-side signal** — what the band's own people and people like them are
     actually engaging with. The scanners already crawl Reddit communities and
     Bandcamp collectors for *who* to reach; the same crawl shows *what those
     people are into this month*. Genre waves, formats, running jokes, the video
     everybody is reacting to.
   - **Season and calendar** — Halloween, festival announcement season, advent,
     anniversary dates, tour-routing windows. Dull, reliable, and real evidence:
     the date is a fact.

   A trend is strongest when two sources agree — peers are doing it *and* the
   fans are engaging with it.

   **Five dimensions, because "a trend" is not one kind of thing:**
   - **Format** — playthrough, lyric video, live session, studio diary, split.
   - **Theme** — what subjects are landing right now in this corner of the genre.
   - **Styling** — the visual wave. Artwork direction, typography, colour,
     grain, video look, merch design. Metal moves in aesthetic cycles as hard as
     it moves in format ones, and a band that reads the wave early looks current
     for a year. A band that reads it late looks like last year for two.
   - **Timing** — season, calendar, release and announcement windows, the
     festival cycle.
   - **Platform** — where the attention actually is this month. A format hot on
     one platform can be dead on another, and suggesting the format without the
     platform is half an answer.

   Styling suggestions carry an extra duty: **show, do not describe.** "Grainy
   VHS with high-contrast red" means nothing without three linked examples of
   peers doing it. The links are the suggestion.
4. **Arc** — a campaign with a horizon, a spine of planned beats, and the
   evidence behind the shape. The unit the band approves.
5. **ContentSuggestion** — concept, reason, window, effort estimate, the
   observations it rests on, **the arc it serves**, **who in the band would do
   it**, and — the part that makes it worth reading — **the distribution promise**.

   ### The distribution promise

   A suggestion must not say "you should make a playthrough". It says:

   > *"Make a playthrough this fortnight. Six of nine peers did one within three
   > weeks of a single and your fans in r/X are reacting to two of them. Tomek
   > films — he has the Video skill and capacity. When it is up I will post it to
   > these four communities where you are already admitted, draft the press hook
   > for the eleven writers who covered comparable records this quarter, push it
   > to your eighteen consented fans, and add it to the November arc."*

   Every clause above is already computable from data the system holds:
   admitted communities, press contacts with recency, consented fan count, team
   skills and capacity, the arc. **The promise is the product.** It is what turns
   "here is an idea" into "here is an idea and the work after it is handled",
   which is the entire pitch.

   It is also self-enforcing: a suggestion whose distribution plan is empty —
   nowhere to post it, nobody to send it to — is a suggestion not worth making,
   and the system should decline to raise it.
6. **SuggestionOutcome** — done / declined / done-differently, and what happened
   after.

**The scanners already look at similar bands.** `MetalArchivesScanner` and
`BandcampScanner` crawl comparable artists to find fans to poach. Asking "what
did these bands release this month" is the same crawl with a different question.

**Cadence: daily thinking, not daily asking.** The brain runs every day. It
*speaks* when it has something that serves the current arc, or when the arc has
gone off track. A day with nothing to add produces nothing — principle 1 applies
here hardest, because a daily feed of mediocre ideas is a new chore, not removed
work.

**On sample size.** At one suggestion a month this would be twelve data points a
year and no estimator could be honest about them. Daily cadence changes that: a
few hundred labelled outcomes a year for a single band is enough to learn which
concepts work *for this band*, and the roster multiplies it rather than
rescuing it. Build the attribution now either way — `creative.rs`'s rule stands,
because a label still cannot be added after the fact — but the estimator becomes
reachable inside the first year rather than only at roster scale.

**Guardrails specific to this layer:**

- **Seasonal and trend hooks are welcome; invented premises are not.** Halloween,
  a festival announcement, an anniversary, a peer moment worth riding — all are
  legitimate reasons to suggest something, and the calendar is real evidence. The
  line is the r/metalgearsolid line: the *premise* must be true. Suggest the
  concept freely; never state as fact something the band did not do.
- **Taste is a first-class signal.** "Not for us" is one click, recorded against
  the concept, and suppresses it for that tenant. A band that declines every
  meme suggestion has taught the system something real.
- **Capability, not just idea.** Suggesting a playthrough to a band with nobody
  who films is noise. A cheap capability profile — what can this band actually
  make — or half the output is unusable.
- **Peer scraping carries the same exposure** as the existing scanners. Prefer
  official APIs; record where every observation came from.

**Where it plugs in:** a new decision context `content_strategy`, emitting
`content.suggestion` into the same approval queue, with the same evidence panel,
policy, floor and cap. When a suggestion is accepted and the band makes the
thing, it lands as a `ContentSource` and Phase 2 takes over unchanged. Strategy
proposes; supply distributes.

**Done when:** the band approves an arc, the system runs three consecutive
weeks against it without the operator having to think about what comes next, and
it flags one drift the operator had not noticed.

### Phase 4 — Place: what and where to organise

The second intelligence layer, and the one a label will pay for.

The substrate exists: `top_cities` with active fans per city, AREA's geography,
`live_opportunities` with travel bands and costing, `booking_discovery` with
published routes.

**What it must answer:**

- **Where are our people?** Fans per city, per region, trend over time, and
  which of them are reachable (consented, nearby-enabled).
- **What is there?** Venues at our size, promoters, radio, fanzines,
  communities, record shops, festivals in range — with routes and dates.
- **Where is the gap?** Cities with fans and no show in 18 months. Cities with a
  festival call open and a fan cluster. Corridors between two confirmed dates
  with a bookable room in the middle.
- **What should we organise now?** A ranked answer with the arithmetic:
  *"Wrocław has 11 active fans and no show since March; three venues at your
  size; the drive is costed at X; your annual target says you are N shows
  behind."*

This is where the product stops being a marketing tool and becomes an operations
tool. It is also the thing a roster manager needs most, because routing across
several bands is genuinely hard by hand.

**Done when:** the system proposes a run of dates the operator would have had to
spend a weekend assembling, and the arithmetic holds up.

### Phase 5 — Roster, label, organisation

Only after one band runs a month unattended.

- **Roster view** — every act's attention, pipeline and gaps on one screen.
- **Shared learning** — the n problem solved; suggestions learned across the
  roster, respecting each band's taste signal.
- **Cross-artist consent edges** — already built: capped, revocable, audited.
  One artist's audience can find another's through an explicit permission with
  a limit and a record of every use. **No collection of single-artist tools can
  do this**, because none of them can see across the roster. This is the
  defensible product.
- **Routing across acts** — the label question: which of our bands should play
  this corridor, this festival, this support slot.

---

## 6. How value is proven

Unprovable claims are unsellable. Capture the baseline in Phase 0, then measure:

| Claim | Measured as |
|---|---|
| Nothing the band does goes unshared | actions ingested ÷ actions that happened |
| Amplification is fast | median minutes from band action to first artifact |
| Suggestions are worth reading | suggestions acted on ÷ suggestions shown |
| Opportunities are real | opportunities accepted ÷ shortlisted |
| Outreach converts | replies ÷ sent, per channel |
| Time saved | approvals per week × minutes the same work takes by hand |
| The plan is followed | arc beats delivered ÷ arc beats planned |
| Drift is caught early | days between a beat slipping and the operator being told |

Every row above measures **amplification or process**, which is the same
asymmetry §4e opens with. The claim the customer cares about most is not here.
Add it:

| Claim | Measured as |
|---|---|
| **The room stops leaking** | check-ins ÷ estimated people present, per show |
| **New fans are actually arriving** | new consented, reachable fans per month, by source |
| **They stay** | share still engaged at 30 and 90 days, by source |
| **They come back** | repeat attendance per city and per room |
| **The bill pays off** | fans gained from crossbill ÷ crossbill campaigns spent |
| **Hours go where they work** | share of effort in the top channel by measured conversion |
| **Nobody is double-counted** | duplicate identities merged ÷ duplicates detected |

**Judge the first quarter on rates, not totals.** §4e-6 does the arithmetic: a
good first quarter is twenty to thirty real people. Rates are measurable at that
size and totals are not, and a rate that holds is what a total is made of later.

The customer promise, in one sentence a band can evaluate in a fortnight:

> **You agree a plan for the next two months. After that the work happens. When
> something is worth making, you are told what, why, who in the band should do
> it, and exactly where it will go once it exists — and then it goes there,
> within the hour, without you chasing it. When the plan slips you hear about it
> before it costs you anything.**

---

## 7. What we will not promise

- **That it knows why something worked, in the first months.** Daily cadence
  makes a real dataset reachable inside a year, but early on it knows what it
  suggested, on what evidence, and what happened next — not causation. That is
  already more than most bands track about themselves, and it is honest. Claim
  the estimator when the labels support it, not before.
- **Autonomy on day one.** It starts in observe mode. Teams that skip that step
  do not trust it later.
- **Follower growth.** It finds people who already care and gives them a reason
  to stay.

---

## 8. Open decisions

1. **LLM spend.** Approve `AGENT_VERIFIER_PAID_FALLBACK` at the existing $5/month
   ceiling — but only after breaks 1 and 2 are fixed and the path carries
   traffic.
2. **Email identity.** Which domain sends, and who monitors the reply-to.
3. **Peer list.** Which bands are the archetypes, and which are near-peers.
   Operator-curated by design.
4. **Second customer: which archetype, not only when.** §4h-5 argues for a roster
   or management company over a second band — the portfolio optimizer is already
   generic, a roster has no cold start, it fixes the n-problem for source ROI,
   and it is the fastest route to festival density. It also gates §4e-3: the
   corridor needs two acts, which a roster supplies on day one.
5. **Whether the wizard asks for the archetype.** The column exists and nothing
   sets it, so every tenant created through the console is a `band` by default.
   One field on `CreateTenantRequest` plus one wizard step, landed together
   because `deny_unknown_fields` and the wizard payload gate will not accept one
   without the other. Decide before customer two, not after.
6. **What the scan offers in exchange.** A QR that says "follow us" converts
   worse than one that gives something — the setlist, the photos from tonight,
   early access to the next local date. Cheap to decide, and it sets the scan
   rate that §4e-6's whole arithmetic rests on.
7. **Merge policy.** How much evidence justifies joining two identities
   automatically, and what stays for a human. A wrong merge is a privacy
   incident, so the default is: fewer merges, honestly unmerged.
8. **Crossbill reciprocity ledger.** Whether give-before-take is enforced by the
   system or left to operators. Enforced is safer and slower; unenforced becomes
   extraction within a year.
9. **§4e-4 source ROI: who builds it.** `platform_yield.rs` was the candidate,
   but it is already used — reranking template priority by platform audience —
   and answers a different question than channel-to-retained-fan provenance.
   The open decision: whether source ROI lands as a new consumer of
   `fan_acquisition_events` joined to retention, or as an added second question
   inside `platform_yield`.
10. **How much fairness a roster buys.** §4h-2 makes this a visible setting rather
   than a constant, because spreading effort across eight acts produces less
   total growth than concentrating it on two. What a manager is buying is their
   call, not the optimizer's.

---

## 9. Order of work

There are two axes here, and confusing them is the main way this plan could be
built in the wrong order.

**The order of work is vertical:**

```
Phase 0    approval node, n8n credential, emission trace, baseline week
Phase 0.5  detach Virya into an ordinary tenant (three columns, not one flag)
Phase 1G   one real gig, all nine steps, nothing chased by hand,
           and at least one stranger scanned into a reachable fan
Phase 1R   one real release, R-28 to R+30, tiered, nothing chased by hand
           then the next interaction point, the same way
```

Two verticals, not one. The gig is where three sides meet; the release is what
recurs monthly for this tenant (§4i) — twelve bigger moments a year, planned
conservatively, against a much smaller number of shows. Both are needed, and the
release is the one that runs more often.

**The capability phases are the depth axis** — what Phase 1G draws on, each
built only as far as the show in front of it requires:

```
Phase 1    watch the band — every action becomes a source
Phase 2    amplify — real delivery, evidence rule, email done lawfully
           + source ROI (§4e-4): provenance starts deciding things
           + surface calibration (§4c): the recording exists; build the read
             path so the system reports its own miscalibration
Phase 3    opportunities — bookings, press, interviews, costed and dated
Phase 3.5  peers, trends, content suggestions — labelled now, learned later
           + the uncomfortable advice (§4g): decline, with evidence
           + give change_point (§4c) a consumer: it already detects North Star
             shifts; Phase 3.5 adds peer streams and a decision that reads them
Phase 4    place — where our fans are and what to organise there
           + the corridor (§4e-3): form bills, needs only two tenants
Phase 5    roster and label — shared learning, cross-artist consent, routing
           + shared objects and counterparty artifacts (§4f-1, §4f-2)
```

**Aggregation is not a phase.** §4e-1 (the scan) and §4e-5 (identity) land inside
Phase 1G because the first show needs them. §4e-2 (crossbill, with reciprocity)
starts at the second bill. If aggregation is scheduled as a later phase, the
whole programme spends a year amplifying 22 people.

Phase 0 is not optional and not parallel. Phase 1G is the first thing anyone can
feel, and it is what proves the machine to the first customer. Phase 1 is the
highest value per hour of the capability work. Phase 2 makes the product real.
Phase 3 and 3.5 are what someone pays for. Phase 4 is what a label pays more
for. Phase 5 is the business.

Read top to bottom and a capability phase looks like a milestone. It is not.
**A capability finished across all tenants while no single band has had one good
Friday is the failure mode this document exists to prevent.**

Nothing in any phase reaches the operator until the approval-notification node
has a value in its required field.

---

## 10. The autonomous build loop

The intent is an agent that works a full night unattended: implement a sprint,
hunt bugs, optimise, run the gates, push, deploy, continue to the next sprint.
That is achievable, and the difference between it working and it doing damage is
entirely in the rules below.

### 10-0. Who does which half

The workhorse is **SWE-2 Max**. Its published behaviour decides the split, and
the number that matters is this one: it makes *"its first real edit after a
median of 18 steps, compared with 48"* for the previous model. It is trained to
judge which parts of a codebase matter and then act. That is the right trade for
execution and the wrong one for audit.

This document exists because of what under-exploration costs here. §4c claimed
eight brain modules were available; three were not, in three different ways.
That was found by reading call sites, not by reading the plan — and the first
correction was still wrong, because a type-name grep misses `calibration`
reached through `record_by_regime` and `platform_yield` running inside
`rank_templates`. The audit took far more than 18 steps and was worth every one.

So:

- **Exploration and audit happen before the loop starts, by a model asked to
  explore, and land as written facts.** "Check whether calibration is wired" is
  not a task to hand a model optimised to stop exploring. "Wire the read path
  for calibration, which `evidence_replay` already writes" is.
- **SWE-2 Max executes a specified change and proves it.** Its stated strengths
  are exactly this half: it *"re-derives conclusions rather than re-asserting"*,
  and it writes tests that catch edge cases. Give it the spec, the done-when,
  and the gates.
- **The gates are what replace the exploration it skips.** A model that reaches
  its first edit in 18 steps has not read the fan-out contract, the blue-green
  alias rule or the workspace-scope ratchet. It does not need to, if those are
  enforced rather than described. Every rule in this repository that exists only
  as prose is a rule this loop will break.

### 10-0b. Effort level as the Pareto dial

SWE-2 runs at medium, high and max. Match the level to how much judgement the
task needs, not to how large it is:

- **Medium** — the change is specified, the done-when is mechanical, and a gate
  will catch a mistake. Most of Phase 1G and 1R is this.
- **High** — the change touches a contract shared across repositories, or a
  read model's degraded path, where the failure is silent rather than loud.
- **Max** — anything where the task is to decide rather than to build: the
  prune in §11, the `platform_yield` verdict in §8, and any step whose
  done-when contains the word "honest".

A task at the wrong level fails in a predictable direction. Too low and it edits
before it understands; too high and it explores a problem that a gate had
already settled.

### 10-1. Definition of done, per sprint

A sprint is not finished when the feature works. It is finished when all seven
hold:

1. **Feature complete** against the sprint's own done-when line.
2. **Deep bug hunt.** Not a test run — an adversarial read of what was written:
   error paths, empty and null cases, concurrent writers, partial failures,
   what happens when the tenant is unreachable mid-operation. Read models fan
   out, so the question is always *what does this report when one section is
   missing* — and the answer must be `degraded` and `null`, never `0`.
3. **Performance pass, measured.** A number before and a number after. An
   optimisation without a measurement is superstition and does not count. Look
   first at the four large files, at N+1 queries behind fan-outs, and at any new
   query missing an index.
4. **Findings written to `docs/BUG-TRACKER.md`** — root cause, not symptom. A
   bug found and fixed silently teaches nothing to the next sprint.
5. **`just ci` green** in every repo touched. Same recipes as CI, so local and
   CI cannot drift.
6. **Pushed**, with a message that says what changed and why.
7. **Deployed and verified** — reported runtime revision *and* health checked
   after, not assumed. Then the next sprint starts.

### 10-2. What the agent must never do alone

These are not stylistic preferences. Each one is a way an unattended night ends
with damage that morning cannot undo.

- **Never contact a real person.** The overnight loop runs draft-only. Anything
  that would send to a fan, a promoter or a venue waits for a human in the
  morning. A bad send is not revertible — the person received it. This is the
  single most important line in this section.
- **Never weaken a gate to go green.** A failing test, a clippy denial, or a
  contract gate ends the night's work on that sprint. It does not get deleted,
  skipped, `#[ignore]`d, or its assertion loosened. The repository rule is
  already explicit: *never bypass the architecture to make a deploy green.*
- **Never edit an applied migration.** They are checksummed. Write a new one.
- **Never touch consent, contact-governor caps, cooldowns, or
  `max_campaigns_per_month`** to make a feature work. Caps outvote ambition,
  including the agent's.
- **Never change credentials, tokens, or environment values**, and never
  hardcode a blue/green container name — `crowdrelay-api-active` only.
- **Never merge two fan identities on a guess** (§4e-5). A wrong merge is a
  privacy incident.
- **Never delete or rewrite production data.** Migrations that drop or rewrite
  columns wait for a human, awake.

### 10-3. Stop, and leave a note

When a rule above blocks progress, the agent stops that sprint, writes what it
hit and what it would have done, and moves to the next sprint that is not
blocked. It does not work around the rule and it does not idle until morning.

A night that delivers three sprints and one written-up blocker is a good night.
A night that delivers four sprints by loosening one assertion is a bad one, and
the loss shows up weeks later when nobody remembers which assertion it was.

### 10-4. What the loop cannot do here, today

Two hard limits, so the plan does not promise a night that cannot happen:

- **Production writes over SSH are refused by this environment's permission
  layer.** An overnight loop reaching the point of a production POST stops
  there and waits. Plan the night's work so that is the last step, not the
  middle one.
- **Phase 0 is human work.** The n8n node's empty required field and the n8n
  credential are in a UI on another host. No amount of overnight autonomy
  substitutes for those two fixes, and every sprint below them is dark until
  they are done.

### 10-5. Order for an unattended night — see also §11

Nothing in the overnight loop prunes. Removal is a judgement about value over
time, which needs evidence the night does not have. §11 is a phase, not a chore
an agent does at 3am.

### 10-5b. Order for an unattended night

Take the phases in the order §9 gives, and inside a night prefer work that is
reversible and local: domain logic and tests first, then read models, then the
console, then anything that touches a queue or an executor. Deploy after each
sprint rather than batching — a deploy that fails is diagnosable when it carries
one sprint and guesswork when it carries four.

---

## 11. The prune — after the list, not during it

Everything above adds. A system that only ever adds ends with three hundred
things to maintain, of which thirty carry the product, and the maintenance cost
of the other two hundred and seventy is paid every sprint by whoever is still
there. This phase is the counterweight, and it runs **once the work above is
done**, not alongside it.

### 11-1. The bar for removal

Occam, with one clause that matters more than the razor:

> **Cut what returns nothing. Keep what returns a little.** A feature that helps
> even slightly, and is genuinely part of how the system works, stays. The target
> is dead weight and duplication, not minimalism for its own sake.

Two things qualify for removal and nothing else does:

1. **Zero value.** It is used by nobody, it informs no decision, and removing it
   changes no outcome.
2. **Duplication.** Two things do one job. Merge them, keep one.

"I do not like it", "it is old", and "I would build it differently now" are not
on that list.

### 11-2. Prove it is dead before killing it

This system already emits the evidence. Use it rather than an opinion:

- **Emitted versus confirmed, per action kind.** The 14-day table in §3 is
  exactly this instrument: `fan.lifecycle.message.request` 21/21 against
  `show.task.escalate` 91/**0**.
- **Route and surface usage**, per role, over a real month.
- **Whether a read-model section is ever read.** Each one costs a call in the
  fan-out, and `WIDEST_FAN_OUT` is a number that should go down as well as up.
- **Worker templates.** Fourteen exist. How many produced a draft a human
  approved in the last month is a knowable number.

### 11-3. The mistake that would make this phase destructive

**Dark is not the same as dead.** §3 records `community.engage.request` at 10
emitted and 0 confirmed, and `content.artifact.request` at 4 and 0. Both look
like textbook dead features. Both are dark because of one empty required field
in one n8n node.

The production `agent-service` is the sharpest case: 48 hours of nothing but
`/health`, entirely vestigial in this deployment — and it is the component the
growth loop runs on once the loop runs at all. Pruned on today's telemetry, it
would be deleted precisely because the thing it exists for is broken.

So the rule, and it is the reason this is a late phase:

> **Measure only while the loop is working.** A month of honest traffic after the
> breaks are fixed. Anything measured during an outage is measuring the outage.

### 11-4. What is never pruned

Some machinery is silent by design, and its value is the event that did not
happen. It will look like zero in every telemetry view, permanently:

- The contact governor — cooldowns, `do_not_contact`, atomic reservation.
- Admission and topical screening, added after r/metalgearsolid.
- Consent caps, `max_campaigns_per_month`, pause and revoke.
- Fail-closed paths on contradictory terminal results.
- `degraded` reporting and null-not-zero. A section that reports it could not be
  reached looks like noise until the day it is the only reason a wrong number was
  not believed.
- The empty-denominator invariants that say "insufficient evidence".

A guard that has never fired is not an unused guard. It is a guard.

### 11-5. Order

1. Fix the breaks. Run the loop for a month. (This is §5's Phase 0 — the prune
   simply cannot start before it.)
2. Collect usage per surface, per action kind, per template, per read-model
   section.
3. **Merge duplicates first** — cheapest, safest, and the largest share of the
   clutter. The console audit already found `overview`, `runtime` and
   `communities` each existing twice under one name, and `intelligence` and
   `intel` as two names for one idea.
4. Remove the zero-value remainder, one thing per commit, each reversible.
5. Write down what was removed and why. The next person will otherwise rebuild
   it, which is how the count got high in the first place.

This project has done this once already and it went well: the `acquisition`
section came out of the fan-out and its projection, `WIDEST_FAN_OUT` went 9 to 8,
and roughly thirty test sites went with it. Nothing was lost. That is the model.

## Outcome

A product that really takes a lot of work off the tenant's shoulders.
Augments growth strategy, gets more fans, improves the content creation process.
Helps getting a bigger, dedicated fanbase with better conversion for tickets,
merch, sales. Working in full synergy with tenant actions and helping them really
grow. Tenant produces real human content. This improves the reach and getting to
the fanbases in a friendly, human-like way. And all of the other machinery - loop,
learning cycle etc. 