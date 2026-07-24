// app/api/jobs/route.ts
//
// Kick off a background match. Returns a job id immediately; the client streams
// progress from /api/jobs/{id}/stream and reads the finished review from
// /api/jobs/{id}. Two execution backends, same job-store contract:
//
//   • Inngest (when INNGEST_ENABLED=true and the source read is public) —
//     durable, survives long past a single function's lifetime. Best for large
//     playlists. Background reads are public; no tokens go into the event.
//   • In-process via after() — runs after the response is sent, using the
//     caller's session tokens (they never leave the process). Used when the
//     source needs a user token, or when Inngest isn't configured.

import { NextResponse, after } from 'next/server';
import { resolveProviderForUrl } from '@/lib/providers';
import { createJob, newJobId } from '@/lib/job/store';
import { executeMatchJob } from '@/lib/job/execute';
import { parseImportText } from '@/lib/providers/jsonFile';
import { inngest, EVENTS } from '@/inngest/client';
import { JobError } from '@/lib/job/types';
import type { Auth, Platform } from '@/lib/providers/types';
import { getSession } from '@/lib/session';
import { getValidSpotifyToken } from '@/lib/auth/spotifyOAuth';
import { getValidGoogleToken } from '@/lib/auth/googleOAuth';
import { getAppleDeveloperToken } from '@/lib/auth/appleToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DESTINATIONS: Platform[] = ['spotify', 'apple', 'youtube'];

const inngestEnabled = process.env.INNGEST_ENABLED === 'true';

export async function POST(req: Request) {
  let body: { url?: unknown; json?: unknown; destination?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: 'Expected a JSON body.' } },
      { status: 400 },
    );
  }

  const destination = body.destination;
  if (typeof destination !== 'string' || !DESTINATIONS.includes(destination as Platform)) {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: 'Pick a destination service.' } },
      { status: 400 },
    );
  }
  const dest = destination as Platform;

  // Re-import path: the source is a pasted/uploaded JSON export, not a link.
  // No auth, no network read, no Inngest — parse and match in-process.
  if (typeof body.json === 'string' && body.json.trim()) {
    let imported;
    try {
      imported = parseImportText(body.json);
    } catch (e) {
      const err = e instanceof JobError ? e : new JobError('INVALID_URL', 'That import failed.');
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    const id = newJobId();
    await createJob({ id, kind: 'match', url: imported.playlist.url ?? '', destination: dest, total: 0 });
    after(() => executeMatchJob({ id, importSource: imported, destination: dest }));
    return NextResponse.json({ jobId: id }, { status: 202 });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: 'Paste a playlist link first.' } },
      { status: 400 },
    );
  }

  // Validate the link up front so a doomed job never reaches the store.
  const parsed = resolveProviderForUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: "That doesn't look like a playlist link we recognize." } },
      { status: 400 },
    );
  }
  const sourcePlatform = parsed.provider.platform;
  if (sourcePlatform === dest) {
    return NextResponse.json(
      { error: { code: 'SAME_PLATFORM', message: 'Source and destination are the same service.' } },
      { status: 400 },
    );
  }

  // Resolve any connected-account tokens so private source playlists can be
  // read. These stay in-process — never serialized into an Inngest event.
  const session = await getSession();

  let spotifyToken: string | null = null;
  if (session.spotify && process.env.SPOTIFY_CLIENT_ID) {
    try {
      spotifyToken = await getValidSpotifyToken(session, { clientId: process.env.SPOTIFY_CLIENT_ID });
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
    if (platform === 'spotify' && spotifyToken) return { kind: 'bearer', token: spotifyToken };
    if (platform === 'youtube' && googleToken) return { kind: 'bearer', token: googleToken };
    if (platform === 'apple' && appleUserToken) {
      return { kind: 'apple', developerToken: getAppleDeveloperToken(), userToken: appleUserToken };
    }
    return { kind: 'none' };
  };

  // A private source needs the user's token, which Inngest can't carry — so
  // route those in-process. Only public reads are eligible for Inngest.
  const sourceIsPublic = sourceAuthFor(sourcePlatform).kind === 'none';

  const id = newJobId();
  await createJob({ id, kind: 'match', url, destination: dest, total: 0 });

  if (inngestEnabled && sourceIsPublic) {
    await inngest.send({ name: EVENTS.matchRequested, data: { jobId: id, url, destination: dest } });
  } else {
    // Run after the response is sent. Tokens are captured in this closure and
    // never persisted. Failures are recorded on the job record by executeMatchJob.
    after(() => executeMatchJob({ id, url, destination: dest, deps: { sourceAuthFor } }));
  }

  return NextResponse.json({ jobId: id }, { status: 202 });
}
