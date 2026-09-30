// The capability map: everything the system can do, grouped by the North
// Star's three verbs plus the machinery that runs them.
//
// Two kinds of entry. `SURFACE_CAPABILITIES` are served by the table-driven
// operator surface (`lib/surface.ts`) and render live on the capabilities page
// — reads as data, writes as forms. `PAGE_CAPABILITIES` already have a
// designed home; the map names the page so a person new to the system can find
// every feature from one place. `scripts/test_capability_map.py` fails when a
// SURFACE entry in `surface_routes.rs` has no capability here, so a route
// cannot be proxied and stay invisible.

export type Pillar = 'aggregate' | 'grow' | 'convert' | 'operate'

export const PILLARS: { id: Pillar; title: string; question: string }[] = [
  { id: 'aggregate', title: 'Aggregate', question: 'Where are the fans, and are they all in one place?' },
  { id: 'grow', title: 'Grow', question: 'What reaches new people for real?' },
  { id: 'convert', title: 'Convert', question: 'What turns a fan into a ticket, a shirt, a night out?' },
  { id: 'operate', title: 'Operate', question: 'Is the machine working, and what did it do?' },
]

export type FieldKind = 'text' | 'textarea' | 'number' | 'bool' | 'datetime' | 'select' | 'json' | 'uuid' | 'lines'

export type Field = {
  name: string
  label: string
  kind: FieldKind
  required?: boolean
  options?: readonly string[]
  /** `lines` only: plain strings, or `email, name, locale` fan entries. */
  lines?: 'strings' | 'fans'
  hint?: string
  initial?: string | number | boolean
}

/** Where a path parameter's value comes from when no row supplies it. */
export type ParamSource = 'event_slug' | 'event_id' | 'text'

export type CapabilityAction = {
  label: string
  method: 'POST' | 'PUT' | 'DELETE'
  /** Table path, exactly as in `surface_routes.rs`. */
  path: string
  fields?: Field[]
  /** Path parameters filled from a row of the capability's read — the
   *  action then renders on each row. Maps parameter → row field. */
  rowParams?: Record<string, string>
  /** Parameters asked for on the form when no row supplies them. */
  paramSources?: Record<string, ParamSource>
  /** A sentence shown before an outward-facing or hard-to-undo write. */
  confirm?: string
}

export type Capability = {
  id: string
  pillar: Pillar
  title: string
  purpose: string
  read?: {
    path: string
    paramSources?: Record<string, ParamSource>
    query?: Field[]
  }
  actions?: CapabilityAction[]
  /** Where the capability lives: the page (route under `/tenants/$slug`,
   *  with its tab) and the section a person finds it in. Placed where the
   *  moment already is — the show, the city, the queue — never as a
   *  destination of its own. */
  home?: { path: string; section: string }
  /** Set instead of `home` when no place can host it honestly yet, and why:
   *  a write whose subject no read lists is a finding, not a form. */
  gap?: string
  /** Set when a Control Plane read model fetches this server-side and the
   *  page draws it from there, so no component calls the surface directly. */
  servedBy?: string
  /** Served to platform-level sessions only. */
  platformOnly?: boolean
}

export type PageCapability = {
  pillar: Pillar
  title: string
  purpose: string
  /** Route under `/tenants/$slug`, with its tab where it has one. */
  where: string
}

const MINOR = 'minor units — 1250 is 12.50'
const EXPECTED_VERSION: Field = {
  name: 'expected_version', label: 'Expected version', kind: 'number', required: true, initial: 0,
  hint: '0 creates; otherwise the version you read, so a concurrent edit is refused rather than overwritten',
}

