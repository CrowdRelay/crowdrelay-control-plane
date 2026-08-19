# Control Plane DR and Upgrade Waves

## Restore proof

1. Take and timestamp the database/config backup before any control-plane wave.
2. Restore that backup into an isolated target and run read-only integrity checks before calling it usable.
3. Record the CrowdRelay schema, OpenAPI SHA and exact image/source revisions in the release receipt.

## Upgrade wave

1. Deploy a compatibility-safe canary first; migrations must remain backward compatible with the currently running API/worker.
2. Verify health, provisioning read paths and exact image revision before expanding the wave.
3. Upgrade API/control-plane before any client that requires a new capability; workers are rolled separately so queue behavior is observable.
4. Expand only after error rate, DB saturation and queue/outbox age remain within their existing baselines.

## Rollback

- Stop the expanding wave, restore the previous image refs, and do not down-migrate data destructively.
- If a data restore is required, isolate writes first and restore from the already-proven backup.
- Re-run schema/OpenAPI compatibility and provisioning static gates before reopening writes.
