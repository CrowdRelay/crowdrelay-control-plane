-- Add 'x_followers' to the north-star CHECK constraint so a tenant
-- measured on X (Twitter) follower growth can be created. The validator
-- and wizard already accept it; this catches the database up.
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
            'x_followers',
            'youtube_subscribers'
        )
    );
