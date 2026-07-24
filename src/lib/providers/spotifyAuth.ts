// lib/providers/spotifyAuth.ts
//
// Client-credentials token for reading PUBLIC playlists — no user login needed.
// This is what lets the source side of a Spotify → Apple transfer require zero
// auth when the input is a public link. Cached ~55 minutes.

import { httpJson } from '../http';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

let cached: { token: string; expiresAt: number } | null = null;

export interface TokenDeps {
  clientId?: string;
  clientSecret?: string;
  now?: number;
  fetchImpl?: typeof fetch;
}

export async function getSpotifyAppToken(deps: TokenDeps = {}): Promise<string> {
  const now = deps.now ?? Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const clientId = deps.clientId ?? requireEnv('SPOTIFY_CLIENT_ID');
  const clientSecret = deps.clientSecret ?? requireEnv('SPOTIFY_CLIENT_SECRET');
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await httpJson<TokenResponse>('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    fetchImpl: deps.fetchImpl,
  });

  cached = {
    token: res.access_token,
    // Refresh a little early (spec: cache ~55min against a ~1h token).
    expiresAt: now + (res.expires_in - 300) * 1000,
  };
  return cached.token;
}

/** Test hook — clears the module-level cache. */
export function _resetSpotifyTokenCache(): void {
  cached = null;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
