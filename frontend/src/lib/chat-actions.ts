import { request } from './api'
import { authState } from './auth'
import { resolveNavigatePath } from './chat-stream'
import type { ChatAction } from './types'

export type ChatActionResult = {
  /** A confirmation message appended to the conversation, when the action produced one. */
  reply?: string
  /** The panel should close — the action navigated the operator somewhere. */
  closePanel?: boolean
  /** A non-throwing failure — e.g. an action type nobody implemented. */
  error?: string
}

/**
 * Executes an action the assistant attached to its reply. Model output is
 * untrusted input: `navigate`/`paste_api_key` go through
 * `resolveNavigatePath`/`navigate` only after slug substitution, and every
 * write goes through `request` which enforces the read-only guard.
 */
export async function runChatAction(
  action: ChatAction,
  slug: string,
  navigate: (to: string) => void,
): Promise<ChatActionResult> {
  const tenant = encodeURIComponent(slug)
  switch (action.type) {
    case 'navigate': {
      const path = resolveNavigatePath(action.params.path, slug)
      if (path) navigate(path)
      return { closePanel: true }
    }
    case 'run_task': {
      await request(`/tenants/${tenant}/agents/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          template_id: action.params.template_id,
          model_id: action.params.model_id ?? 'laguna-s-2.1-free',
          prompt: action.params.prompt,
        }),
      })
      return { reply: authState.isPlatformLevel() ? `Task started! You can check the result on the [Tasks and schedules page](/tenants/${slug}/integrations/tasks).` : 'Task started — the result shows up in what it produces.' }
    }
    case 'create_schedule': {
      await request(`/tenants/${tenant}/agents/schedules`, {
        method: 'POST',
        body: JSON.stringify({
          template_id: action.params.template_id,
          model_id: action.params.model_id ?? 'laguna-s-2.1-free',
          prompt: action.params.prompt,
          interval_minutes: action.params.interval_minutes ?? 1440,
        }),
      })
      return { reply: 'Schedule created! It will run automatically on the configured interval.' }
    }
    case 'toggle_autopilot': {
      await request(`/tenants/${tenant}/operations/autopilot/bulk`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ enabled: action.params.enabled }),
      })
      return { reply: authState.isPlatformLevel() ? `Autopilot ${action.params.enabled ? 'enabled' : 'disabled'} for all contexts.` : `Automated work ${action.params.enabled ? 'resumed' : 'paused'} everywhere.` }
    }
    case 'paste_api_key': {
      navigate(`/tenants/${slug}/integrations/providers`)
      return { closePanel: true }
    }
    case 'create_notifier': {
      await request(`/tenants/${tenant}/notifiers`, {
        method: 'POST',
        body: JSON.stringify({
          kind: action.params.kind ?? 'discord',
          label: action.params.label ?? 'AI-created notifier',
          events: ['delivery.failed', 'outbox.dead'],
          enabled: true,
        }),
      })
      return { reply: 'Notifier channel created! You can configure it on the Notifiers page.' }
    }
    case 'create_fanbase': {
      await request(`/tenants/${tenant}/portfolio/fanbases`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          name: action.params.name ?? 'New fanbase',
          sourceKind: action.params.sourceKind ?? 'manual_import',
        }),
      })
      return { reply: authState.isPlatformLevel() ? 'Fanbase created! You can add fans to it on the Portfolio page.' : `Fanbase created! You can add fans to it on the [Audience page](/tenants/${slug}/audience) under Sources.` }
    }
    case 'enable_area': {
      await request(`/tenants/${tenant}/area/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: action.params.enabled ?? true }),
      })
      return { reply: `AREA ${action.params.enabled ? 'enabled' : 'disabled'}.` }
    }
    case 'deploy_tenant': {
      await request(`/tenants/${tenant}/provisioning/deploy`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return { reply: 'Deploy requested — accepted by GitHub. Watch the Actions tab for completion.' }
    }
    case 'retry_dead_deliveries': {
      await request(`/tenants/${tenant}/operations/dead-deliveries/clear`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: '{}',
      })
      return { reply: 'Dead deliveries replayed' }
    }
    case 'run_reconciliation': {
      await request(`/tenants/${tenant}/operations/reconcile`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: '{}',
      })
      return { reply: 'Reconciliation started' }
    }
    default:
      return { error: 'Unknown action type' }
  }
}
