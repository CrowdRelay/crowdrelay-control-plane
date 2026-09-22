-- The tenant crew roster is tenant configuration, not deploy env.
--
-- Crew size used to be a source-level assumption: five VIRYA_TEAM_MEMBER_N_EMAIL
-- slots baked into the CrowdRelay config parser, all five required before
-- production Autopilot would boot. The onboarding wizard now collects however
-- many members the tenant actually has, and this column carries the roster so
-- every redeploy plan re-renders it — the alternative (plan-only, like
-- provider keys) would strand the roster on the first redeploy, because
-- `deployment_plan` is rebuilt from the tenant row.
--
-- Shape: [{"key":"ops_lead","name":"Ada","email":"ada@x.test","skills":["booking"]}]
-- `key` is the stable routing identity CrowdRelay writes to
-- viryaos_team_profiles.member_key (^[a-z0-9_-]{2,48}$); `skills` draw from the
-- domain TeamSkill vocabulary. Validation lives in the API and the
-- provisioner; the column stays JSONB because the roster is written and read
-- whole, never filtered per-member.
ALTER TABLE control_plane_tenants
    ADD COLUMN team_members JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(team_members) = 'array');
