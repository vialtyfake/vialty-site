/**
 * api/spotify.js — Vercel Serverless Function
 *
 * Place this file at the root of your project in a folder called "api/".
 * Vercel will automatically expose it at: https://yoursite.vercel.app/api/spotify
 *
 * Required environment variables (set in Vercel Dashboard → Settings → Environment Variables):
 *   SPOTIFY_CLIENT_ID      — from your Spotify app at developer.spotify.com
 *   SPOTIFY_CLIENT_SECRET  — same place
 *   SPOTIFY_REFRESH_TOKEN  — the refresh token from your OAuth flow
 */

export default async function handler(req, res) {
  // Allow your own front-end to call this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store'); // always fetch fresh data

  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;

  // ── Step 1: Exchange the refresh token for a fresh access token ──────────
  // Access tokens expire after 1 hour, so we never store one — we always
  // use the long-lived refresh token to mint a new one on each request.
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Spotify requires Basic auth: base64(clientId:clientSecret)
      'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
  });

  const { access_token } = await tokenRes.json();

  if (!access_token) {
    return res.status(500).json({ error: 'Failed to obtain access token. Check your env vars.' });
  }

  // ── Step 2: Ask Spotify what's currently playing ─────────────────────────
  const spotifyRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  // 204 = No Content: nothing is playing right now
  if (spotifyRes.status === 204) {
    return res.status(200).json({ isPlaying: false });
  }

  if (!spotifyRes.ok) {
    return res.status(200).json({ isPlaying: false });
  }

  const song = await spotifyRes.json();

  // Guard against podcasts or other non-track types
  if (!song?.item || song.currently_playing_type !== 'track') {
    return res.status(200).json({ isPlaying: false });
  }

  // ── Step 3: Return only what the front-end needs ─────────────────────────
  return res.status(200).json({
    isPlaying:  song.is_playing,
    title:      song.item.name,
    artist:     song.item.artists.map(a => a.name).join(', '),
    album:      song.item.album.name,
    // Spotify provides 3 image sizes; index [2] is the smallest (64×64px), perfect for a thumbnail
    albumArt:   song.item.album.images[2]?.url ?? song.item.album.images[0]?.url,
    songUrl:    song.item.external_urls.spotify,
    progress:   song.progress_ms,
    duration:   song.item.duration_ms,
  });
}
