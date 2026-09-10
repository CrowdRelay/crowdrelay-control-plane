-- Point the CrowdRelay API health probe at the blue/green alias.
--
-- 0016 seeded `http://crowdrelay-api-1:8080/v1/health/ready`. That is a
-- concrete container name, and the CrowdRelay API runs blue/green deploys —
-- the active container is `crowdrelay-api-1` or `crowdrelay-api-green-1`
-- depending on which colour won the last swap. After a swap to green the
-- seeded name resolves to nothing, the probe fails forever, and the overview
-- reports the CrowdRelay API as down while it is serving fans normally.
--
-- `crowdrelay-api-active` is the alias both colours declare on the
-- `crowdrelay-shared` network for exactly this reason (see the aliases list in
-- crowdrelay's docker-compose.yml, and the assertions the deploy scripts make
-- about CONTROL_PLANE_VIRYA_CROWDRELAY_URL and _MANAGEMENT_URL). The health
-- probe is the last place still naming a colour.
--
-- Only rewrite the value 0016 seeded. An operator who has pointed this row at
-- a public URL — the documented arrangement when the two services are not
-- co-located on one host — keeps their setting.
UPDATE control_plane_platform_health
SET url = 'http://crowdrelay-api-active:8080/v1/health/ready'
WHERE service = 'crowdrelay-api'
  AND url IN (
      'http://crowdrelay-api-1:8080/v1/health/ready',
      'http://crowdrelay-api-green-1:8080/v1/health/ready',
      'http://crowdrelay-api-blue-1:8080/v1/health/ready'
  );
