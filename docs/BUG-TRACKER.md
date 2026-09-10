# Bug Tracker

## Active

### BUG-004: CrowdRelay API OOM-killed by 128m memory limit — 502/504 storms
- **Status:** Fixed (2026-09-10)
- **Severity:** High — API unreachable intermittently, control plane shows
  "The tenant could not be reached" for all tenant-scoped panels
- **Root cause:** `CROWDRELAY_API_MEMORY=128m` was set in
  `/opt/crowdrelay/deploy/.env.production`. The API process uses ~130 MB RSS
  at steady state. Every time it spiked slightly above 128 MiB, the kernel
  OOM-killer killed it (`Memory cgroup out of memory: Killed process
  (crowdrelay-api)`), Docker restarted it (21 restarts observed), and the
  control plane got 502/504 during each ~30s restart window. This surfaced
  in the UI as "Growth objectives unavailable: The tenant could not be
  reached — check the runtime and its tunnel."
- **Trigger:** The compose default is 256m and the example file says 256m,
  but the value was manually lowered to 128m on the server at some point.
  Nothing in the deploy pipeline validated the floor.
- **Fix:**
  1. Increased `CROWDRELAY_API_MEMORY` from `128m` to `256m` in
     `/opt/crowdrelay/deploy/.env.production`.
  2. Redeployed via `crowdrelayctl deploy`.
  3. Added `check_api_memory_floor` to `crowdrelayctl doctor` — it now hard
     fails if `CROWDRELAY_API_MEMORY` is below 256m. Since `doctor` runs
     before every `deploy`, this can never silently ship again.
- **Prevention:** The doctor check is a hard gate. Any future attempt to
  set the API memory below 256m will block the deploy with an explicit
  error message explaining why and what to set it to.

### BUG-001: Edge Caddyfile missing blue-green upstream pair blocks deploys
- **Status:** Fixed (2026-09-10)
- **Severity:** High — blocks all Control Plane deploys
- **Root cause:** The edge Caddyfile at `/opt/crowdrelay/ops/edge/Caddyfile`
  had only one upstream (`crowdrelay-control-plane-app-1:8090`) instead of the
  required blue-green pair. The deploy preflight check at
  `scripts/deploy-bluegreen.sh:123-125` failed hard with no recovery path.
- **Trigger:** Out-of-band edit or cold start that wrote only the running
  color's upstream. The old comment in the Caddyfile said "green upstream must
  be absent when only blue is running" — that was the wrong mental model. The
  deploy script always requires both upstreams; Caddy's `health_uri` +
  `lb_policy first` handles the inactive color.
- **Fix:**
  1. Repaired the live Caddyfile to include both upstreams.
  2. Made `deploy-bluegreen.sh` self-healing: if only one upstream is present,
     the script adds the missing one based on the `# CONTROL_PLANE_ACTIVE=`
     marker instead of failing. See the `EDGE_UPSTREAM=HEALED` log line.
  3. Updated the stale Caddyfile comment that said green must be absent.
  4. Added `scripts/test_deploy_bluegreen_preflight.py` to the gate suite.
- **Prevention:** The self-healing logic means a single-upstream Caddyfile
  can never block a deploy again. The test validates the repair logic in CI.

### BUG-002: Edge Caddy inode detachment after out-of-band edits
- **Status:** Mitigated (already handled in deploy-bluegreen.sh)
- **Severity:** Medium — causes temporary edge drift
- **Root cause:** The edge Caddyfile is a single-file bind mount. Docker
  resolves the inode once at container start. Any edit that replaces the file
  (sed -i, git checkout, cp, editors using temp+rename) creates a new inode,
  leaving the container pinned to the old content.
- **Mitigation:** `deploy-bluegreen.sh` detects inode mismatch and restarts
  the edge container to re-attach. The cutover step writes with
  `cat candidate > file` (truncate in place, preserves inode).
- **Remaining risk:** Out-of-band edits between deploys cause temporary drift.
  Always run `docker restart virya-edge-caddy` after manually editing the
  Caddyfile, or let the next deploy handle it automatically.

### BUG-003: Facebook page access token rotation
- **Status:** Fixed (2026-09-10)
- **Severity:** Medium — Facebook publishing non-functional with expired token
- **Root cause:** Token needed rotation. Previous token was replaced in both
  `/opt/crowdrelay/.env` and `/opt/crowdrelay/deploy/.env.production`.
  Both `crowdrelay-api-green-1` and `crowdrelay-worker-green-1` were
  force-recreated (not just restarted — Docker Compose `restart` reuses the
  original env config) to pick up the new token.
- **Note:** The user must still grant `pages_manage_posts` permission to the
  Facebook system user/Page for publishing to work end-to-end.

## Resolved

(none yet)
