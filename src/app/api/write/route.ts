// app/api/write/route.ts
//
// Kick off a background write: create/append the matched tracks onto the
// destination. Returns a job id immediately; the client streams progress from
// /api/jobs/{id}/stream (the same machinery as matching) and reads the result
// from /api/jobs/{id}.
//
// A write always needs the destination user token, so it runs in-process via
// after() — never on Inngest (tokens must not enter an event payload). Auth is
// resolved here, before the job is created, so a missing connection fails fast
// with 401 rather than as a background job failure.
//
// Idempotency: the client's stable key maps to a job id. A repeat with the same
// key joins the existing job (so a double-click never creates two playlists);
// if that job failed, the mapping is cleared so a genuine retry starts fresh.

import { NextResponse, after } from 'next/server';
import { getSession } from '@/lib/session';
import { destAuthFor } from '@/lib/auth/sessionAuth';
import { type WriteTrackRef } from '@/lib/job/write';
import { executeWriteJob } from '@/lib/job/executeWrite';
import { createJob, newJobId, getJob } from '@/lib/job/store';
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

  // Idempotency: same key → same job. Join an in-flight/finished one; only a
  // failed prior attempt is cleared so a retry can start over.
  const idem = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null;
  if (idem) {
    const priorId = await redis.get<string>(`idem:${idem}`);
    if (priorId) {
      const prior = await getJob(priorId);
      if (prior && prior.status !== 'failed') {
        return NextResponse.json({ jobId: priorId }, { status: 202 });
      }
      await redis.del(`idem:${idem}`); // failed/expired — allow a fresh attempt
    }
  }

  // Resolve the destination token now so a missing connection fails fast (401),
  // not as a background job failure. Tokens stay in-process.
  let auth;
  try {
    const session = await getSession();
    auth = await destAuthFor(dest, session);
    await session.save(); // persist a refreshed token
  } catch (e) {
    const err = e instanceof JobError ? e : new JobError('PLATFORM_ERROR', 'Unexpected error.');
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: STATUS[err.code] },
    );
  }

  const id = newJobId();
  await createJob({ id, kind: 'write', url: '', destination: dest, total: tracks.length });
  if (idem) await redis.set(`idem:${idem}`, id, { ex: 600 });

  after(() =>
    executeWriteJob({
      id,
      input: {
        destination: dest,
        mode,
        playlistId: typeof body.playlistId === 'string' ? body.playlistId : undefined,
        name: typeof body.name === 'string' ? body.name : undefined,
        tracks,
        unmatchedCount: typeof body.unmatchedCount === 'number' ? body.unmatchedCount : 0,
      },
      deps: {
        auth,
        canAfford: dest === 'youtube' ? (u) => canAfford(u) : undefined,
        charge: dest === 'youtube' ? (u) => charge(u) : undefined,
        quotaResetHint: 'at midnight Pacific',
      },
    }),
  );

  return NextResponse.json({ jobId: id }, { status: 202 });
}