export const SURFACE_CAPABILITIES: Capability[] = [
  // ── Aggregate ──────────────────────────────────────────────────────
  {
    id: 'import-fans', pillar: 'aggregate', gap: 'Deliberately not placed. The Contacts tab uploads the same list into review first — the onboarding path says contacts land in a waiting room and are promoted one by one, not imported in one click. This route skips that review.', title: 'Import a mailing list',
    purpose: 'Bring an existing list in. Every address lands pending and gets the double opt-in email; nobody becomes an active fan without confirming.',
    actions: [{
      label: 'Import', method: 'POST', path: 'portfolio/import-fans',
      confirm: 'Each new address receives a confirmation email. This cannot be unsent.',
      fields: [
        { name: 'source', label: 'Where the list came from', kind: 'text', required: true },
        { name: 'entries', label: 'Addresses', kind: 'lines', lines: 'fans', required: true, hint: 'one per line: email, optional name, optional locale — at most 500' },
      ],
    }],
  },
  {
    id: 'place-detail', pillar: 'aggregate', home: { path: '/audience/communities', section: 'House rules and where we stand' }, title: 'A community, opened',
    purpose: 'One registered place: its rules, the evidence it is real, and where outreach stands.',
    read: { path: 'audience-graph/places/{place_id}', paramSources: { place_id: 'text' } },
    actions: [
      {
        label: 'Set rules', method: 'PUT', path: 'audience-graph/places/{place_id}/rules', paramSources: { place_id: 'text' },
        fields: [
          { name: 'selfPromoRatioPercent', label: 'Self-promo ratio %', kind: 'number' },
          { name: 'contactChannel', label: 'Contact channel', kind: 'text' },
          { name: 'contactTarget', label: 'Contact target', kind: 'text' },
          { name: 'requiresApproval', label: 'Posts need mod approval', kind: 'bool' },
          { name: 'cooldownDays', label: 'Cooldown days', kind: 'number' },
          { name: 'rulesSummary', label: 'Rules in a sentence', kind: 'textarea' },
          { name: 'verified', label: 'Verified', kind: 'bool' },
        ],
      },
      {
        label: 'Add evidence', method: 'POST', path: 'audience-graph/places/{place_id}/evidence', paramSources: { place_id: 'text' },
        fields: [
          { name: 'evidenceKind', label: 'Kind', kind: 'select', required: true, options: ['scan', 'mention', 'sample_post', 'mod_contact', 'manual_note'] },
          { name: 'method', label: 'How it was found', kind: 'text', required: true },
          { name: 'confidenceBp', label: 'Confidence (basis points)', kind: 'number' },
          { name: 'payload', label: 'Detail', kind: 'json' },
        ],
      },
      {
        label: 'Advance outreach', method: 'POST', path: 'audience-graph/places/{place_id}/outreach/advance', paramSources: { place_id: 'text' },
        fields: [
          { name: 'fromStage', label: 'From', kind: 'select', required: true, options: STAGES() },
          { name: 'toStage', label: 'To', kind: 'select', required: true, options: STAGES() },
          { name: 'outcomeNotes', label: 'Notes', kind: 'textarea' },
        ],
      },
    ],
  },
  {
    id: 'peers', pillar: 'aggregate', home: { path: '/places/rooms', section: 'Comparable acts' }, title: 'Peer acts', platformOnly: true,
    purpose: 'Artists whose audiences overlap. The scanner proposes; a person confirms or refuses, and only confirmed peers are watched.',
    read: { path: 'content-engine/peers', query: [{ name: 'status', label: 'Status', kind: 'select', options: ['proposed', 'confirmed', 'rejected'] }] },
    actions: [
      {
        label: 'Add a peer', method: 'POST', path: 'content-engine/peers',
        fields: [
          { name: 'name', label: 'Name', kind: 'text', required: true },
          { name: 'tier', label: 'Tier', kind: 'select', required: true, options: ['aspirational', 'near_peer', 'lateral'] },
          { name: 'why', label: 'Why this act', kind: 'textarea', required: true },
          { name: 'handles', label: 'Handles', kind: 'json', hint: '{"spotify": "…", "instagram": "…"}' },
        ],
      },
      {
        label: 'Resolve', method: 'POST', path: 'content-engine/peers/{peer_id}/resolve', rowParams: { peer_id: 'id' },
        fields: [
          { name: 'status', label: 'Decision', kind: 'select', required: true, options: ['confirmed', 'rejected'] },
          { name: 'rejection_reason', label: 'Reason (rejections)', kind: 'text' },
        ],
      },
    ],
  },
  {
    id: 'connections', pillar: 'aggregate', home: { path: '/audience/sources', section: 'Which connections work' }, title: 'Which connections actually work',
    purpose: 'Every fanbase connection and what is known about it — last sync, last failure. Connected is not the same as working.',
    read: { path: 'ops/connections' },
  },

  // ── Grow ───────────────────────────────────────────────────────────
  {
    id: 'smart-links', pillar: 'grow', home: { path: '/content', section: 'Tracked links' }, title: 'Tracked links',
    purpose: 'Short links that count the click and carry it to signup, so a post can be credited with the fans it brought.',
    read: { path: 'smart-links' },
    actions: [{
      label: 'Create a link', method: 'POST', path: 'smart-links',
      fields: [
        { name: 'slug', label: 'Slug', kind: 'text', required: true },
        { name: 'destination_url', label: 'Destination', kind: 'text', required: true },
        { name: 'channel_source', label: 'Channel', kind: 'text', hint: 'e.g. reddit, instagram' },
        { name: 'channel_community', label: 'Community', kind: 'text' },
        { name: 'channel_creative', label: 'Creative', kind: 'text' },
      ],
    }],
  },
  {
    id: 'releases', pillar: 'grow', home: { path: '/operations/releases', section: 'Release plan' }, title: 'Release plan',
    purpose: 'The releases the brain plans around: date, tier, and whether assets, press and fan messages are ready.',
    read: { path: 'autopilot/releases' },
    actions: [
      {
        label: 'Plan a release', method: 'POST', path: 'autopilot/releases',
        fields: [
          { name: 'source_key', label: 'Source key', kind: 'text', required: true },
          { name: 'title', label: 'Title', kind: 'text', required: true },
          { name: 'release_at', label: 'Release at', kind: 'datetime', required: true },
          { name: 'listen_url', label: 'Listen URL', kind: 'text' },
          { name: 'tier', label: 'Tier', kind: 'select', options: ['single', 'track', 'filler'] },
          { name: 'active', label: 'Active', kind: 'bool', initial: true },
          { name: 'assets_ready', label: 'Assets ready', kind: 'bool' },
          { name: 'communication_enabled', label: 'Tell fans', kind: 'bool' },
          { name: 'press_enabled', label: 'Pitch press', kind: 'bool' },
          EXPECTED_VERSION,
        ],
      },
      { label: 'Editorial pitch done', method: 'POST', path: 'autopilot/releases/{release_id}/editorial-pitch', rowParams: { release_id: 'id' } },
    ],
  },
  { id: 'release-ledger', pillar: 'operate', platformOnly: true, home: { path: '/health', section: 'Software releases' }, title: 'Software releases', purpose: 'Which backend and executor builds are live, and whether they drifted from what was attested.', read: { path: 'autopilot/release-ledger' } },
  { id: 'release-outcomes', pillar: 'grow', home: { path: '/operations/releases', section: 'What releases returned' }, title: 'Release outcomes', purpose: 'What each release measurably returned.', read: { path: 'autopilot/release-outcomes' } },
  {
    id: 'playlist-placements', pillar: 'grow', gap: 'A placement is recorded against an outreach opportunity, and no console read lists outreach opportunities with their ids.', title: 'Playlist placements',
    purpose: "Record a curator's claim, or what a public read of the playlist found. A claim counts for nothing until a read confirms it.",
    actions: [{
      label: 'Record', method: 'POST', path: 'autopilot/playlist-placements',
      fields: [
        { name: 'opportunity_id', label: 'Opportunity', kind: 'uuid', required: true },
        { name: 'playlist_external_id', label: 'Playlist id', kind: 'text', required: true },
        { name: 'track_external_id', label: 'Track id', kind: 'text', required: true },
        { name: 'report', label: 'Report', kind: 'select', required: true, options: ['claimed', 'present', 'absent', 'unreadable'] },
      ],
    }],
  },
  {
    id: 'release-recipient', pillar: 'grow', home: { path: '/operations/releases', section: 'Release campaign recipients' }, title: 'Release campaign recipient',
    purpose: 'Where one physical parcel stands: prepared, sent, delivered or cancelled.',
    actions: [{
      label: 'Update recipient', method: 'POST', path: 'autopilot/beacon-release-campaigns/{campaign_id}/recipients/{beacon_id}',
      paramSources: { campaign_id: 'text', beacon_id: 'text' },
      fields: [{ name: 'status', label: 'Parcel', kind: 'select', required: true, options: ['prepared', 'sent', 'delivered', 'cancelled'] }],
    }],
  },
  {
    id: 'outreach-waves', pillar: 'grow', home: { path: '/operations/outreach', section: 'Waves waiting for one yes' }, title: 'Outreach waves',
    purpose: 'Batches of pitches the brain parked for one yes.',
    read: { path: 'autopilot/outreach-waves' },
    actions: [{
      label: 'Approve wave', method: 'POST', path: 'autopilot/outreach-waves/{wave_id}/approve', rowParams: { wave_id: 'id' },
      confirm: 'Approving sends every pitch in the wave to a real person.',
    }],
  },
  {
    id: 'outreach-targets', pillar: 'grow', home: { path: '/operations/outreach', section: 'Your outreach conversations' }, title: 'Outreach targets',
    purpose: 'Playlists, press, radio, creators and labels the band pitches — add one you know.',
    actions: [
      {
        label: 'Add or update a target', method: 'POST', path: 'autopilot/outreach-targets',
        fields: [
          { name: 'target_kind', label: 'Kind', kind: 'select', required: true, options: ['playlist', 'radio', 'press', 'creator', 'support_slot', 'endorsement', 'media_patronage', 'organiser', 'agent', 'label'] },
          { name: 'display_name', label: 'Name', kind: 'text', required: true },
          { name: 'contact_email', label: 'Email', kind: 'text', required: true },
          { name: 'priority', label: 'Priority', kind: 'number', required: true, initial: 50 },
          { name: 'relationship_score', label: 'Relationship score', kind: 'number', required: true, initial: 0 },
          { name: 'active', label: 'Active', kind: 'bool', initial: true },
          { name: 'verified', label: 'Verified', kind: 'bool' },
          { name: 'accepts_outreach', label: 'Accepts outreach', kind: 'bool' },
          { name: 'accepts_outreach_basis', label: 'Basis for that', kind: 'text' },
          { name: 'do_not_contact', label: 'Do not contact', kind: 'bool' },
          EXPECTED_VERSION,
        ],
      },
      {
        label: 'Submission channel', method: 'POST', path: 'autopilot/outreach/submission-channels',
        fields: [
          { name: 'slug', label: 'Slug', kind: 'text', required: true },
          { name: 'display_name', label: 'Name', kind: 'text', required: true },
          { name: 'cost_model', label: 'Cost', kind: 'select', required: true, options: ['free', 'credit', 'fee', 'paid_placement'], hint: 'paid placement is never used' },
          { name: 'submission_url', label: 'URL', kind: 'text' },
          { name: 'active', label: 'Active', kind: 'bool', initial: true },
        ],
      },
    ],
  },
  {
    // One contact's whole thread — the drawer a row in the conversations
    // list opens. Carries the suppression control too: 'I wrote back' and
    // 'Record a reply' already live on outreach-conversations and
    // outreach-replies; "don't contact" needed a route of its own.
    id: 'outreach-conversation', pillar: 'grow',
    home: { path: '/operations/outreach', section: 'Your outreach conversations' },
    title: 'A contact’s conversation',
    purpose: 'Every message either way, the letters the machine drafted or sent, and what happens next.',
    read: { path: 'autopilot/outreach-targets/{target_id}/conversation', paramSources: { target_id: 'text' } },
    actions: [
      {
        label: "Don't contact", method: 'POST', path: 'autopilot/outreach-targets/{target_id}/suppression', rowParams: { target_id: 'target_id' },
        confirm: 'No machine letter ever goes to this address again.',
        fields: [
          { name: 'do_not_contact', label: 'Do not contact', kind: 'bool', initial: true },
          { name: 'occurred_at', label: 'When', kind: 'datetime', required: true },
        ],
      },
      {
        label: 'Contact again', method: 'POST', path: 'autopilot/outreach-targets/{target_id}/suppression', rowParams: { target_id: 'target_id' },
        confirm: 'Lifts the do-not-contact mark. Their outreach consent stays off — they will still not be pitched unless consent is restored.',
        fields: [
          { name: 'do_not_contact', label: 'Do not contact', kind: 'bool', initial: false },
          { name: 'occurred_at', label: 'When', kind: 'datetime', required: true },
        ],
      },
    ],
  },
  {
    // The reply half of the outreach contacts: it has a row to attach to
    // now — every contact whose last word is theirs is listed with its id.
    id: 'outreach-replies', pillar: 'grow', home: { path: '/operations/replies', section: 'Answered you — your turn' }, title: 'Answers from outreach contacts',
    purpose: 'Press, radio, venues and agents who wrote back — log how it went, and a no takes them off the list.',
    actions: [
      {
        label: 'Record a reply', method: 'POST', path: 'autopilot/outreach-targets/{target_id}/reply', paramSources: { target_id: 'text' },
        fields: [
          { name: 'disposition', label: 'Answer', kind: 'select', required: true, options: ['none', 'received', 'positive', 'declined', 'do_not_contact'] },
          { name: 'reply_text', label: 'What they said', kind: 'textarea' },
          { name: 'occurred_at', label: 'When', kind: 'datetime', required: true },
          { name: 'opportunity_id', label: 'Opportunity', kind: 'uuid' },
        ],
      },
    ],
  },
  {
    // The whole outreach list, as conversations: the act's press, radio,
    // venue and agent outreach lived in its own sheets, with no list here.
    id: 'outreach-conversations', pillar: 'grow', home: { path: '/operations/outreach', section: 'Your outreach conversations' }, title: 'Outreach conversations',
    purpose: 'Every press, radio, venue and agent contact with where the conversation stands — whose move it is, who never answered, who never heard from you.',
    read: {
      path: 'autopilot/outreach-contacts',
      query: [
        { name: 'state', label: 'Where it stands', kind: 'select', options: ['your_turn', 'waiting_on_them', 'not_contacted', 'closed'] },
        { name: 'kind', label: 'Kind', kind: 'text' },
        { name: 'limit', label: 'How many', kind: 'number' },
      ],
    },
    actions: [{
      label: 'I wrote back', method: 'POST', path: 'autopilot/outreach-targets/{target_id}/written', rowParams: { target_id: 'target_id' },
      fields: [{ name: 'occurred_at', label: 'When', kind: 'datetime', required: true }],
    }],
  },
  {
    id: 'relay-ladder', pillar: 'grow', home: { path: '/content/material', section: 'Each source' }, title: "A post's relay spread",
    purpose: "One yes releases a synced post's whole spread — push and every admitted community; revoke stops what has not run.",
    actions: [
      { label: 'Approve spread', method: 'POST', path: 'autopilot/content-sources/{source_id}/relay-ladder/approve', paramSources: { source_id: 'text' }, confirm: 'Approving posts to real communities.' },
      { label: 'Revoke spread', method: 'POST', path: 'autopilot/content-sources/{source_id}/relay-ladder/revoke', paramSources: { source_id: 'text' } },
    ],
  },
  {
    id: 'content-promotion', pillar: 'grow', home: { path: '/content/material', section: 'Each source' }, title: 'Guarded source promotion',
    purpose: 'Request the existing promotion cycle with source-owned platform exclusions; this is not evidence of publication.',
    actions: [{ label: 'Request promotion', method: 'POST', path: 'autopilot/content-sources/{source_id}/promote', paramSources: { source_id: 'text' }, fields: [
      { name: 'excluded_platforms', label: 'Excluded platforms', kind: 'json', hint: 'A JSON list of platform names. Videos exclude Facebook and Instagram when omitted.' },
    ] }],
  },
  { id: 'video-scorecards', pillar: 'grow', home: { path: '/content/material', section: 'Videos that make fans' }, title: 'Videos that make fans', purpose: 'Which recent videos turn tracked attention into owned fans, ranked by people who joined the owned fanbase after clicking through.', read: { path: 'content/videos/scorecards', query: [{ name: 'limit', label: 'Limit', kind: 'number' }] } },
  {
    id: 'manual-posts', pillar: 'grow', home: { path: '/content', section: 'Went out' }, title: 'Telegram and Discord, posted by hand',
    purpose: 'Every outbound channel drafts and waits for a person. After posting a draft yourself, register the message so the row closes and measurement starts.',
    actions: [
      { label: 'Telegram posted', method: 'POST', path: 'telegram-posts/{telegram_post_id}/register-manual', paramSources: { telegram_post_id: 'text' }, fields: [{ name: 'message_id', label: 'Telegram message id', kind: 'number', required: true }] },
      { label: 'Discord posted', method: 'POST', path: 'discord-posts/{discord_post_id}/register-manual', paramSources: { discord_post_id: 'text' }, fields: [{ name: 'message_id', label: 'Discord message id', kind: 'text', required: true }] },
    ],
  },
  {
    id: 'suggestion-outcome', pillar: 'grow', gap: 'No read lists approved content suggestions after approval, so there is no row to report an outcome against. Needs an upstream read of approved, unreported suggestions.', title: 'Content suggestion outcome',
    purpose: 'Tell the brain what became of a suggestion — done, or done differently and how.',
    actions: [{
      label: 'Report outcome', method: 'POST', path: 'autopilot/content-suggestions/{suggestion_id}/outcome', paramSources: { suggestion_id: 'text' },
      fields: [
        { name: 'outcome', label: 'Outcome', kind: 'select', required: true, options: ['done', 'done_differently'] },
        { name: 'reason', label: 'What was made instead', kind: 'textarea' },
        { name: 'results', label: 'Results', kind: 'json' },
      ],
    }],
  },
  {
    id: 'amplification', pillar: 'grow', home: { path: '/audience/portfolio', section: 'Cross-promotion' }, title: 'Cross-promotion with a labelmate',
    purpose: "Propose sharing consented audience with another act on the roster, preview who it would reach, and run the campaign once they accept.",
    actions: [
      {
        label: 'Propose', method: 'POST', path: 'portfolio/amplification',
        fields: [
          { name: 'toWorkspaceId', label: 'Other act (workspace id)', kind: 'uuid', required: true },
          { name: 'purpose', label: 'Purpose', kind: 'select', required: true, options: ['cross_promote', 'release_feature', 'event_crossbill'] },
          { name: 'scope', label: 'Scope', kind: 'select', options: ['all_active', 'double_opt_in'] },
          { name: 'maxCampaignsPerMonth', label: 'Max campaigns / month', kind: 'number', initial: 2 },
          { name: 'cooldownDays', label: 'Cooldown days', kind: 'number', initial: 21 },
        ],
      },
      {
        label: 'Run campaign', method: 'POST', path: 'portfolio/amplification/{consent_id}/campaign', paramSources: { consent_id: 'text' },
        confirm: 'This emails real fans of the other act.',
        fields: [
          { name: 'campaignReference', label: 'Reference', kind: 'text', required: true },
          { name: 'subject', label: 'Subject', kind: 'text', required: true },
          { name: 'text', label: 'Text', kind: 'textarea', required: true },
          { name: 'limit', label: 'At most', kind: 'number' },
        ],
      },
    ],
  },
  { id: 'amplification-preview', pillar: 'grow', home: { path: '/audience/portfolio', section: 'Cross-promotion' }, title: 'Who a cross-promotion reaches', purpose: 'Audience preview for one accepted consent.', read: { path: 'portfolio/amplification/{consent_id}/audience-preview', paramSources: { consent_id: 'text' } } },
  { id: 'case-study', pillar: 'grow', home: { path: '/proof', section: 'The roster story' }, title: 'Roster case study', purpose: 'One document to attach to a partner conversation.', read: { path: 'portfolio/case-study' } },

  // ── Convert ────────────────────────────────────────────────────────
  { id: 'funnel', pillar: 'convert', home: { path: '/audience/sources', section: 'What it turned into' }, title: 'Fan funnel', purpose: 'Where fans came from and how far they got.', read: { path: 'analytics/funnel' } },
  { id: 'revenue', pillar: 'convert', home: { path: '/audience/sources', section: 'What it turned into' }, title: 'Revenue', purpose: 'Paid orders, gross and refunded, per currency.', read: { path: 'analytics/revenue' } },
  { id: 'referral-conversion', pillar: 'convert', home: { path: '/audience/sources', section: 'What it turned into' }, title: 'Referral conversion', purpose: 'What fans bringing fans actually converted.', read: { path: 'analytics/referral-conversion' } },
  { id: 'ad-conversion', pillar: 'convert', home: { path: '/audience/sources', section: 'What it turned into' }, title: 'Ad conversion', purpose: 'Paid reach against the fans and tickets it produced.', read: { path: 'analytics/ad-conversion' } },
  { id: 'ad-conversion-breakdown', pillar: 'convert', home: { path: '/audience/sources', section: 'What it turned into' }, title: 'Ad conversion by campaign', purpose: 'The same, per campaign and creative.', read: { path: 'analytics/ad-conversion/breakdown' } },
  {
    id: 'communications', pillar: 'convert', home: { path: '/audience', section: 'Messages to fans' }, title: 'Fan messages',
    purpose: 'Campaigns to a segment of the fanbase: draft, schedule, cancel.',
    read: { path: 'communications/campaigns' },
    actions: [
      {
        label: 'Draft a campaign', method: 'POST', path: 'communications/campaigns',
        fields: [
          { name: 'slug', label: 'Slug', kind: 'text', required: true },
          { name: 'name', label: 'Name', kind: 'text', required: true },
          { name: 'channel', label: 'Channel', kind: 'select', required: true, options: ['email', 'push', 'in_app'] },
          { name: 'segment_slug', label: 'Who it goes to', kind: 'text', required: true, hint: 'a segment from the list above' },
          { name: 'template_key', label: 'Template', kind: 'text', required: true, hint: 'the message template the sender renders' },
          { name: 'subject', label: 'Subject', kind: 'text' },
          { name: 'content', label: 'Content', kind: 'json' },
        ],
      },
      { label: 'Schedule', method: 'POST', path: 'communications/campaigns/{campaign_id}/schedule', rowParams: { campaign_id: 'id' }, confirm: 'A scheduled campaign sends to real fans.', fields: [{ name: 'scheduled_at', label: 'Send at', kind: 'datetime', required: true }] },
      { label: 'Cancel', method: 'POST', path: 'communications/campaigns/{campaign_id}/cancel', rowParams: { campaign_id: 'id' } },
    ],
  },
  {
    id: 'referral-code', pillar: 'convert', home: { path: '/audience', section: 'A fan, opened' }, title: "A fan's referral code",
    purpose: 'Mint (or read back) the code a fan shares to bring friends.',
    actions: [{ label: 'Get code', method: 'POST', path: 'audience/fans/{fan_id}/referral-code', paramSources: { fan_id: 'text' } }],
  },
  {
    id: 'ticketing', pillar: 'convert', home: { path: '/shows/<show>', section: 'Tickets and merch' }, title: 'Ticket sale',
    purpose: 'Capacity, tiers and sales for one show. Price and capacity are set by the box office; this is the read. A show with no sale configured answers “not found”.',
    read: { path: 'events/{event_slug}/ticketing', paramSources: { event_slug: 'event_slug' } },
  },
  {
    id: 'show-setup', pillar: 'convert', home: { path: '/shows/<show>', section: 'Set up the night' }, title: 'Support slots and festival',
    purpose: 'How many support slots a night has open, and the festival it belongs to.',
    actions: [
      { label: 'Open support slots', method: 'PUT', path: 'events/{event_slug}/support-slots', paramSources: { event_slug: 'event_slug' }, fields: [{ name: 'open_support_slots', label: 'Open slots', kind: 'number' }] },
      { label: 'Festival', method: 'PUT', path: 'events/{event_slug}/festival', paramSources: { event_slug: 'event_slug' }, fields: [{ name: 'festival_name', label: 'Festival name', kind: 'text' }] },
    ],
  },
  {
    id: 'show-merch', pillar: 'convert', home: { path: '/shows/<show>', section: 'Tickets and merch' }, title: 'Merch at the night',
    purpose: 'Orders tied to one show, what is waiting at the merch table, and what it took.',
    read: { path: 'events/{event_id}/commerce-summary', paramSources: { event_id: 'event_id' } },
  },
  {
    id: 'show-costs', pillar: 'convert', home: { path: '/shows/<show>', section: 'The money' }, title: 'Show costs',
    purpose: 'Freeze the cost prediction before a show and settle the real numbers after, so the brain learns what a night costs.',
    actions: [
      {
        label: 'Freeze prediction', method: 'POST', path: 'events/{event_id}/show-cost/prediction', paramSources: { event_id: 'event_id' },
        fields: [
          { name: 'distance_km', label: 'Distance km', kind: 'number' },
          { name: 'nights_away', label: 'Nights away', kind: 'number' },
          { name: 'offered_fee_minor', label: 'Offered fee', kind: 'number', required: true, hint: MINOR },
          { name: 'application_fee_minor', label: 'Application fee', kind: 'number', hint: MINOR },
        ],
      },
      {
        label: 'Settle', method: 'POST', path: 'events/{event_id}/show-cost/settlement', paramSources: { event_id: 'event_id' },
        fields: [
          { name: 'transport_minor', label: 'Transport', kind: 'number', required: true, hint: MINOR },
          { name: 'accommodation_minor', label: 'Accommodation', kind: 'number', required: true, hint: MINOR },
          { name: 'per_diem_minor', label: 'Per diem', kind: 'number', required: true, hint: MINOR },
          { name: 'overhead_minor', label: 'Overhead', kind: 'number', required: true, hint: MINOR },
          { name: 'other_minor', label: 'Other', kind: 'number', hint: MINOR },
          { name: 'fee_received_minor', label: 'Fee received', kind: 'number', required: true, hint: MINOR },
          { name: 'settled_by', label: 'Settled by', kind: 'text', required: true },
        ],
      },
    ],
  },
  {
    id: 'checklist', pillar: 'convert', home: { path: '/shows/<show>', section: 'The night’s checklist' }, title: 'Show checklist',
    purpose: "The night's operating checklist, item by item.",
    read: { path: 'ecosystem/checklists/{event_slug}', paramSources: { event_slug: 'event_slug' } },
    actions: [{
      label: 'Update item', method: 'POST', path: 'ecosystem/checklists/{event_slug}/{item_key}', paramSources: { event_slug: 'event_slug', item_key: 'text' },
      fields: [
        { name: 'status', label: 'Status', kind: 'select', required: true, options: ['pending', 'done', 'blocked', 'skipped'] },
        { name: 'note', label: 'Note', kind: 'text' },
      ],
    }],
  },
  {
    id: 'event-qr', pillar: 'convert', home: { path: '/shows/<show>', section: 'At the door' }, title: 'Concert QR campaigns',
    purpose: 'A QR code for a night — where it hangs, whether it was announced from the stage, what it offers.',
    read: { path: 'event-qr/campaigns', query: [{ name: 'limit', label: 'Limit', kind: 'number' }] },
    actions: [
      {
        label: 'Create', method: 'POST', path: 'event-qr/campaigns',
        fields: [
          { name: 'event_slug', label: 'Show', kind: 'text', required: true },
          { name: 'label', label: 'Label', kind: 'text', required: true },
          { name: 'valid_from', label: 'Valid from', kind: 'datetime', required: true },
          { name: 'valid_until', label: 'Valid until', kind: 'datetime', required: true },
          { name: 'max_checkins', label: 'Max check-ins', kind: 'number' },
          { name: 'placement', label: 'Placement', kind: 'text' },
          { name: 'announced_from_stage', label: 'Announced from stage', kind: 'bool' },
          { name: 'incentive', label: 'Incentive', kind: 'text' },
        ],
      },
      { label: 'Revoke', method: 'POST', path: 'event-qr/campaigns/{campaign_id}/revoke', rowParams: { campaign_id: 'id' } },
      {
        label: 'Context', method: 'POST', path: 'event-qr/campaigns/{campaign_id}/context', rowParams: { campaign_id: 'id' },
        fields: [
          { name: 'placement', label: 'Placement', kind: 'text' },
          { name: 'announced_from_stage', label: 'Announced from stage', kind: 'bool' },
          { name: 'incentive', label: 'Incentive', kind: 'text' },
        ],
      },
    ],
  },
  {
    id: 'merch', pillar: 'convert', home: { path: '/shows/merch', section: 'Merch table' }, title: 'Merch catalogue',
    purpose: 'Products, variants and prices.',
    read: { path: 'merch/catalog' },
    actions: [{ label: 'Upsert products', method: 'POST', path: 'merch/catalog', fields: [{ name: 'products', label: 'Products', kind: 'json', required: true, hint: '[{"slug","name","currency","price_gross_minor","active","public","variants":[…]}]' }] }],
  },
  {
    id: 'inventory', pillar: 'convert', home: { path: '/shows/merch', section: 'Merch table' }, title: 'Merch stock',
    purpose: 'What is on hand, whether stock is ready to sell, and every movement.',
    read: { path: 'merch/inventory/overview' },
    actions: [
      { label: 'Stocktake', method: 'POST', path: 'merch/inventory/stocktakes', fields: [{ name: 'items', label: 'Counts', kind: 'json', required: true, hint: '[{"sku":"…","on_hand":12}]' }, { name: 'reason', label: 'Reason', kind: 'text' }] },
      { label: 'Mark ready', method: 'POST', path: 'merch/inventory/ready', fields: [{ name: 'actor_id', label: 'Who', kind: 'text' }] },
      {
        label: 'Adjust', method: 'POST', path: 'merch/inventory/adjustments',
        fields: [
          { name: 'sku', label: 'SKU', kind: 'text', required: true },
          { name: 'delta', label: 'Change', kind: 'number', required: true },
          { name: 'movement_kind', label: 'Kind', kind: 'select', required: true, options: ['receipt', 'adjustment', 'promotional_issue', 'damage', 'staff_issue', 'refund'] },
          { name: 'reason', label: 'Reason', kind: 'text' },
        ],
      },
    ],
  },
  { id: 'inventory-activation', pillar: 'convert', home: { path: '/shows/merch', section: 'Merch table' }, title: 'Stock activation', purpose: 'What still blocks selling from stock.', read: { path: 'merch/inventory/activation' } },
  { id: 'merch-recommendations', pillar: 'convert', home: { path: '/shows/merch', section: 'Merch table' }, title: 'Merch to promote', purpose: 'Which products the numbers say to push.', read: { path: 'merch/promotion-recommendations' } },
  {
    id: 'guardrails', pillar: 'convert', home: { path: '/health/policies', section: 'Bounds it moves within' }, title: 'Ad spend ceiling',
    purpose: 'The most the brain may spend on ads per day and per month, per currency.',
    actions: [
      { label: 'Ad spend ceiling', method: 'POST', path: 'autopilot/promotion-budget-guardrails', fields: [{ name: 'currency', label: 'Currency', kind: 'text', required: true, initial: 'EUR' }, { name: 'maximum_total_daily_budget_minor', label: 'Max daily', kind: 'number', required: true, hint: MINOR }, { name: 'maximum_monthly_spend_minor', label: 'Max monthly', kind: 'number', required: true, hint: MINOR }, EXPECTED_VERSION] },
    ],
  },
  {
    id: 'merch-price-bounds', pillar: 'convert', gap: 'Setting bounds the first time works, but no read returns the current bounds or their version, so a change would be refused as a conflict. Needs a read of merch economics per product.', title: 'Merch price bounds',
    purpose: 'The range the brain may move one product’s price within.',
    actions: [
      { label: 'Merch price bounds', method: 'POST', path: 'autopilot/merch-economics', fields: [{ name: 'product_id', label: 'Product', kind: 'uuid', required: true }, { name: 'minimum_price_minor', label: 'Min price', kind: 'number', required: true, hint: MINOR }, { name: 'maximum_price_minor', label: 'Max price', kind: 'number', required: true, hint: MINOR }, { name: 'unit_cost_minor', label: 'Unit cost', kind: 'number', hint: MINOR }, EXPECTED_VERSION] },
    ],
  },
  {
    id: 'ticket-bounds', pillar: 'convert', gap: 'Same as merch: no read returns a ticket type’s allocation bounds or version, so only the first write succeeds.', title: 'Ticket allocation bounds',
    purpose: 'The capacity range the brain may move one ticket type within.',
    actions: [
      { label: 'Ticket allocation bounds', method: 'POST', path: 'autopilot/ticket-allocation-guardrails', fields: [{ name: 'ticket_type_id', label: 'Ticket type', kind: 'uuid', required: true }, { name: 'minimum_capacity', label: 'Min', kind: 'number', required: true }, { name: 'maximum_capacity', label: 'Max', kind: 'number', required: true }, { name: 'step_capacity', label: 'Step', kind: 'number', required: true }, EXPECTED_VERSION] },
    ],
  },
  {
    id: 'rewards', pillar: 'convert', home: { path: '/shows/<show>', section: 'At the door' }, title: 'Fan reward draws',
    purpose: 'Prize draws fans enter by referring and checking in. Create, schedule, cancel.',
    read: { path: 'reward-campaigns' },
    actions: [
      {
        label: 'Create a draw', method: 'POST', path: 'reward-campaigns',
        fields: [
          { name: 'slug', label: 'Slug', kind: 'text', required: true },
          { name: 'name', label: 'Name', kind: 'text', required: true },
          { name: 'prize_sku', label: 'Prize SKU', kind: 'text', required: true },
          { name: 'winner_count', label: 'Winners', kind: 'number', required: true, initial: 1 },
          { name: 'event_slug', label: 'Show', kind: 'text' },
          { name: 'opens_at', label: 'Opens', kind: 'datetime', required: true },
          { name: 'closes_at', label: 'Closes', kind: 'datetime', required: true },
          { name: 'draw_at', label: 'Draw at', kind: 'datetime', required: true },
          { name: 'status', label: 'Status', kind: 'select', required: true, options: ['draft', 'scheduled'], initial: 'draft' },
        ],
      },
      { label: 'Schedule', method: 'POST', path: 'reward-campaigns/{draw_id}/schedule', rowParams: { draw_id: 'id' } },
      { label: 'Cancel', method: 'POST', path: 'reward-campaigns/{draw_id}/cancel', rowParams: { draw_id: 'id' } },
    ],
  },
  {
    id: 'reward-fulfillments', pillar: 'convert', home: { path: '/operations', section: 'Prizes to send' }, title: 'Prizes to send',
    purpose: 'Winners whose prize has not gone out yet.',
    read: { path: 'reward-fulfillments' },
    actions: [{ label: 'Mark', method: 'POST', path: 'reward-fulfillments/{winner_id}', rowParams: { winner_id: 'winner_id' }, fields: [{ name: 'status', label: 'The prize is', kind: 'select', required: true, options: ['prepared', 'delivered', 'cancelled'] }, { name: 'note', label: 'Note', kind: 'text' }] }],
  },
  {
    id: 'booking-targets', pillar: 'convert', gap: 'Adding a booking contact needs the city id, and recording its reply needs the booking-target id. No console read carries either: the funnel keys cities by slug, and gig-plan letters and confirmed candidates do not return the target they wrote to.', title: 'Venues, promoters and festivals',
    purpose: 'Who the band asks for shows: add one, file their reply, link venues, add festival editions.',
    actions: [
      {
        label: 'Add or update', method: 'POST', path: 'autopilot/booking-targets',
        fields: [
          { name: 'city_id', label: 'City', kind: 'uuid', required: true },
          { name: 'target_kind', label: 'Kind', kind: 'select', required: true, options: ['venue', 'promoter', 'festival'] },
          { name: 'display_name', label: 'Name', kind: 'text', required: true },
          { name: 'contact_email', label: 'Email', kind: 'text', required: true },
          { name: 'capacity', label: 'Capacity', kind: 'number' },
          { name: 'priority', label: 'Priority', kind: 'number', required: true, initial: 50 },
          { name: 'relationship_score', label: 'Relationship', kind: 'number', required: true, initial: 0 },
          { name: 'active', label: 'Active', kind: 'bool', initial: true },
          { name: 'accepts_booking', label: 'Accepts booking', kind: 'bool', initial: true },
          EXPECTED_VERSION,
        ],
      },
      {
        label: 'Record a reply', method: 'POST', path: 'autopilot/booking-targets/{target_id}/reply', paramSources: { target_id: 'text' },
        fields: [
          { name: 'disposition', label: 'Answer', kind: 'select', required: true, options: ['none', 'received', 'positive', 'declined', 'booked', 'do_not_contact'] },
          { name: 'reply_text', label: 'What they said', kind: 'textarea' },
          { name: 'occurred_at', label: 'When', kind: 'datetime', required: true },
        ],
      },
      {
        label: 'Festival edition', method: 'POST', path: 'autopilot/booking-targets/{target_id}/editions', paramSources: { target_id: 'text' },
        fields: [
          { name: 'edition_label', label: 'Edition', kind: 'text', required: true },
          { name: 'starts_at', label: 'Starts', kind: 'datetime' },
          { name: 'application_opens_at', label: 'Applications open', kind: 'datetime' },
          { name: 'application_closes_at', label: 'Applications close', kind: 'datetime' },
          { name: 'lineup_url', label: 'Line-up URL', kind: 'text' },
        ],
      },
      { label: 'Link venue', method: 'POST', path: 'autopilot/booking-targets/{target_id}/venues/{venue_id}', paramSources: { target_id: 'text', venue_id: 'text' } },
      { label: 'Unlink venue', method: 'DELETE', path: 'autopilot/booking-targets/{target_id}/venues/{venue_id}', paramSources: { target_id: 'text', venue_id: 'text' } },
    ],
  },
  {
    id: 'booking-policy', pillar: 'convert', home: { path: '/health/policies', section: 'Bounds it moves within' }, title: "The manager's booking policy",
    purpose: 'The rules the brain books under — fees, distances, how many asks.',
    read: { path: 'autopilot/manager-config/booking-policy' },
    actions: [{
      label: 'Set policy', method: 'POST', path: 'autopilot/manager-config/booking-policy',
      fields: [
        { name: 'policy', label: 'Policy', kind: 'json', required: true, hint: 'the object the read returns under `policy`' },
        { name: 'source', label: 'Source', kind: 'text', required: true },
        { name: 'source_revision', label: 'Source revision', kind: 'text' },
        EXPECTED_VERSION,
      ],
    }],
  },
  {
    id: 'team-opportunities', pillar: 'convert', home: { path: '/shows/booking', section: 'Found and Approached' }, title: 'Opportunities the team found',
    purpose: 'File an opening someone spotted — a slot, a grant, a showcase — and move it along as it progresses.',
    actions: [
      {
        label: 'I found one', method: 'POST', path: 'autopilot/team-opportunities/discover',
        fields: [
          { name: 'source', label: 'Source', kind: 'text', required: true },
          { name: 'external_key', label: 'Key', kind: 'text', required: true, hint: 'anything stable — the URL works' },
          { name: 'title', label: 'Title', kind: 'text', required: true },
          { name: 'destination_url', label: 'URL', kind: 'text', required: true },
          { name: 'summary', label: 'Summary', kind: 'textarea', required: true },
        ],
      },
      {
        label: 'Progress', method: 'POST', path: 'autopilot/team-opportunities/{opportunity_id}/progress', paramSources: { opportunity_id: 'text' },
        fields: [
          { name: 'progress', label: 'Stage', kind: 'select', required: true, options: ['package_ready', 'submitted', 'replied', 'won', 'lost', 'dismissed'] },
          { name: 'occurred_at', label: 'When', kind: 'datetime', required: true },
          { name: 'reason', label: 'Reason (required for lost and dismissed)', kind: 'text' },
        ],
      },
    ],
  },

  // ── Operate ────────────────────────────────────────────────────────
  {
    id: 'action-draft', pillar: 'operate', home: { path: '/attention', section: 'Needs you now' }, title: 'Fix a draft before approving',
    purpose: "Save the corrected words of a waiting draft without approving it — the way to fix one pitch in an outreach wave, which is approved as a batch.",
    actions: [
      { label: 'Save edits', method: 'POST', path: 'autopilot/actions/{action_id}/revise', paramSources: { action_id: 'text' }, fields: [{ name: 'revision', label: 'Fields to their corrected text', kind: 'json', required: true }] },
    ],
  },
  { id: 'content-hooks', pillar: 'operate', home: { path: '/content', section: 'What held attention' }, title: 'What held attention', purpose: "The band's own posts from the last 60 days, judged against its own median watch time and saves/shares — which openings held attention and which lost people.", read: { path: 'content/hooks' } },
  { id: 'goal', pillar: 'operate', home: { path: '/intelligence/standing', section: 'Goal scoreboard' }, title: 'Goal scoreboard', purpose: 'Planned vs actual for the live objective, learning progress, approval latency, lanes that produced no fans, and the Reddit account standing.', read: { path: 'ops/goal' } },
  {
    id: 'community-replies', pillar: 'operate', home: { path: '/audience/communities', section: 'Replies waiting' }, title: 'Replies waiting',
    purpose: 'Drafted answers to people who commented on the band\'s posts — send as written or edited, or skip.',
    read: { path: 'community-replies' },
    actions: [
      { label: 'Send reply', method: 'POST', path: 'community-replies/{reply_id}/approve', paramSources: { reply_id: 'text' }, fields: [{ name: 'text', label: 'Reply as sent', kind: 'textarea' }] },
      { label: 'Skip reply', method: 'POST', path: 'community-replies/{reply_id}/skip', paramSources: { reply_id: 'text' } },
    ],
  },
  {
    id: 'cycles', pillar: 'operate', home: { path: '/intelligence/standing', section: 'Recent cycles' }, title: "The brain's last cycles",
    purpose: 'Each autopilot cycle, newest first — and which ones ran degraded.',
    read: { path: 'ops/cycles', query: [{ name: 'state', label: 'Outcome', kind: 'text', hint: 'e.g. degraded' }, { name: 'limit', label: 'Limit', kind: 'number' }] },
  },
  { id: 'action-states', pillar: 'operate', servedBy: 'the brain read model (/tenants/{slug}/brain), which the process map and Intelligence draw', home: { path: '/intelligence/standing', section: 'Where actions wait' }, title: 'Where actions wait', purpose: 'Count and oldest per in-flight action state.', read: { path: 'ops/action-states' } },
  { id: 'ecosystem', pillar: 'operate', home: { path: '/health', section: 'The apps agree' }, title: 'Ecosystem health', purpose: 'The cross-app operating picture: flags, reconciliation, open findings.', read: { path: 'ecosystem/overview' } },
  { id: 'findings', pillar: 'operate', home: { path: '/health', section: 'The apps agree' }, title: 'Reconciliation findings', purpose: 'Where the apps disagree about the same fact.', read: { path: 'ecosystem/findings', query: [{ name: 'open_only', label: 'Open only', kind: 'select', options: ['true', 'false'] }, { name: 'limit', label: 'Limit', kind: 'number' }] } },
  { id: 'reach', pillar: 'operate', home: { path: '/intelligence/brief', section: 'Who it reached' }, title: 'Reach, last 30 days', purpose: 'What every channel measurably reached.', read: { path: 'autopilot/reach-metrics' } },
  {
    id: 'approvals', pillar: 'operate', home: { path: '/attention', section: 'Needs you now' }, title: 'Approve and assign actions',
    purpose: 'Approve several parked actions at once, or hand one to a team member.',
    actions: [
      { label: 'Approve several', method: 'POST', path: 'autopilot/actions/approve', confirm: 'Approved actions run — some reach real people.', fields: [{ name: 'action_ids', label: 'Action ids', kind: 'lines', lines: 'strings', required: true, hint: 'one id per line' }] },
      { label: 'Assign', method: 'POST', path: 'autopilot/actions/{action_id}/assign', paramSources: { action_id: 'text' }, fields: [{ name: 'member_key', label: 'Team member key', kind: 'text', required: true }] },
    ],
  },
]

