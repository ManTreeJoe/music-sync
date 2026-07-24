// lib/session.ts
//
// Encrypted iron-session cookie — the only place user tokens live in v1. No DB.
// A breach of the app exposes nothing durable; the cookie is httpOnly, Lax, and
// Secure in production.

import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  userId?: string;
}

export interface SessionData {
  spotify?: SpotifyTokens;
  /** Transient PKCE state, only present mid-OAuth. */
  spotifyOauth?: { verifier: string; state: string; returnTo: string };
}

// iron-session requires a >=32-char password. In production SESSION_SECRET must
// be set; the dev fallback keeps local runs working but is not secure.
const password =
  process.env.SESSION_SECRET ?? 'insecure_dev_session_password_change_me_please_32';

export const sessionOptions: SessionOptions = {
  password,
  cookieName: 'pb_session',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
};

/** Read/write the session in a route handler or server action. */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
