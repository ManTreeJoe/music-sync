// lib/matching/normalize.ts
//
// Pure string normalization. No imports from lib/providers/. No network.

const NOISE_PATTERNS = [
  // Allow leading tokens inside the bracket so "(2011 Remaster)" and
  // "(10th Anniversary Edition)" are caught, not just bracket-leading keywords.
  /\s*[\(\[][^\)\]]*?(remaster(ed)?|re-?master)[^\)\]]*[\)\]]/gi,
  /\s*[\(\[][^\)\]]*?(deluxe|expanded|special|anniversary)[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(bonus track|album version|single version)[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(radio edit|clean|explicit)[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(official\s+)?(music\s+)?video[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(hd|hq|4k|lyrics?|audio)\s*[\)\]]/gi,
  /\s*-\s*(remaster(ed)?|radio edit|single version)\b.*$/gi,
  /\s*\|\s*official.*$/gi,
];

const FEAT_PATTERN =
  /\s*[\(\[]?\s*(feat\.?|ft\.?|featuring|with)\s+([^\)\]]+)[\)\]]?/gi;

export interface Normalized {
  title: string;
  featured: string[];
  hadNoise: boolean;
}

export function normalizeTitle(raw: string): Normalized {
  let s = raw;
  const featured: string[] = [];

  // Extract featured artists BEFORE stripping — they're a scoring signal
  s = s.replace(FEAT_PATTERN, (_m, _kw, names) => {
    featured.push(...names.split(/,|&|and/i).map((n: string) => n.trim()));
    return ' ';
  });

  const before = s;
  for (const p of NOISE_PATTERNS) s = s.replace(p, ' ');
  const hadNoise = before !== s;

  s = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}\s'&]/gu, ' ') // keep letters/nums
    .replace(/\s+/g, ' ')
    .trim()
    // Recompose: NFD decomposed Hangul into conjoining jamo (and split accents
    // off their base letters). After stripping marks, recompose so non-Latin
    // titles equal their composed input again.
    .normalize('NFC');

  return { title: s, featured: featured.map((f) => f.toLowerCase()), hadNoise };
}

export function normalizeArtist(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '') // "The Beatles" ≡ "Beatles"
    .replace(/\s*-\s*topic$/, '') // YouTube auto-channels
    .replace(/[^\p{L}\p{N}\s'&]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
}
