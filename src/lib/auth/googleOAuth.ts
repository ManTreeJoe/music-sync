// lib/auth/googleOAuth.ts
//
// Google OAuth (Authorization Code + PKCE) for reading a user's private YouTube
// playlists — and, later, writing. The `youtube` scope covers both. Google is a
// confidential client, so the token exchange sends the client secret alongside
// the PKCE verifier.

import { httpJson } from '../http';
import type { OAuthTokens, SessionData } from '../session';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/youtube'];

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export function googleRedirectUri(req: Request): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    new URL('/api/auth/google/callback', req.url).toString()
  );
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

export interface GoogleExchangeOpts {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  now?: number;
  fetchImpl?: typeof fetch;
}

export async function exchangeCode(opts: GoogleExchangeOpts): Promise<OAuthTokens> {
  const res = await httpJson<TokenResponse>(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
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

export interface GoogleRefreshOpts {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  now?: number;
  fetchImpl?: typeof fetch;
}

export async function refreshTokens(opts: GoogleRefreshOpts): Promise<OAuthTokens> {
  const res = await httpJson<TokenResponse>(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
    }),
    fetchImpl: opts.fetchImpl,
  });
  const now = opts.now ?? Date.now();
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? opts.refreshToken, // Google rarely rotates it
    expiresAt: now + res.expires_in * 1000,
  };
}

export async function getValidGoogleToken(
  session: SessionData,
  opts: { clientId: string; clientSecret: string; now?: number; fetchImpl?: typeof fetch },
): Promise<string | null> {
  const now = opts.now ?? Date.now();
  const g = session.google;
  if (!g) return null;
  if (g.expiresAt > now + 60_000) return g.accessToken;
  if (!g.refreshToken) return g.accessToken;

  const refreshed = await refreshTokens({
    refreshToken: g.refreshToken,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    now,
    fetchImpl: opts.fetchImpl,
  });
  session.google = { ...refreshed, userId: g.userId };
  return refreshed.accessToken;
}
