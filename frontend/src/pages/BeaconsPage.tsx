import { Suspense } from 'solid-js'
import { useParams } from '@tanstack/solid-router'
import { BeaconConsolePanel } from '../components/BeaconConsolePanel'
import { BeaconSignalPanel } from '../components/BeaconSignalPanel'
import { SkeletonPageHead, SkeletonSection } from '../components/Skeleton'

/// Beacons are an audience surface, not an operations one.
///
/// They lived as a tab under Operations, next to outreach and releases — the
/// things you *do*. But a beacon is a person in a city who carries a release to
/// an audience the band does not own, which makes the roster a question about
/// who the audience is, alongside Fan Intelligence and Growth.
///
/// The console is the roster and every action on it. The Signal panel below is
/// the same population seen as a funnel: it answers "how is the invite pipeline
/// converting", which a roster cannot.
export function BeaconsPage() {
  const params = useParams({ from: '/tenants/$slug/beacons' })

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
    <Suspense fallback={<><SkeletonSection titleWidth="180px" lines={4} minHeight="200px" /><SkeletonSection titleWidth="200px" lines={3} minHeight="160px" /></>}>
      <BeaconConsolePanel slug={params().slug} />
      <BeaconSignalPanel slug={params().slug} />
    </Suspense>
  </section>
}
