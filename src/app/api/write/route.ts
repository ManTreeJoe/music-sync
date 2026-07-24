// app/api/write/route.ts
//
// Create/append the matched tracks onto the destination.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { destAuthFor } from '@/lib/auth/sessionAuth';
import { runWrite, type WriteResult, type WriteTrackRef } from '@/lib/job/write';
import { JobError, type JobErrorCode } from '@/lib/job/types';
import { canAfford, charge } from '@/lib/quota';
import { redis } from '@/lib/redis';
import type { Platform } from '@/lib/providers/types';

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
  let body: {
    destination?: unknown;
    mode?: unknown;
    playlistId?: unknown;
    name?: unknown;
    tracks?: unknown;
    unmatchedCount?: unknown;
    idempotencyKey?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: 'Expected a JSON body.' } },
      { status: 400 },
    );
  }

  const destination = body.destination;
  const mode = body.mode === 'append' ? 'append' : 'create';
  if (typeof destination !== 'string' || !DESTINATIONS.includes(destination as Platform)) {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: 'Unknown destination.' } },
      { status: 400 },
    );
  }
  const tracks = Array.isArray(body.tracks)
    ? (body.tracks.filter(
        (t) => t && typeof (t as WriteTrackRef).platformId === 'string',
      ) as WriteTrackRef[])
    : [];
  if (tracks.length === 0) {
    return NextResponse.json(
      { error: { code: 'DEST_NOT_WRITABLE', message: 'No matched tracks to write.' } },
      { status: 400 },
    );
  }

  const dest = destination as Platform;
  if (dest === 'youtube' && process.env.YOUTUBE_WRITE_ENABLED !== 'true') {
    return NextResponse.json(
      {
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'Writing to YouTube is off (quota-gated). Enable it once quota is approved.',
        },
      },
      { status: 501 },
    );
  }

  // Idempotency: a retry with the same key replays the stored result instead of
  // creating a second playlist. (Best-effort without a strict lock; the client
  // also disables the button while writing.)
  const idem = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null;
  if (idem) {
    const prior = await redis.get<WriteResult>(`idem:${idem}`);
    if (prior) return NextResponse.json(prior);
    const lock = await redis.set(`idem:${idem}:lock`, '1', { nx: true, ex: 120 });
    if (!lock) {
      return NextResponse.json(
        { error: { code: 'DEST_NOT_WRITABLE', message: 'That write is already in progress.' } },
        { status: 409 },
      );
    }
  }

  try {
    const session = await getSession();
    const auth = await destAuthFor(dest, session);
    await session.save(); // persist a refreshed token

    const result = await runWrite(
      {
        destination: dest,
        mode,
        playlistId: typeof body.playlistId === 'string' ? body.playlistId : undefined,
        name: typeof body.name === 'string' ? body.name : undefined,
        tracks,
        unmatchedCount: typeof body.unmatchedCount === 'number' ? body.unmatchedCount : 0,
      },
      {
        auth,
        canAfford: dest === 'youtube' ? (u) => canAfford(u) : undefined,
        charge: dest === 'youtube' ? (u) => charge(u) : undefined,
        quotaResetHint: 'at midnight Pacific',
      },
    );
    if (idem) await redis.set(`idem:${idem}`, result, { ex: 600 });
    return NextResponse.json(result);
  } catch (e) {
    // A failed write must not block a retry — release the in-progress lock so the
    // same key can be used again. (The stored result is only set on success.)
    if (idem) await redis.del(`idem:${idem}:lock`);
    const err = e instanceof JobError ? e : new JobError('PLATFORM_ERROR', 'Unexpected error.');
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: STATUS[err.code] },
    );
  }
}
