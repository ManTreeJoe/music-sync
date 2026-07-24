// lib/session.ts
//
// Encrypted iron-session cookie — the only place user tokens live in v1. No DB.
// A breach of the app exposes nothing durable; the cookie is httpOnly, Lax, and
// Secure in production.

import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  userId?: string;
}

/** Kept for readability at Spotify call sites. */
export type SpotifyTokens = OAuthTokens;

interface PendingOAuth {
  verifier: string;
  state: string;
  returnTo: string;
}

export interface SessionData {
  spotify?: OAuthTokens;
  spotifyOauth?: PendingOAuth;

  google?: OAuthTokens; // YouTube
  googleOauth?: PendingOAuth;

  /** Apple Music User Token (obtained client-side via MusicKit JS). */
  apple?: { userToken: string };
}

// iron-session requires a >=32-char password. The dev fallback keeps local runs
// working; production MUST set SESSION_SECRET or session encryption is worthless.
const DEV_FALLBACK = 'insecure_dev_session_password_change_me_please_32';

/**
 * Resolve the cookie password, refusing to run on the insecure fallback in
 * production. Checked lazily (at request time, not module load) so a build never
 * trips it, but a live request without a real secret fails loudly instead of
 * silently encrypting tokens with a public constant.
 */
function resolvePassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32 || secret === DEV_FALLBACK) {
      throw new Error('SESSION_SECRET must be set to a random 32+ character string in production.');
    }
    return secret;
  }
  return secret && secret.length >= 32 ? secret : DEV_FALLBACK;
}

function options(): SessionOptions {
  return {
    password: resolvePassword(),
    cookieName: 'pb_session',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  };
}

/** Read/write the session in a route handler or server action. */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}
