-- The tenant heartbeat now carries the approval-queue depth.
--
-- `viryaos_autopilot_actions` parked on `awaiting_approval` are work the
-- brain finished and a human has not decided. Production carried eleven of
-- them for days because the only surfaces that showed them were a browser
-- page nobody had open and an n8n poller that failed on every run. The
-- heartbeat already reports outbox depth and queue lag on the same push; the
-- approval depth joins it so the Control Plane can raise `approvals.pending`
-- through the notifier path the moment the queue grows — without a browser
-- session and without a second poller to break.
--
-- Nullable, like every runtime column: a CrowdRelay that predates the gauge
-- reports nothing, and nothing is a different fact from zero.
ALTER TABLE control_plane_runtime_status
    ADD COLUMN IF NOT EXISTS awaiting_approval bigint;
