-- Public waitlist for the landing page. Applicants submit an email,
-- then optionally answer three qualification questions (role, roster
-- size, fan sources). Each applicant gets a referral code so they can
-- invite other artists; confirmed referrals move the referrer up.
--
-- This table is public-facing (no auth on the write path), so every
-- column is treated as untrusted input. CHECK constraints enforce the
-- allowed enum values server-side; the API validates before insert, but
-- the database is the last line of defence.

CREATE TABLE IF NOT EXISTS control_plane_waitlist (
    id              uuid PRIMARY KEY,
    email           text NOT NULL,
    email_hash      bytea NOT NULL UNIQUE,
    status          text NOT NULL DEFAULT 'pending',
    role            text NULL,
    roster_size     text NULL,
    fan_sources    jsonb NOT NULL DEFAULT '[]'::jsonb,
    newsletter_opt_in boolean NOT NULL DEFAULT false,
    referral_code   text NOT NULL UNIQUE,
    referred_by     uuid NULL REFERENCES control_plane_waitlist(id) ON DELETE SET NULL,
    qualified_at    timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT control_plane_waitlist_status_ck
        CHECK (status IN ('pending', 'qualified', 'invited', 'declined')),
    CONSTRAINT control_plane_waitlist_role_ck
        CHECK (role IS NULL OR role IN ('artist', 'manager', 'festival', 'other')),
    CONSTRAINT control_plane_waitlist_roster_ck
        CHECK (roster_size IS NULL OR roster_size IN ('solo', '2-5', '6-20', '20+')),
    CONSTRAINT control_plane_waitlist_referral_ck
        CHECK (referral_code ~ '^[a-z0-9]{8}$')
);

CREATE INDEX IF NOT EXISTS control_plane_waitlist_email_hash_idx
    ON control_plane_waitlist(email_hash);
CREATE INDEX IF NOT EXISTS control_plane_waitlist_referral_code_idx
    ON control_plane_waitlist(referral_code);
CREATE INDEX IF NOT EXISTS control_plane_waitlist_status_created_idx
    ON control_plane_waitlist(status, created_at DESC);
