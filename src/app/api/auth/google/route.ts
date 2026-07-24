// app/api/auth/google/route.ts
//
// Start the Google/YouTube OAuth (PKCE) flow.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { generateVerifier, challengeFromVerifier, randomState } from '@/lib/pkce';
import { GOOGLE_AUTH_URL, GOOGLE_SCOPES, googleRedirectUri } from '@/lib/auth/googleOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'YouTube (Google) is not configured on the server.' },
      { status: 501 },
    );
  }

  const session = await getSession();
  const verifier = generateVerifier();
  const state = randomState();
  const returnTo = new URL(req.url).searchParams.get('returnTo') || '/';
  const safeReturn = returnTo.startsWith('/') ? returnTo : '/';

  session.googleOauth = { verifier, state, returnTo: safeReturn };
  await session.save();

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', googleRedirectUri(req));
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', challengeFromVerifier(verifier));
  url.searchParams.set('state', state);
  // Ask for a refresh token every time.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  return NextResponse.redirect(url.toString());
}
