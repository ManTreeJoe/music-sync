// app/api/auth/spotify/callback/route.ts
//
// Spotify redirects here with ?code&state. Validate state (CSRF), exchange the
// code for tokens using the stored PKCE verifier, capture the user id, and
// redirect back to where the user started.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { httpJson } from '@/lib/http';
import { exchangeCode, spotifyRedirectUri } from '@/lib/auth/spotifyOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const oauth = session.spotifyOauth;
  const returnTo = oauth?.returnTo || '/';

  const back = (params: string) =>
    NextResponse.redirect(new URL(`${returnTo}${params}`, req.url));

  const clear = async () => {
    session.spotifyOauth = undefined;
    await session.save();
  };

  if (oauthError) {
    await clear();
    return back('?connect=error&reason=denied');
  }
  if (!code || !state || !oauth || state !== oauth.state) {
    await clear();
    return back('?connect=error&reason=state');
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    await clear();
    return back('?connect=error&reason=config');
  }

  try {
    const tokens = await exchangeCode({
      code,
      verifier: oauth.verifier,
      redirectUri: spotifyRedirectUri(req),
      clientId,
    });
    const me = await httpJson<{ id: string }>('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    session.spotify = { ...tokens, userId: me.id };
    session.spotifyOauth = undefined;
    await session.save();
    return back('?connect=spotify');
  } catch {
    await clear();
    return back('?connect=error&reason=exchange');
  }
}
