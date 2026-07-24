// app/api/playlists/route.ts
//
// The user's writable playlists on a destination, for the append picker.
// Returns [] when the account isn't connected.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { destAuthFor } from '@/lib/auth/sessionAuth';
import { getProvider } from '@/lib/providers';
import type { Platform } from '@/lib/providers/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DESTINATIONS: Platform[] = ['spotify', 'apple', 'youtube'];

export async function GET(req: Request) {
  const platform = new URL(req.url).searchParams.get('platform');
  if (!platform || !DESTINATIONS.includes(platform as Platform)) {
    return NextResponse.json({ playlists: [] });
  }

  try {
    const session = await getSession();
    const auth = await destAuthFor(platform as Platform, session);
    await session.save();
    const provider = getProvider(platform as Platform);
    const playlists = await provider.getWritablePlaylists(auth);
    return NextResponse.json({
      playlists: playlists.map((p) => ({ id: p.id, name: p.name, trackCount: p.trackCount })),
    });
  } catch {
    // Not connected / not configured — the picker just shows nothing.
    return NextResponse.json({ playlists: [] });
  }
}
