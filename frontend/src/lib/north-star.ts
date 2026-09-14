import type { NorthStarOption } from './types'

/**
 * The goal picker, in words an operator uses.
 *
 * The server names these metrics the way the domain models them — "Activated
 * fans (30d)", "Signal installs", "Total audience", "Discogs collectors". Every
 * one of those is accurate and none of them says what you are choosing between.
 * An operator picking a goal is answering one question: *what should the brain
 * chase when it has to choose?* — and "Signal installs" does not answer it.
 *
 * This is a label and a one-line meaning per goal, keyed by the server's value.
 *
 * It is deliberately **not** a copy of the vocabulary. The list of goals still
 * comes from the server — the console carried its own four-entry copy once and
 * it stopped matching the moment the backend widened, so a tenant measured on
 * SoundCloud could not select SoundCloud. Anything not named here keeps the
 * server's own label, so a goal added upstream tomorrow appears immediately
 * with its real name and simply reads a little more like a spec.
 */

type Wording = { label: string; meaning: string }

const WORDING: Record<string, Wording> = {
  // The three the domain counts itself, and the three that read worst.
  activated_fans_30d: {
    label: 'Real fans, doing something',
    meaning: 'People who signed up and have actually done something in the last month. Not a follower count — the ones who are really there.',
  },
  signal_installs: {
    label: 'Fans with the app',
    meaning: 'People who installed Signal. You can reach them directly, without asking a platform for permission.',
  },
  total_audience: {
    label: 'Every platform, added up',
    // Not "everyone": the sum is `off_platform_audience`, which by its own
    // definition is "audience that is not already ours" — so the fans in
    // Signal, the ones you can actually reach, are the one group it leaves
    // out. Saying "everyone, everywhere" over a number that excludes your own
    // audience is the kind of label that makes a goal look like the safe
    // choice when it is not.
    meaning: 'Followers across every connected platform, added together. It leaves out your own Signal fans, and most of what it counts you cannot contact.',
  },

  // Not offered by every tenant build yet. Wording waits here so the goal
  // arrives named rather than as `weighted_audience`, the same way the rest of
  // this map covers values the server may or may not send.
  weighted_audience: {
    label: 'Everything, by what it is worth',
    meaning: 'Every platform counted, but not equally: a Signal fan you can reach outweighs a follower you cannot, and a paying supporter outweighs a passing view.',
  },

  // Platform goals. The nouns are the platforms' own, so they stay; what they
  // need is the same sentence as the rest — what chasing this one means.
  spotify_followers: {
    label: 'Spotify followers',
    meaning: 'Good for the algorithm and for release-day reach. Spotify owns the relationship, not you.',
  },
  youtube_subscribers: {
    label: 'YouTube subscribers',
    meaning: 'People who get told when you post a video. Strong for anything with a screen.',
  },
  bandsintown_trackers: {
    label: 'Fans tracking your shows',
    meaning: 'People who asked to be told when you play near them. The closest a platform gets to intent to attend.',
  },
  tiktok_followers: {
    label: 'TikTok followers',
    meaning: 'Fastest growth, weakest attachment. A follower here may never hear a full song.',
  },
  soundcloud_followers: {
    label: 'SoundCloud followers',
    meaning: 'The listeners who follow artists rather than playlists.',
  },
  instagram_followers: {
    label: 'Instagram followers',
    meaning: 'Where the band looks like a band. Good for the story, thin for conversion.',
  },
  facebook_followers: {
    label: 'Facebook followers',
    meaning: 'Older crowd, better event turnout. Reach depends entirely on what Meta decides to show.',
  },
  discord_members: {
    label: 'People in your Discord',
    meaning: 'The ones who want to hang around. Small numbers, highest engagement per person.',
  },
  telegram_subscribers: {
    label: 'People on your Telegram',
    meaning: 'A channel you actually own. Every post reaches everyone, no algorithm in between.',
  },
  lastfm_listeners: {
    label: 'Last.fm listeners',
    meaning: 'People whose listening is logged. A measure of real repeat play, not of reach.',
  },
  deezer_fans: {
    label: 'Deezer fans',
    meaning: 'Matters where Deezer does — France and francophone markets especially.',
  },
  discogs_in_collection: {
    label: 'Collectors who own a record',
    meaning: 'People who filed your release in their collection. Few, and the most committed of any number here.',
  },
  bluesky_followers: {
    label: 'Bluesky followers',
    meaning: 'Small and early. Cheap to grow now, unproven for turning into anything.',
  },
  bandcamp_supporters: {
    label: 'Fans who paid on Bandcamp',
    meaning: 'They opened a wallet for you. The strongest signal of intent on this list.',
  },
  x_followers: {
    label: 'X followers',
    meaning: 'Reach when a post travels. Little of it is durable.',
  },
}

/** The operator-facing name, falling back to whatever the server called it. */
export const northStarLabel = (option: NorthStarOption): string =>
  WORDING[option.value]?.label ?? option.label

/** One line on what chasing this goal means. Absent for a goal we have no
 *  wording for yet — the picker simply shows nothing rather than guessing. */
export const northStarMeaning = (value: string): string | undefined => WORDING[value]?.meaning

/** The server's own name, for where the exact metric matters more than the
 *  plain-language one — a settings row that records what was stored. */
export const northStarTechnicalName = (option: NorthStarOption): string => option.label
