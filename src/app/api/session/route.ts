// app/api/session/route.ts
//
// Lightweight connection status for the client (which "Connect" state to show).
// Never returns tokens.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    spotify: Boolean(session.spotify),
    spotifyUser: session.spotify?.userId ?? null,
    youtube: Boolean(session.google),
    apple: Boolean(session.apple),
  });
}
