// lib/job/runJob.ts
//
// End-to-end: parse a source link, read the playlist, match every track against
// the destination, and assemble the review job. Providers are injectable so
// this is testable without network; by default it uses the registry.
//
// This runs the match synchronously — fine for the friend-group scale. Large
// playlists are what Inngest is for (build-order step 6); this is the MVP path.

import {
  getProvider as registryGetProvider,
  resolveProviderForUrl as registryResolveUrl,
} from '../providers';
import { HttpError } from '../http';
import { resolveMatches } from './resolve';
import { JobError, type ReviewJob } from './types';
import type { Auth, MusicProvider, Platform, Track } from '../providers/types';

const MAX_TRACKS = 5000; // refuse absurd playlists up front

export interface RunJobInput {
  url: string;
  destination: Platform;
}

export interface RunJobDeps {
  resolveProviderForUrl?: typeof registryResolveUrl;
  getProvider?: (platform: Platform) => MusicProvider;
  /** Auth for destination reads. Public matching needs no user auth. */
  auth?: Auth;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

interface SourceRead {
  name: string;
  url: string;
  tracks: Track[];
  skipped: { local: number; episodes: number; unavailable: number };
}

async function readSource(
  provider: MusicProvider,
  playlistId: string,
  auth: Auth,
): Promise<SourceRead> {
  const playlist = await provider.getPlaylist(playlistId, auth);
  if (playlist.trackCount > MAX_TRACKS) {
    throw new JobError(
      'PLAYLIST_TOO_LARGE',
      `That playlist has ${playlist.trackCount} tracks — over the ${MAX_TRACKS} limit.`,
    );
  }

  // Spotify reports what it skipped (local files, episodes); others don't.
  const detailed = provider as MusicProvider & {
    getTracksDetailed?: (id: string, auth: Auth) => Promise<SourceRead>;
  };
  if (typeof detailed.getTracksDetailed === 'function') {
    const d = await detailed.getTracksDetailed(playlistId, auth);
    return { name: playlist.name, url: playlist.url, tracks: d.tracks, skipped: d.skipped };
  }

  const tracks = await provider.getTracks(playlistId, auth);
  return {
    name: playlist.name,
    url: playlist.url,
    tracks,
    skipped: { local: 0, episodes: 0, unavailable: 0 },
  };
}

export async function runJob(input: RunJobInput, deps: RunJobDeps = {}): Promise<ReviewJob> {
  const resolveUrl = deps.resolveProviderForUrl ?? registryResolveUrl;
  const getProvider = deps.getProvider ?? registryGetProvider;
  const auth: Auth = deps.auth ?? { kind: 'none' };

  const parsed = resolveUrl(input.url);
  if (!parsed) {
    throw new JobError('INVALID_URL', "That doesn't look like a playlist link we recognize.");
  }
  const source = parsed.provider;

  if (source.platform === input.destination) {
    throw new JobError('SAME_PLATFORM', 'Source and destination are the same service.');
  }

  let dest: MusicProvider;
  try {
    dest = getProvider(input.destination);
  } catch {
    throw new JobError('PROVIDER_UNAVAILABLE', `${input.destination} isn't available yet.`);
  }

  try {
    const read = await readSource(source, parsed.playlistId, auth);
    const results = await resolveMatches(read.tracks, dest, auth, {
      concurrency: deps.concurrency,
      onProgress: deps.onProgress,
    });

    return {
      name: read.name,
      sourcePlatform: source.platform,
      destinationPlatform: input.destination,
      sourceUrl: read.url,
      results,
      skipped: read.skipped,
    };
  } catch (e) {
    throw toJobError(e);
  }
}

/** Map low-level failures to a coded, user-actionable JobError. */
function toJobError(e: unknown): JobError {
  if (e instanceof JobError) return e;

  // A missing credential surfaces as "Missing required env var: ...".
  if (e instanceof Error && /Missing required env var/.test(e.message)) {
    return new JobError(
      'PROVIDER_UNAVAILABLE',
      'The server is missing the API credentials for one of these services.',
    );
  }

  if (e instanceof HttpError) {
    switch (e.status) {
      case 404:
        return new JobError('PLAYLIST_NOT_FOUND', "We couldn't find that playlist. Is it public?");
      case 401:
        return new JobError('AUTH_REQUIRED', 'The service rejected our credentials.');
      case 403:
        return new JobError('PLAYLIST_PRIVATE', 'That playlist is private, or needs a sign-in to read.');
      case 429:
        return new JobError('RATE_LIMITED', 'The service is rate-limiting us. Try again in a moment.');
      default:
        return new JobError('PLATFORM_ERROR', `The music service returned an error (${e.status}).`);
    }
  }

  return new JobError('PLATFORM_ERROR', 'Something went wrong talking to the music service.');
}
