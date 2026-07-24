// lib/matching/index.ts
//
// Public surface of the matching engine. This module and everything it exports
// is PURE — zero imports from lib/providers/ except the shared types. That is
// the single most important structural rule in the project: it's what lets the
// matching logic be unit-tested with no network access.

export { normalizeTitle, normalizeArtist } from './normalize';
export type { Normalized } from './normalize';

export {
  durationScore,
  scoreMatch,
  negativeSignal,
  REJECT_IF_ABSENT_IN_SOURCE,
} from './score';

export { jaro, jaroWinkler } from './jaroWinkler';

export { matchTrack, THRESHOLDS } from './engine';
export type { MatchInput } from './engine';
