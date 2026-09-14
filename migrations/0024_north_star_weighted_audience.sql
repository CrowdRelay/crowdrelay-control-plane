-- Add 'weighted_audience' to the north-star CHECK constraint.
--
-- `total_audience` sums every connected platform and counts a TikTok follower
-- and a fan who installed the app as the same person — while excluding the
-- Signal fan from the sum altogether, because the aggregate behind it means
-- "audience that is not already ours". A tenant that asked the brain to grow
-- everything got a goal that counted the followers it cannot contact and none
-- of the fans it can.
--
-- `weighted_audience` counts every platform, Signal included, and prices each
-- one by how much of the relationship the tenant actually holds — Signal
-- highest, an algorithmic follow low, Reddit community size not at all. See
-- `MetricPlatform::audience_weight` in crowdrelay-domain for the scale and the
-- reasoning behind each number.
--
-- Widening a CHECK is expand-only: every value that was legal before stays
-- legal, so a control plane still writing `total_audience` is unaffected and
-- the constraint can be replaced without a table rewrite.
ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_tenant_north_star_ck;

ALTER TABLE control_plane_tenants
    ADD CONSTRAINT control_plane_tenant_north_star_ck CHECK (
        north_star_metric IN (
            'signal_installs',
            'total_audience',
            'weighted_audience',
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
