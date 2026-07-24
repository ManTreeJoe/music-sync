// lib/auth/spotifyOAuth.ts
//
// Spotify Authorization-Code-with-PKCE flow for reading a user's PRIVATE
// playlists (and, later, writing). The token exchange runs server-side and uses
// PKCE (client_id + code_verifier), not a client secret in the browser.

import { httpJson } from '../http';
import type { SessionData, SpotifyTokens } from '../session';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
];

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** The callback URL Spotify redirects to. Must match the dashboard exactly. */
export function spotifyRedirectUri(req: Request): string {
  return (
    process.env.SPOTIFY_REDIRECT_URI ??
    new URL('/api/auth/spotify/callback', req.url).toString()
  );
}

const form = (fields: Record<string, string>) =>
  new URLSearchParams(fields).toString();

export interface ExchangeOpts {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  now?: number;
  fetchImpl?: typeof fetch;
}

export async function exchangeCode(opts: ExchangeOpts): Promise<SpotifyTokens> {
  const res = await httpJson<TokenResponse>(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      code_verifier: opts.verifier,
    }),
    fetchImpl: opts.fetchImpl,
  });
  const now = opts.now ?? Date.now();
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? '',
    expiresAt: now + res.expires_in * 1000,
  };
}

export interface RefreshOpts {
  refreshToken: string;
  clientId: string;
  now?: number;
  fetchImpl?: typeof fetch;
}

export async function refreshTokens(opts: RefreshOpts): Promise<SpotifyTokens> {
  const res = await httpJson<TokenResponse>(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
    }),
    fetchImpl: opts.fetchImpl,
  });
  const now = opts.now ?? Date.now();
  return {
    accessToken: res.access_token,
    // Spotify may or may not rotate the refresh token; keep the old one if not.
    refreshToken: res.refresh_token ?? opts.refreshToken,
    expiresAt: now + res.expires_in * 1000,
  };
}

/**
 * A currently-valid access token for the session, refreshing if it's within a
 * minute of expiry. Mutates `session.spotify` in place — the caller must
 * `session.save()` afterward. Returns null if the session isn't connected.
 */
export async function getValidSpotifyToken(
  session: SessionData,
  opts: { clientId: string; now?: number; fetchImpl?: typeof fetch },
): Promise<string | null> {
  const now = opts.now ?? Date.now();
  const s = session.spotify;
  if (!s) return null;
  if (s.expiresAt > now + 60_000) return s.accessToken;
  if (!s.refreshToken) return s.accessToken; // best effort; will likely 401

  const refreshed = await refreshTokens({
    refreshToken: s.refreshToken,
    clientId: opts.clientId,
    now,
    fetchImpl: opts.fetchImpl,
  });
  session.spotify = { ...refreshed, userId: s.userId };
  return refreshed.accessToken;
}
