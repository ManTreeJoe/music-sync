// app/api/auth/spotify/logout/route.ts
//
// Disconnect Spotify: drop the stored tokens from the session.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSession();
  session.spotify = undefined;
  session.spotifyOauth = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}
