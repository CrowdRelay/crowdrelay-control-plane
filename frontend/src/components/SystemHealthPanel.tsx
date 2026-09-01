import { For, Show, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { StatusBadge } from './StatusBadge'
import type { OperationsSummary } from '../lib/types'

// What is wrong, what it means, and the cheapest thing that fixes it.
//
// The operations panel below shows numbers. Numbers assume you already know
// which ones are bad and what to do about them — so the honest failure mode was
// staring at a dashboard that looked fine while the worker had been dead for
// fifteen minutes, and reaching for a redeploy whenever something did look off.
//
// Every condition here answers three questions in order: what broke, what it
// costs while it stays broken, and the steps to fix it starting with the least
// intrusive one. A redeploy is never step one. Where a safe action exists it is
// a button; where the fix needs a shell, the exact command is shown rather than
// described, so it can be copied by someone who did not build this.

type Severity = 'critical' | 'warning'

type Condition = {
  id: string
  severity: Severity
  headline: string
  impact: string
  /// Ordered cheapest-first. The operator should try these in sequence.
  steps: string[]
  /// A safe, reversible action offered inline. Absent when no such action
  /// exists — an unsafe button is worse than no button.
  action?: { label: string; run: () => Promise<unknown> }
}

/// Reads the operations summary and names what is wrong.
///
/// Deliberately *not* the same thresholds as `deploy/observability/alerts.yml`.
/// Those page on a rate — many failures inside fifteen minutes — because the
/// question there is "is this worth waking someone". This panel is read by
/// someone already looking, so it answers "is anything wrong at all" and
/// reports a single dead letter the alerts would correctly stay quiet about.
/// The severities still agree on what counts as urgent.
function diagnose(summary: OperationsSummary, slug: string): Condition[] {
  const found: Condition[] = []

  // The worker is first because almost everything else is downstream of it.
  // `worker` is optional: an older CrowdRelay does not report it, and absence
  // is not evidence of death, so it is skipped rather than assumed broken.
  if (summary.worker && !summary.worker.alive) {
    found.push({
      id: 'worker-down',
      severity: 'critical',
      headline: 'The growth engine has stopped',
      impact:
        'Nothing is being sent, synced or decided. Fans are unaffected — the app and site keep working — but the band gains none while this lasts.',
      steps: [
        'Run `docker start crowdrelay-worker-green-1` on the server. It is usually still there, just stopped, because a deploy killed it.',
        'Wait a minute and refresh this page.',
        'If it stops again, read `docker logs --tail 50 crowdrelay-worker-green-1` before retrying.',
        'Redeploy only if those logs show the program itself failing to start.',
      ],
    })
  }

  if (summary.outbox.dead > 0) {
    found.push({
      id: 'outbox-dead',
      severity: summary.outbox.dead > 10 ? 'critical' : 'warning',
      headline: `${summary.outbox.dead} message${summary.outbox.dead === 1 ? '' : 's'} gave up`,
      impact:
        'These were meant to leave the system and never did. Everything else keeps flowing; only these are stuck.',
      steps: [
        'Open Deliveries and read one failure. A dead letter is usually a bad address or a rejected payload.',
        'Retry that one. If it succeeds, retry the rest.',
        'If they all fail the same way, fix the cause first — retrying in bulk just reproduces it.',
      ],
    })
  }

  if (summary.deliveries.dead > 0) {
    found.push({
      id: 'deliveries-dead',
      severity: summary.deliveries.dead > 10 ? 'critical' : 'warning',
      headline: `${summary.deliveries.dead} webhook deliver${summary.deliveries.dead === 1 ? 'y' : 'ies'} gave up`,
      impact:
        'A downstream service is not receiving events it expects. It will be out of date until these are replayed.',
      steps: [
        'Check the receiving service is up.',
        'Confirm its signing secret still matches ours — a one-sided rotation looks exactly like this.',
        'Clear the dead deliveries once the cause is fixed, so the retry is not wasted.',
      ],
      action: {
        label: 'Clear dead deliveries',
        run: () => api.clearDeadDeliveries(slug),
      },
    })
  }

  // A queue that is not draining is the same fault as a dead worker, seen from
  // the other end — so it is only worth reporting separately when the worker
  // looks alive.
  const stalledMinutes = Math.round(summary.outbox.oldest_pending_seconds / 60)
  if (summary.outbox.oldest_pending_seconds > 600 && summary.worker?.alive !== false) {
    found.push({
      id: 'outbox-stalled',
      severity: 'warning',
      headline: `Work has been queued for ${stalledMinutes} minutes`,
      impact:
        'The engine is running but not draining its queue. Sends are late rather than lost.',
      steps: [
        'Check the worker is not stuck on one slow item — look at its recent logs.',
        'Restart the worker container. Queued work survives a restart and resumes.',
      ],
    })
  }

  if (summary.push.dead > 0) {
    found.push({
      id: 'push-dead',
      severity: 'warning',
      headline: `${summary.push.dead} push notification${summary.push.dead === 1 ? '' : 's'} failed`,
      impact:
        'Usually phones that uninstalled or revoked notifications. Normal in small numbers and self-correcting.',
      steps: [
        'No action needed unless the number keeps climbing.',
        'If it is climbing, check the push credentials have not expired.',
      ],
    })
  }

  return found
}

export function SystemHealthPanel(props: { slug: string; summary: OperationsSummary | undefined; onChanged: () => void }) {
  const [running, setRunning] = createSignal<string | null>(null)
  const [notice, setNotice] = createSignal<{ tone: 'good' | 'bad'; message: string } | null>(null)

  const conditions = () => (props.summary ? diagnose(props.summary, props.slug) : [])

  const run = async (condition: Condition) => {
    if (!condition.action || running() !== null) return
    setRunning(condition.id)
    setNotice(null)
    try {
      await condition.action.run()
      setNotice({ tone: 'good', message: `${condition.action.label} — done.` })
      props.onChanged()
    } catch (error) {
      setNotice({ tone: 'bad', message: errorMessage(error, `${condition.action.label} failed`) })
    } finally {
      setRunning(null)
    }
  }

  return (
    <section class="panel">
      <header class="panel-header">
        <h2>What needs attention</h2>
      </header>

      <Show when={props.summary} fallback={<p class="muted">Waiting for the operations summary…</p>}>
        <Show
          when={conditions().length > 0}
          fallback={
            <p class="notice good">
              Nothing needs attention. The engine is running and every queue is draining.
            </p>
          }
        >
          <For each={conditions()}>
            {condition => (
              <article class="health-condition">
                <div class="health-condition-head">
                  <StatusBadge
                    status={condition.severity === 'critical' ? 'act now' : 'when convenient'}
                    tone={condition.severity === 'critical' ? 'bad' : 'warn'}
                  />
                  <strong>{condition.headline}</strong>
                </div>
                <p class="muted">{condition.impact}</p>
                <ol class="health-steps">
                  <For each={condition.steps}>{step => <li>{step}</li>}</For>
                </ol>
                <Show when={condition.action}>
                  {action => (
                    <button
                      class="primary"
                      disabled={running() !== null}
                      onClick={() => void run(condition)}
                    >
                      {running() === condition.id ? 'Working…' : action().label}
                    </button>
                  )}
                </Show>
              </article>
            )}
          </For>
        </Show>
      </Show>

      <Show when={notice()}>
        {value => <p class={`notice ${value().tone}`}>{value().message}</p>}
      </Show>
    </section>
  )
}
