-- The north-star CHECK never caught up with the vocabulary.
--
-- `validation::NORTH_STAR_METRICS` carries sixteen goals, the wizard offers
-- them, and `scripts/test_north_star_vocabulary_parity.py` pins the domain
-- enum, the validator and the wizard's TypeScript union together. The database
-- was not one of the copies it pins, and it still allowed the original four.
--
-- So the failure the validator's own doc comment describes — "the wizard
-- offered seventeen goals while this rejected all but four" — simply moved one
-- layer down. Creating a tenant on `total_audience`, which is the wizard's
-- default, passed validation and then died in Postgres:
--
--   ERROR:  new row for relation "control_plane_tenants"
--           violates check constraint "control_plane_tenant_north_star_ck"
--
-- The operator saw "internal error" and nothing else.
--
-- Widening a CHECK validates existing rows, and every stored value is one of
-- the four already permitted, so this cannot fail on data.
--
-- `control_plane_tenant_signal_north_star_ck` is deliberately untouched:
-- `signal_installs` genuinely requires Signal to be enabled, and that rule is
-- about coherence between two settings rather than about the vocabulary.

ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_tenant_north_star_ck;

ALTER TABLE control_plane_tenants
    ADD CONSTRAINT control_plane_tenant_north_star_ck CHECK (
        north_star_metric IN (
            'signal_installs',
            'total_audience',
            'bandcamp_supporters',
            'bandsintown_trackers',
            'bluesky_followers',
            'deezer_fans',
            'discogs_in_collection',
            'discord_members',
            'facebook_followers',
            'instagram_followers',
            'lastfm_listeners',
            'soundcloud_followers',
            'spotify_followers',
            'telegram_subscribers',
            'tiktok_followers',
            'youtube_subscribers'
        )
    );
