// lib/job/resolve.ts
//
// Orchestration layer: ties a destination provider to the pure matching engine.
// For each source track it looks up the destination (Tier 1 ISRC first, Tier 2
// search only on a miss) and runs the engine. This is the glue an Inngest job
// or an API route calls; it's testable by injecting a fake provider.
//
// This lives OUTSIDE lib/matching/ on purpose — the matching engine stays pure
// and provider-free; provider orchestration belongs here.

import { matchTrack } from '../matching';
import { getCachedIsrc, setCachedIsrc, getCachedText, setCachedText } from '../cache';
import type { Auth, MatchResult, MusicProvider, Platform, Track } from '../providers/types';

export interface ResolveOptions {
  /** Max concurrent destination lookups. Keep modest to respect rate limits. */
  concurrency?: number;
  /** Called after each track resolves, for progress streaming. */
  onProgress?: (done: number, total: number) => void;
}

/** Resolve a single source track against the destination provider. */
export async function resolveMatch(
  source: Track,
  dest: MusicProvider,
  auth: Auth,
): Promise<MatchResult> {
  const destinationPlatform: Platform = dest.platform;

  // Tier 1 — ISRC, only if the source carries one and the platform supports it.
  // Cached: an ISRC → platform-id resolution is stable for ~30 days.
  if (source.isrc) {
    let isrcCandidates = await getCachedIsrc(destinationPlatform, source.isrc);
    if (isrcCandidates === null) {
      const maybe = dest.findByIsrc(source.isrc, auth);
      if (maybe) {
        isrcCandidates = await maybe;
        await setCachedIsrc(destinationPlatform, source.isrc, isrcCandidates);
      }
    }
    if (isrcCandidates && isrcCandidates.length > 0) {
      return matchTrack({ source, isrcCandidates, destinationPlatform });
    }
  }

  // Tier 2 — free-text search (cached; falls through to Tier 3 in matchTrack).
  const artist = source.artists[0] ?? '';
  let searchCandidates = await getCachedText(destinationPlatform, source.title, artist);
  if (searchCandidates === null) {
    searchCandidates = await dest.search(
      { title: source.title, artist, album: source.album, durationMs: source.durationMs },
      auth,
    );
    await setCachedText(destinationPlatform, source.title, artist, searchCandidates);
  }
  return matchTrack({ source, searchCandidates, destinationPlatform });
}

/**
 * Resolve many source tracks with bounded concurrency. Result order matches the
 * order of `sources`.
 */
export async function resolveMatches(
  sources: Track[],
  dest: MusicProvider,
  auth: Auth,
  options: ResolveOptions = {},
): Promise<MatchResult[]> {
  const concurrency = Math.max(1, options.concurrency ?? 5);
  const results = new Array<MatchResult>(sources.length);
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < sources.length) {
      const i = next++;
      results[i] = await resolveMatch(sources[i], dest, auth);
      done++;
      options.onProgress?.(done, sources.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, sources.length) }, worker);
  await Promise.all(workers);
  return results;
}
