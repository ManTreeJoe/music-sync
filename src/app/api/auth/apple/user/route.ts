// app/api/auth/apple/user/route.ts
//
// Receive the Music User Token that MusicKit JS obtained in the browser and
// store it in the encrypted session. Required for reading a user's library and
// for writing playlists.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { userToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }
  const userToken = body.userToken;
  if (typeof userToken !== 'string' || userToken.length < 10) {
    return NextResponse.json({ error: 'Missing user token.' }, { status: 400 });
  }

  const session = await getSession();
  session.apple = { userToken };
  await session.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  session.apple = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}
