// lib/matching/engine.ts
//
// Tier orchestration. PURE: operates only on Track values. The provider layer
// fetches ISRC/search candidates over the network and passes them in here;
// this module never touches lib/providers/ beyond the shared types. That
// separation is what makes the whole engine testable with zero network access.

import type { Track, MatchResult, Confidence, Platform } from '../providers/types';
import { scoreMatch, negativeSignal } from './score';

/** Tier-2 score thresholds. Do not auto-accept below AUTO_ACCEPT. */
export const THRESHOLDS = {
  AUTO_ACCEPT: 0.9, // >= this: confidence 'medium'
  REVIEW: 0.7, // [REVIEW, AUTO_ACCEPT): confidence 'low', surface for review
} as const;

/** How many alternatives to keep for the review UI. */
const MAX_ALTERNATIVES = 5;

export interface MatchInput {
  source: Track;
  /** Tier-1 candidates from an ISRC lookup. Empty/absent if none or no ISRC. */
  isrcCandidates?: Track[];
  /** Tier-2 candidates from a free-text search. */
  searchCandidates?: Track[];
  /** The platform we're matching INTO — needed to enforce the YouTube ceiling. */
  destinationPlatform: Platform;
}

/**
 * YouTube exposes no ISRC, so a YouTube match can never be authoritative.
 * Cap confidence at 'medium' whenever either side of the match is YouTube.
 */
function capConfidence(
  confidence: Confidence,
  source: Track,
  destinationPlatform: Platform,
): Confidence {
  const youtubeInvolved =
    source.platform === 'youtube' || destinationPlatform === 'youtube';
  if (youtubeInvolved && confidence === 'high') return 'medium';
  return confidence;
}

/**
 * Tier 1 — ISRC. Authoritative. Among multiple ISRC hits (remasters, regional
 * editions), prefer an exact duration match, then fall back to the smallest
 * duration delta. Confidence 'high' (capped to 'medium' for YouTube).
 */
function matchByIsrc(input: MatchInput): MatchResult | null {
  const { source, isrcCandidates, destinationPlatform } = input;
  if (!isrcCandidates || isrcCandidates.length === 0) return null;

  const ranked = [...isrcCandidates].sort((a, b) => {
    const da = durationDelta(source, a);
    const db = durationDelta(source, b);
    return da - db;
  });

  const [best, ...rest] = ranked;
  return {
    source,
    destination: best,
    confidence: capConfidence('high', source, destinationPlatform),
    tier: 1,
    alternatives: rest.slice(0, MAX_ALTERNATIVES),
  };
}

function durationDelta(a: Track, b: Track): number {
  if (a.durationMs == null || b.durationMs == null) return Number.MAX_SAFE_INTEGER;
  return Math.abs(a.durationMs - b.durationMs);
}

/**
 * Tier 2 — normalized fuzzy match. Triggered only on a Tier-1 miss. Rejects
 * candidates carrying negative signals (live/cover/karaoke/...) not present in
 * the source, scores the rest, and applies the review thresholds.
 */
function matchBySearch(input: MatchInput): MatchResult {
  const { source, searchCandidates, destinationPlatform } = input;

  const scored = (searchCandidates ?? [])
    .filter((c) => negativeSignal(source, c) === null)
    .map((c) => ({ track: c, score: scoreMatch(source, c) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return unmatched(source, 'No candidate survived filtering');
  }

  const best = scored[0];
  const alternatives = scored.slice(1, 1 + MAX_ALTERNATIVES).map((s) => s.track);

  if (best.score >= THRESHOLDS.AUTO_ACCEPT) {
    return {
      source,
      destination: best.track,
      confidence: capConfidence('medium', source, destinationPlatform),
      score: best.score,
      tier: 2,
      alternatives,
    };
  }

  if (best.score >= THRESHOLDS.REVIEW) {
    return {
      source,
      destination: best.track,
      confidence: 'low',
      score: best.score,
      tier: 2,
      alternatives,
      reason: 'Below auto-accept threshold — needs review',
    };
  }

  // Best candidate is too weak to even surface as a probable match.
  return {
    ...unmatched(source, `Best score ${best.score.toFixed(2)} below review threshold`),
    alternatives,
  };
}

/** Tier 3 — unmatched. Never silently dropped; keeps original metadata. */
function unmatched(source: Track, reason: string): MatchResult {
  return {
    source,
    destination: null,
    confidence: 'none',
    tier: 3,
    reason,
  };
}

/**
 * Match a single source track. Tries Tier 1 (ISRC) first, then Tier 2 (fuzzy),
 * then falls through to Tier 3 (unmatched).
 */
export function matchTrack(input: MatchInput): MatchResult {
  const tier1 = matchByIsrc(input);
  if (tier1) return tier1;
  return matchBySearch(input);
}
