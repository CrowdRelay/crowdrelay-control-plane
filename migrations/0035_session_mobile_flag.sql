-- Sessions remember whether they were issued to a mobile client. The login
-- response already reports `isMobile`, but `GET /auth/session` could not —
-- the flag lived nowhere, so a refreshed page lost it and the re-auth gate
-- for destructive mutations could never trigger. Persist it at issue time.
ALTER TABLE control_plane_operator_sessions
    ADD COLUMN is_mobile boolean NOT NULL DEFAULT false;
