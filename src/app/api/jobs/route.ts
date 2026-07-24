// app/api/jobs/route.ts
//
// POST a source link + destination; get back a fully-resolved review job.
// Runs on the Node runtime (jsonwebtoken / crypto for the Apple dev token).

import { NextResponse } from 'next/server';
import { runJob } from '@/lib/job/runJob';
import { JobError, type JobErrorCode } from '@/lib/job/types';
import type { Auth, Platform } from '@/lib/providers/types';
import { getSession } from '@/lib/session';
import { getValidSpotifyToken } from '@/lib/auth/spotifyOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DESTINATIONS: Platform[] = ['spotify', 'apple', 'youtube'];

const STATUS: Record<JobErrorCode, number> = {
  INVALID_URL: 400,
  SAME_PLATFORM: 400,
  PROVIDER_UNAVAILABLE: 501,
  PLAYLIST_NOT_FOUND: 404,
  PLAYLIST_PRIVATE: 403,
  AUTH_REQUIRED: 401,
  RATE_LIMITED: 429,
  PLAYLIST_TOO_LARGE: 413,
  PLATFORM_ERROR: 502,
};

export async function POST(req: Request) {
  let body: { url?: unknown; destination?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: 'Expected a JSON body.' } },
      { status: 400 },
    );
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const destination = body.destination;

  if (!url) {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: 'Paste a playlist link first.' } },
      { status: 400 },
    );
  }
  if (typeof destination !== 'string' || !DESTINATIONS.includes(destination as Platform)) {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: 'Pick a destination service.' } },
      { status: 400 },
    );
  }

  // If the user has connected Spotify, use their token so private playlists
  // (owned by them) can be read. Public reads still need no login.
  const session = await getSession();
  let spotifyToken: string | null = null;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (session.spotify && clientId) {
    try {
      spotifyToken = await getValidSpotifyToken(session, { clientId });
      await session.save(); // persist a refreshed token
    } catch {
      spotifyToken = null; // fall back to public read
    }
  }

  const sourceAuthFor = (platform: Platform): Auth =>
    platform === 'spotify' && spotifyToken
      ? { kind: 'bearer', token: spotifyToken }
      : { kind: 'none' };

  try {
    const job = await runJob({ url, destination: destination as Platform }, { sourceAuthFor });
    return NextResponse.json(job);
  } catch (e) {
    const err = e instanceof JobError ? e : new JobError('PLATFORM_ERROR', 'Unexpected error.');
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: STATUS[err.code] },
    );
  }
}
