// app/api/auth/spotify/route.ts
//
// Start the Spotify OAuth (PKCE) flow: stash the verifier + CSRF state in the
// session and redirect to Spotify's consent screen.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { generateVerifier, challengeFromVerifier, randomState } from '@/lib/pkce';
import { SPOTIFY_SCOPES, spotifyRedirectUri } from '@/lib/auth/spotifyOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'Spotify is not configured on the server.' },
      { status: 501 },
    );
  }

  const session = await getSession();
  const verifier = generateVerifier();
  const state = randomState();
  const returnTo = new URL(req.url).searchParams.get('returnTo') || '/';
  // Only allow same-site return paths.
  const safeReturn = returnTo.startsWith('/') ? returnTo : '/';

  session.spotifyOauth = { verifier, state, returnTo: safeReturn };
  await session.save();

  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', spotifyRedirectUri(req));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', challengeFromVerifier(verifier));
  url.searchParams.set('scope', SPOTIFY_SCOPES.join(' '));
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}
