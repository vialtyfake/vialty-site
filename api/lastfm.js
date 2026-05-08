// api/lastfm.js — Vercel Serverless Function
//
// Reads the currently-scrobbling track from Last.fm and returns a small
// JSON payload that the front-end can render without knowing anything about
// the Last.fm API shape.
//
// Required environment variables (set in Vercel dashboard):
//   LASTFM_API_KEY   — your Last.fm API key (from https://www.last.fm/api/account/create)
//   LASTFM_USERNAME  — your Last.fm username (the one linked to Apple Music scrobbling)


export default async function handler(req, res) {
  // Allow the front-end on any origin to call this endpoint.
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Always return fresh data — we never want a cached "now playing" response.
  res.setHeader('Cache-Control', 'no-store');

  const { LASTFM_API_KEY, LASTFM_USERNAME } = process.env;

  if (!LASTFM_API_KEY || !LASTFM_USERNAME) {
    return res.status(500).json({ error: 'Missing LASTFM_API_KEY or LASTFM_USERNAME env vars.' });
  }

  // ── Fetch the 1 most recent track from Last.fm ───────────────────────────
  // `limit=1` means we only get the latest track (currently playing or most
  // recently played). The `format=json` param tells Last.fm to respond with
  // JSON instead of its default XML format.
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.searchParams.set('method',  'user.getRecentTracks');
  url.searchParams.set('user',    LASTFM_USERNAME);
  url.searchParams.set('api_key', LASTFM_API_KEY);
  url.searchParams.set('format',  'json');
  url.searchParams.set('limit',   '1');

  const lfmRes = await fetch(url.toString());

  if (!lfmRes.ok) {
    return res.status(200).json({ isPlaying: false });
  }

  const lfmData = await lfmRes.json();

  // Last.fm wraps everything in a `recenttracks` object; if that's missing
  // something went wrong (bad API key, private profile, etc.)
  const tracks = lfmData?.recenttracks?.track;
  if (!tracks || tracks.length === 0) {
    return res.status(200).json({ isPlaying: false });
  }

  // The first element is always the most recent track.
  const track = Array.isArray(tracks) ? tracks[0] : tracks;

  // Last.fm signals "currently playing" with a `@attr` object on the track.
  // If `@attr` is absent or `nowplaying` is not "true", the user isn't
  // actively listening right now — they've just stopped or paused.
  const isPlaying = track['@attr']?.nowplaying === 'true';

  if (!isPlaying) {
    return res.status(200).json({ isPlaying: false });
  }

  // ── Pick the best album art image ───────────────────────────────────────
  // Last.fm provides four sizes: small (34px), medium (64px), large (174px),
  // extralarge (300px). We want something crisp but not oversized for a
  // thumbnail — "large" (174px) is the sweet spot.
  const images = track.image ?? [];
  const artUrl =
    images.find(img => img.size === 'large')?.['#text'] ||
    images.find(img => img.size === 'extralarge')?.['#text'] ||
    images.find(img => img['#text'])?.['#text'] ||
    '';

  // Last.fm sometimes returns an empty string for art when it doesn't have it.
  const albumArt = artUrl || null;

  return res.status(200).json({
    isPlaying: true,
    title:     track.name,
    artist:    track.artist?.['#text'] ?? 'Unknown Artist',
    album:     track.album?.['#text']  ?? '',
    albumArt,
    // `track.url` links to the Last.fm page for this track — not Apple Music,
    // but it's the best cross-platform link available without Apple's API.
    songUrl:   track.url ?? null,
  });
}
