import { useNavigate, useParams } from '@tanstack/solid-router'
import { authState } from '../lib/auth'
import { ContentSourcesPanel } from '../components/ContentSourcesPanel'
import { PageShell, PageHeader, TabBar } from '../components/layout'
import { CONTENT_TABS } from '../lib/nav'

/// Everything the system may say publicly comes from this list — videos the
/// watcher picked up, releases, events, and the stories the band writes
/// itself. Kept on its own page so the pipeline view paints without waiting
/// for this heavier list.
export function TenantContentMaterialPage() {
  const params = useParams({ from: '/tenants/$slug/content/material' })
  const navigate = useNavigate()

  return <PageShell>
    <PageHeader
      eyebrow={authState.isPlatformLevel() ? 'CONTENT' : undefined}
      title="Real material"
      description="Everything the system may say publicly comes from this list — nothing else. Add stories and links yourself; videos and releases land here on their own."
    />

    <TabBar
      tabs={CONTENT_TABS}
      active="material"
      onChange={(id) => {
        if (id === 'pipeline') void navigate({ to: '/tenants/$slug/content', params: { slug: params().slug } })
      }}
    />

    <ContentSourcesPanel slug={params().slug} />
  </PageShell>
}
