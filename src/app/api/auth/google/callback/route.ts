// app/api/auth/google/callback/route.ts

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { exchangeCode, googleRedirectUri } from '@/lib/auth/googleOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const oauth = session.googleOauth;
  const returnTo = oauth?.returnTo || '/';

  const back = (params: string) =>
    NextResponse.redirect(new URL(`${returnTo}${params}`, req.url));
  const clear = async () => {
    session.googleOauth = undefined;
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

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    await clear();
    return back('?connect=error&reason=config');
  }

  try {
    const tokens = await exchangeCode({
      code,
      verifier: oauth.verifier,
      redirectUri: googleRedirectUri(req),
      clientId,
      clientSecret,
    });
    session.google = tokens;
    session.googleOauth = undefined;
    await session.save();
    return back('?connect=youtube');
  } catch {
    await clear();
    return back('?connect=error&reason=exchange');
  }
}
