import { useParams } from '@tanstack/solid-router'
import { BeaconConsolePanel } from '../components/BeaconConsolePanel'
import { BeaconSignalPanel } from '../components/BeaconSignalPanel'
import { TabBar, TabPanel, useTabPanels } from '../components/TabBar'

/// Beacons are an audience surface, not an operations one.
///
/// They lived as a tab under Operations, next to outreach and releases — the
/// things you *do*. But a beacon is a person in a city who carries a release to
/// an audience the band does not own, which makes the roster a question about
/// who the audience is, alongside Audience and Intelligence.
///
/// The console is the roster and every action on it. The Signal panel is the
/// same population seen as a funnel: it answers "how is the invite pipeline
/// converting", which a roster cannot.
///
/// Page tabs separate the two views so the operator works the roster without
/// scrolling past the funnel tables, and checks the funnel without scrolling
/// past the roster.
export function BeaconsPage() {
  const params = useParams({ from: '/tenants/$slug/beacons' })
  const { activeTab, switchTab, isVisited } = useTabPanels('roster')

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">AUDIENCE</span>
        <h1>Beacons</h1>
        <p>
          People who carry a release or a show into a city the band has no audience in —
          venues, promoters, shops, radio. Invite them to Signal, record what they say,
          and pause the ones who go quiet.
        </p>
      </div>
    </div>
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      tabs={[
        { id: 'roster', label: 'Roster' },
        { id: 'signal', label: 'Signal' },
      ]}
    />
    <TabPanel active={activeTab()} id="roster" visited={isVisited('roster')}>
      <BeaconConsolePanel slug={params().slug} />
    </TabPanel>
    <TabPanel active={activeTab()} id="signal" visited={isVisited('signal')}>
      <BeaconSignalPanel slug={params().slug} />
    </TabPanel>
  </section>
}
