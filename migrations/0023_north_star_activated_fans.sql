-- Add 'activated_fans_30d' to the north-star CHECK constraint so a tenant
-- measured on real fans — signed up, consented, did something meaningful
-- within 30 days — can be created. This is the first-party metric the
-- brain now defaults to: it is counted from our own `fans`/`fan_consents`
-- tables via `viryaos_fan_activation_kpi`, not from any external platform,
-- so it cannot be gamed by buying reach. The validator and wizard accept
-- it; this catches the database up.
ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_tenant_north_star_ck;

ALTER TABLE control_plane_tenants
    ADD CONSTRAINT control_plane_tenant_north_star_ck CHECK (
        north_star_metric IN (
            'signal_installs',
            'total_audience',
            'activated_fans_30d',
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
            'x_followers',
            'youtube_subscribers'
        )
    );
