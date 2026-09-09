import { createSignal } from 'solid-js'
import { api } from './api'
import { errorMessage } from './format'
import { toast } from './toast'

// Shared mutation + confirmation logic for the Operations and Runtime
// Switches panels. Both panels had identical copies of the mutate helper,
// redeploy, replayDead, and the inline confirmation card wiring — each
// with slightly different toast messages and refresh targets.

export type ConfirmAction = 'redeploy' | 'replay-dead' | 'autopilot-disable' | 'autopilot-enable'

export type ConfirmCopy = { title: string; body: string; action: string }

export function useOperationsMutations(slug: string, refresh: () => Promise<unknown>) {
  const [pendingMutation, setPendingMutation] = createSignal<string | null>(null)
  const [mutationError, setMutationError] = createSignal<string | null>(null)

  const mutate = async (key: string, operation: () => Promise<unknown>, onRefresh?: () => Promise<unknown>) => {
    setMutationError(null)
    setPendingMutation(key)
    try {
      await operation()
      await (onRefresh ?? refresh)()
    } catch (error) {
      setMutationError(errorMessage(error, 'Tenant operation failed'))
    } finally {
      setPendingMutation(null)
    }
  }

  const redeploy = () =>
    mutate('redeploy', async () => {
      await api.deployTenant(slug)
      toast.success('Deploy requested — accepted by GitHub. Watch the Actions tab for completion.')
    })

  const replayDead = () =>
    mutate('replay-dead', () => api.clearDeadDeliveries(slug))

  const bulkAutopilot = (enabled: boolean) =>
    mutate('autopilot-bulk', () => api.autopilotBulk(slug, enabled))

  const confirmCopy = (
    confirming: ConfirmAction | null,
    deadJobs: number,
  ): ConfirmCopy | null => {
    switch (confirming) {
      case 'autopilot-disable': return {
        title: 'Disable all Autopilot policies?',
        body: 'Every context stops acting immediately — full killswitch. Queued actions stay parked until you re-enable.',
        action: 'Disable everything',
      }
      case 'autopilot-enable': return {
        title: 'Enable all Autopilot policies?',
        body: 'Every context resumes at its saved autonomy level, confidence threshold and daily cap.',
        action: 'Enable everything',
      }
      case 'redeploy': return {
        title: 'Redeploy this app now?',
        body: 'Triggers a fresh production deploy. The current stack keeps serving until the blue-green switchover completes.',
        action: 'Queue redeploy',
      }
      case 'replay-dead': return {
        title: 'Replay dead deliveries?',
        body: `Asks CrowdRelay to redeliver ${deadJobs} dead queue item(s). Failed items land back in the dead queue if the root cause persists.`,
        action: 'Replay dead items',
      }
      default: return null
    }
  }

  return {
    pendingMutation,
    mutationError,
    setMutationError,
    mutate,
    redeploy,
    replayDead,
    bulkAutopilot,
    confirmCopy,
  }
}
