// lib/matching/jaroWinkler.ts
//
// Vendored Jaro-Winkler string similarity. Prefix weighting matters a lot for
// track titles ("Bohemian Rhapsody" vs "Bohemian Rhapsody - Remastered"), which
// is why we use this rather than a plain Levenshtein ratio.
//
// Returns a similarity in [0, 1]. 1 == identical, 0 == no shared characters.

/** Jaro similarity — the base metric Winkler adjusts. */
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  // Two chars match only if they're within this window of each other.
  const matchWindow = Math.max(0, Math.floor(Math.max(aLen, bLen) / 2) - 1);

  const aMatches = new Array<boolean>(aLen).fill(false);
  const bMatches = new Array<boolean>(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, bLen);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions: matched chars that are out of order.
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  const m = matches;
  return (m / aLen + m / bLen + (m - transpositions) / m) / 3;
}

/**
 * Jaro-Winkler: boosts scores for strings that share a common prefix.
 * `p` is the prefix scaling factor (standard is 0.1); prefix capped at 4 chars.
 */
export function jaroWinkler(a: string, b: string, p = 0.1): number {
  const j = jaro(a, b);
  if (j === 0) return 0;

  let prefix = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return j + prefix * p * (1 - j);
}
