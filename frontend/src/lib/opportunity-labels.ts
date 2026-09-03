// Human-readable labels for the machine enums the backend sends on the
// opportunity board / brain decision surfaces. Falls back to title-cased
// snake_case for unknown values so a new context/kind is never raw enum soup.

export const CONTEXT_LABELS: Record<string, string> = {
  ticket_yield: 'Ticket Yield',
  fan_lifecycle: 'Fan Lifecycle',
  campaign_lifecycle: 'Campaign Lifecycle',
  merchandising: 'Merchandising',
  merch_pricing: 'Merch Pricing',
  merch_bundle: 'Merch Bundle',
  booking_opportunity: 'Booking',
  outreach: 'Outreach',
  content_supply: 'Content Supply',
  promotion_budget: 'Promotion Budget',
  experimentation: 'Experimentation',
  show_operations: 'Show Operations',
  release: 'Release',
  live_opportunity: 'Live Opportunity',
  funding: 'Funding',
  beacon: 'Beacon',
  show_growth: 'Show Growth',
  growth_metrics: 'Growth Metrics',
  growth_debt: 'Growth Debt',
  outreach_supply: 'Outreach Supply',
  growth_intelligence: 'Growth Intelligence',
  plays: 'Plays',
}

export const DECISION_KIND_LABELS: Record<string, string> = {
  'ticket.price.change': 'Change Ticket Price',
  'ticket.capacity.change': 'Change Ticket Capacity',
  'fan.lifecycle.message.request': 'Send Fan Message',
  'merch.reorder.request': 'Reorder Merch',
  'merch.price.change': 'Change Merch Price',
  'booking.outreach.request': 'Booking Outreach',
  'audience.campaign.request': 'Audience Campaign',
  'merch.bundle.request': 'Create Merch Bundle',
  'outreach.request': 'Outreach Request',
  'beacon.discovery.request': 'Discover Beacons',
  'booking.target_discovery.request': 'Discover Booking Targets',
  'beacon.invite_batch.request': 'Request Beacon Invites',
  'outreach.discovery.request': 'Discover Outreach Targets',
  'beacon.outreach.request': 'Beacon Outreach',
  'show.growth.request': 'Show Growth Action',
  'content.artifact.request': 'Content Artifact',
  'experiment.allocation.change': 'Adjust Experiment',
  'experiment.complete': 'Complete Experiment',
  'show.task.complete': 'Complete Show Task',
  'show.task.escalate': 'Escalate Show Task',
  'promotion.budget_change.request': 'Change Promotion Budget',
  'release.milestone.execute': 'Execute Release Milestone',
  'opportunity.live.apply': 'Apply Live Opportunity',
  'playlist.placement.verify': 'Verify Playlist Placement',
  'release.editorial_pitch.escalate': 'Escalate Editorial Pitch',
  'opportunity.terms.counter': 'Counter Live Opportunity Terms',
  'opportunity.terms.accept': 'Accept Live Opportunity Terms',
  'funding.package.prepare': 'Prepare Funding Package',
  'funding.application.submit': 'Submit Funding Application',
  'growth.opportunity.raise': 'Growth Opportunity Detected',
  'growth.debt.raise': 'Growth Debt Raised',
  'referral.code.issue': 'Issue Referral Code',
  'play.step.run': 'Run Play Step',
  'team.assignment.email': 'Team Assignment Email',
  'agent.content.request': 'Agent Content Request',
  'agent.run.request': 'Agent Run',
  'community.engage.request': 'Community Engagement',
  'signal.push.request': 'Signal Push',
}

export const SUBJECT_KIND_LABELS: Record<string, string> = {
  ticket_type: 'Ticket Type',
  fan: 'Fan',
  merch_variant: 'Merch Variant',
  merch_product: 'Merch Product',
  city: 'City',
  event: 'Event',
  outreach_opportunity: 'Outreach Opportunity',
  content_source: 'Content Source',
  experiment: 'Experiment',
  promotion_campaign: 'Promotion Campaign',
  release_plan: 'Release Plan',
  team_opportunity: 'Team Opportunity',
  beacon: 'Beacon',
  growth_metric_series: 'Growth Metric',
  booking_target: 'Booking Target',
  outreach_target: 'Outreach Target',
  target_community: 'Community',
  workspace: 'Workspace',
}

export const RANK_FACTOR_LABELS: Record<string, string> = {
  authority: 'authority state',
  deadline: 'deadline proximity',
  value_tier: 'value tier',
  measured_effect: 'measured effect',
  confidence: 'confidence',
  magnitude: 'deviation magnitude',
  tie: 'stable tie-break',
}

export const VALUE_TIER_LABELS: Record<string, string> = {
  vanity: 'vanity',
  intermediate: 'intermediate',
  downstream: 'downstream',
}

const humanize = (value: string) =>
  value.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')

export const labelOr = (map: Record<string, string>, value: string) =>
  map[value] ?? humanize(value)

export const opportunityTitle = (entry: {
  briefing: { summary?: string } | null
  decision_kind: string
  recommended_action: string
}): string => {
  if (entry.briefing?.summary) return entry.briefing.summary
  const labeled = DECISION_KIND_LABELS[entry.decision_kind]
  if (labeled) return labeled
  if (entry.recommended_action) return humanize(entry.recommended_action)
  return humanize(entry.decision_kind)
}
