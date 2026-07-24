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
import { getValidGoogleToken } from '@/lib/auth/googleOAuth';
import { getAppleDeveloperToken } from '@/lib/auth/appleToken';

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
  DEST_NOT_WRITABLE: 409,
  QUOTA_EXCEEDED: 429,
  PARTIAL_WRITE: 502,
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

  // If the user has connected an account, use their token so their private
  // playlists can be read. Public reads still need no login.
  const session = await getSession();

  let spotifyToken: string | null = null;
  if (session.spotify && process.env.SPOTIFY_CLIENT_ID) {
    try {
      spotifyToken = await getValidSpotifyToken(session, {
        clientId: process.env.SPOTIFY_CLIENT_ID,
      });
    } catch {
      spotifyToken = null;
    }
  }

  let googleToken: string | null = null;
  if (session.google && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    try {
      googleToken = await getValidGoogleToken(session, {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      });
    } catch {
      googleToken = null;
    }
  }

  const appleUserToken = session.apple?.userToken ?? null;
  await session.save(); // persist any refreshed tokens

  const sourceAuthFor = (platform: Platform): Auth => {
    if (platform === 'spotify' && spotifyToken) {
      return { kind: 'bearer', token: spotifyToken };
    }
    if (platform === 'youtube' && googleToken) {
      return { kind: 'bearer', token: googleToken };
    }
    if (platform === 'apple' && appleUserToken) {
      // enables private library reads; getAppleDeveloperToken throws if the
      // server lacks Apple creds, which runJob maps to PROVIDER_UNAVAILABLE
      return { kind: 'apple', developerToken: getAppleDeveloperToken(), userToken: appleUserToken };
    }
    return { kind: 'none' };
  };

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