function STAGES(): readonly string[] {
  return ['discovered', 'researched', 'contacted', 'replied', 'negotiating', 'partnered', 'declined', 'dormant']
}


// Capabilities that already have a designed home. `where` is the page (and
// tab) a person opens to use them.
export const PAGE_CAPABILITIES: PageCapability[] = [
  // Aggregate
  { pillar: 'aggregate', title: 'Fanbase connections', purpose: 'Connect Reddit, Meta, Spotify, Bandcamp, YouTube, Discord, Telegram and the rest, and pull their fans in.', where: '/audience/sources' },
  { pillar: 'aggregate', title: 'Fans', purpose: 'The fan table, one fan’s journey, tags.', where: '/audience' },
  { pillar: 'aggregate', title: 'Segments', purpose: 'Who is in each audience segment.', where: '/audience' },
  { pillar: 'aggregate', title: 'Contacts from Drive and Gmail', purpose: 'Scanned or uploaded contacts, promoted to fans or amplifiers in bulk.', where: '/audience/contacts' },
  { pillar: 'aggregate', title: 'Amplifiers', purpose: 'People who carry a release or a show to an audience the band does not own: roster, invites, replies.', where: '/audience/contacts' },
  { pillar: 'aggregate', title: 'Communities', purpose: 'Where fans already gather, their membership and a drafted intro.', where: '/audience/communities' },
  { pillar: 'aggregate', title: 'Fan sources', purpose: 'Which source brought which fans.', where: '/audience' },
  { pillar: 'aggregate', title: 'Places', purpose: 'Cities, rooms and online places — fans, venues and gigs per place.', where: '/places' },
  { pillar: 'aggregate', title: 'AREA', purpose: 'Location drops fans unlock in a city.', where: '/places/area' },
  // Grow
  { pillar: 'grow', title: 'Content queue', purpose: 'Drafts the brain wrote, waiting for a yes; what went out and how it did.', where: '/content' },
  { pillar: 'grow', title: 'Content material', purpose: 'The sources the brain drafts from.', where: '/content/material' },
  { pillar: 'grow', title: 'Runs in flight', purpose: 'Every relay from observed to proof, with its manual legs.', where: '/in-motion' },
  { pillar: 'grow', title: 'Release campaigns', purpose: 'Amplifier campaigns around a release: create, launch, close.', where: '/operations' },
  { pillar: 'grow', title: 'Press room', purpose: 'Press requests and assets.', where: '/operations' },
  { pillar: 'grow', title: 'Outreach and booking candidates', purpose: 'What the discovery sweeps found, confirmed one by one.', where: '/operations' },
  { pillar: 'grow', title: 'Booking agents', purpose: 'Screened agents and the season letter.', where: '/operations' },
  { pillar: 'grow', title: 'Growth objectives and posture', purpose: 'What the brain is aiming at and how hard it pushes.', where: '/intelligence' },
  { pillar: 'grow', title: 'Portfolio', purpose: 'The roster, amplification asks to accept or decline.', where: '/audience/portfolio' },
  // Convert
  { pillar: 'convert', title: 'Shows', purpose: 'Every night: create by hand, the bill, the counterparty, the growth ladder.', where: '/shows' },
  { pillar: 'convert', title: 'Door scan and T+7 report', purpose: 'Who came, and the report sent to the promoter.', where: '/shows' },
  { pillar: 'convert', title: 'Shared nights', purpose: 'A night organised with other acts: contributions and the organiser link.', where: '/shows' },
  { pillar: 'convert', title: 'Gig plan', purpose: 'Proposed cities and why; approving queues the outreach.', where: '/places' },
  { pillar: 'convert', title: 'Negotiations', purpose: 'Live terms and the move parked for approval.', where: '/operations' },
  { pillar: 'convert', title: 'Proof', purpose: 'The listing, signed attestation cards, representation contacts.', where: '/proof' },
  // Operate
  { pillar: 'operate', title: 'Today', purpose: 'What needs a person today.', where: '/operations' },
  { pillar: 'operate', title: 'Needs you', purpose: 'Parked approvals, alerts, findings, the brain’s self-assessment.', where: '/attention' },
  { pillar: 'operate', title: 'Intelligence', purpose: 'Decisions, evidence, learning loop, scorecard, measurement, cycle preview and run.', where: '/intelligence' },
  { pillar: 'operate', title: 'Health and delivery', purpose: 'Outbox, deliveries, dead letters, retries, request timelines and traces.', where: '/health' },
  { pillar: 'operate', title: 'Agents', purpose: 'Model providers, credentials, schedules, usage.', where: '/integrations' },
  { pillar: 'operate', title: 'Automation', purpose: 'n8n events and workflow settings.', where: '/automation' },
  { pillar: 'operate', title: 'Settings', purpose: 'Profile, workspace settings, secrets, operators, destinations, deployment.', where: '/settings' },
]

/** A capability's write by label — for the panels that host it. Throws on a
 *  miss so a renamed action fails the build's first render, not a click. */
export function capabilityAction(id: string, label: string): CapabilityAction {
  const action = capability(id).actions?.find(candidate => candidate.label === label)
  if (!action) throw new Error(`capability ${id} has no action "${label}"`)
  return action
}

export function capability(id: string): Capability {
  const found = SURFACE_CAPABILITIES.find(candidate => candidate.id === id)
  if (!found) throw new Error(`unknown capability ${id}`)
  return found
}
