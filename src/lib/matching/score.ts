// lib/matching/score.ts
//
// Pure scoring functions. No imports from lib/providers/. No network.

import type { Track } from '../providers/types';
import { normalizeTitle, normalizeArtist } from './normalize';
import { jaroWinkler } from './jaroWinkler';

/**
 * Duration similarity in [0, 1]. Unknown durations score 0.5 (neutral) rather
 * than 0 — a missing duration is not evidence of a mismatch.
 */
export function durationScore(a?: number, b?: number): number {
  if (a == null || b == null) return 0.5; // unknown ≠ mismatch
  const diff = Math.abs(a - b) / 1000;
  if (diff <= 2) return 1;
  if (diff >= 10) return 0;
  return 1 - (diff - 2) / 8;
}

export function scoreMatch(source: Track, candidate: Track): number {
  const s = normalizeTitle(source.title);
  const c = normalizeTitle(candidate.title);

  const titleSim = jaroWinkler(s.title, c.title);
  const artistSim = Math.max(
    ...source.artists.map((sa) =>
      Math.max(
        ...candidate.artists.map((ca) =>
          jaroWinkler(normalizeArtist(sa), normalizeArtist(ca)),
        ),
      ),
    ),
  );
  const durSim = durationScore(source.durationMs, candidate.durationMs);

  let score = titleSim * 0.5 + artistSim * 0.3 + durSim * 0.2;

  // Featured-artist agreement is a small bonus, not a requirement
  if (s.featured.length && c.featured.length) {
    const overlap = s.featured.filter((f) =>
      c.featured.some((cf) => jaroWinkler(f, cf) > 0.9),
    ).length;
    if (overlap) score = Math.min(1, score + 0.03);
  }

  return score;
}

/**
 * Terms that indicate a fundamentally different recording. A candidate whose
 * normalized title contains one of these is rejected outright — UNLESS the same
 * term is present in the source title (then it's not a surprise).
 *
 * "Made famous by" and "tribute" are karaoke-label tells that appear constantly
 * in search results; filtering them is worth several points of accuracy alone.
 */
export const REJECT_IF_ABSENT_IN_SOURCE = [
  'live',
  'remix',
  'cover',
  'karaoke',
  'instrumental',
  'acoustic',
  'demo',
  'reaction',
  'sped up',
  'slowed',
  'nightcore',
  '8d audio',
  'tribute',
  'made famous by',
];

/**
 * Returns the negative-signal term that disqualifies `candidate` relative to
 * `source`, or null if the candidate is clean. Comparison is done on the raw
 * (lowercased) titles because the noise-stripping in normalizeTitle would
 * remove some of these very terms before we could check for them.
 */
export function negativeSignal(source: Track, candidate: Track): string | null {
  const src = source.title.toLowerCase();
  const cand = candidate.title.toLowerCase();
  for (const term of REJECT_IF_ABSENT_IN_SOURCE) {
    if (cand.includes(term) && !src.includes(term)) return term;
  }
  return null;
}
