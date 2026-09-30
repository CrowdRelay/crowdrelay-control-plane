-- Which subscription start the guarantee was last anchored to.
--
-- `subscription_started` events are delivered at-least-once through the
-- webhook translator, and the re-anchor used to write `now()` fresh on every
-- application — so a replayed event slid the ninety-day deadline forward and
-- re-froze the baseline against whatever the fan graph had drifted to since
-- payment actually started. Recording the start instant the anchor was built
-- from lets the store skip a repeat of the same contract: replay is a no-op,
-- a genuinely new subscription (new start) still re-anchors.
ALTER TABLE control_plane_tenant_guarantee
    ADD COLUMN IF NOT EXISTS anchored_started_at timestamptz;
