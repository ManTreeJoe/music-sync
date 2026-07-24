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
import { JsonFileProvider, type ParsedImport } from '../providers/jsonFile';
import { resolveMatches } from './resolve';
import { JobError, type ReviewJob } from './types';
import { toJobError } from './errors';
import type { Auth, MusicProvider, Platform, Track } from '../providers/types';

const MAX_TRACKS = 5000; // refuse absurd playlists up front

export interface RunJobInput {
  /** A platform playlist link. Omit when importing from JSON. */
  url?: string;
  /** A parsed JSON export used as the source instead of a link. */
  importSource?: ParsedImport;
  destination: Platform;
}

export interface RunJobDeps {
  resolveProviderForUrl?: typeof registryResolveUrl;
  getProvider?: (platform: Platform) => MusicProvider;
  /** Auth for reading the SOURCE, chosen by platform (a user token unlocks
   *  private playlists). Defaults to public (no auth). */
  sourceAuthFor?: (platform: Platform) => Auth;
  /** Auth for destination matching. Public matching needs no user auth. */
  destAuth?: Auth;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

const noAuth = (): Auth => ({ kind: 'none' });

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
  const sourceAuthFor = deps.sourceAuthFor ?? noAuth;
  const destAuth: Auth = deps.destAuth ?? { kind: 'none' };

  // Two source shapes: a parsed JSON import, or a platform link. The JSON path
  // wraps the parsed doc in a read-only provider so the rest is identical.
  let source: MusicProvider;
  let playlistId: string;
  if (input.importSource) {
    source = new JsonFileProvider(input.importSource);
    playlistId = 'import';
  } else {
    const parsed = resolveUrl(input.url ?? '');
    if (!parsed) {
      throw new JobError('INVALID_URL', "That doesn't look like a playlist link we recognize.");
    }
    source = parsed.provider;
    playlistId = parsed.playlistId;
  }

  // A link into the same service it came from is a no-op; a JSON re-import to
  // its origin platform is a legitimate "restore", so only guard the link path.
  if (!input.importSource && source.platform === input.destination) {
    throw new JobError('SAME_PLATFORM', 'Source and destination are the same service.');
  }

  let dest: MusicProvider;
  try {
    dest = getProvider(input.destination);
  } catch {
    throw new JobError('PROVIDER_UNAVAILABLE', `${input.destination} isn't available yet.`);
  }

  try {
    const read = await readSource(source, playlistId, sourceAuthFor(source.platform));
    const results = await resolveMatches(read.tracks, dest, destAuth, {
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
