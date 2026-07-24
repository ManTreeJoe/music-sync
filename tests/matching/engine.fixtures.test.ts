import { describe, it, expect, afterAll } from 'vitest';
import fixtures from '../fixtures/tracks.json';
import { matchTrack } from '../../src/lib/matching';
import type { MatchResult, Platform, Track } from '../../src/lib/providers/types';

interface FixtureCase {
  id: string;
  hardCase?: number;
  category: string;
  note: string;
  destinationPlatform: Platform;
  source: Track;
  isrcCandidates?: Track[];
  searchCandidates?: Track[];
  expect: {
    matched: boolean;
    confidence: 'high' | 'medium' | 'low' | 'none';
    tier: 1 | 2 | 3;
    minScore?: number;
    destinationPlatformId?: string;
  };
}

const cases = (fixtures as { cases: FixtureCase[] }).cases;

const run = (c: FixtureCase): MatchResult =>
  matchTrack({
    source: c.source,
    isrcCandidates: c.isrcCandidates,
    searchCandidates: c.searchCandidates,
    destinationPlatform: c.destinationPlatform,
  });

/** True if a result meets every expectation the case declares. */
function passes(c: FixtureCase, result: MatchResult): boolean {
  if (result.confidence !== c.expect.confidence) return false;
  if (result.tier !== c.expect.tier) return false;
  if (c.expect.matched !== (result.destination !== null)) return false;
  if (c.expect.minScore != null && (result.score == null || result.score < c.expect.minScore)) return false;
  if (c.expect.destinationPlatformId && result.destination?.platformId !== c.expect.destinationPlatformId) {
    return false;
  }
  return true;
}

describe('matching engine — hand-verified fixtures', () => {
  for (const c of cases) {
    const tag = c.hardCase ? `[hard ${c.hardCase}] ` : '';
    it(`${tag}${c.id} (${c.category})`, () => {
      const result = run(c);

      expect(result.confidence, 'confidence').toBe(c.expect.confidence);
      expect(result.tier, 'tier').toBe(c.expect.tier);

      if (c.expect.matched) {
        expect(result.destination, 'destination should be present').not.toBeNull();
      } else {
        expect(result.destination, 'destination should be null').toBeNull();
      }
      if (c.expect.minScore != null && result.score != null) {
        expect(result.score, 'score').toBeGreaterThanOrEqual(c.expect.minScore);
      }
      if (c.expect.destinationPlatformId) {
        expect(result.destination?.platformId, 'chosen candidate').toBe(c.expect.destinationPlatformId);
      }
    });
  }

  it('never marks a YouTube-involved match as high confidence', () => {
    for (const c of cases) {
      const youtubeInvolved = c.source.platform === 'youtube' || c.destinationPlatform === 'youtube';
      if (youtubeInvolved) {
        expect(run(c).confidence, `${c.id} must not be high`).not.toBe('high');
      }
    }
  });

  it('covers all 10 required hard cases (9 here + local-file skip in spotifyItems)', () => {
    const present = new Set(cases.map((c) => c.hardCase).filter(Boolean));
    for (let n = 1; n <= 9; n++) expect(present.has(n), `hard case ${n}`).toBe(true);
    // Hard case 10 (local-file skip) is a read-layer concern; see spotifyItems.test.ts.
  });

  it('has at least 50 hand-verified cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
  });

  // Per-category accuracy report — printed on demand via:
  //   npm run test:matching:report
  afterAll(() => {
    if (process.env.MATCH_REPORT !== '1') return;

    const byCat = new Map<string, { pass: number; total: number }>();
    for (const c of cases) {
      const row = byCat.get(c.category) ?? { pass: 0, total: 0 };
      row.total += 1;
      if (passes(c, run(c))) row.pass += 1;
      byCat.set(c.category, row);
    }

    const rows = [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let pass = 0;
    let total = 0;
    const lines: string[] = [];
    const pad = Math.max(...rows.map(([cat]) => cat.length), 'CATEGORY'.length);
    lines.push('');
    lines.push('Matching accuracy by category');
    lines.push('─'.repeat(pad + 20));
    lines.push(`${'CATEGORY'.padEnd(pad)}   PASS/TOTAL   ACCURACY`);
    for (const [cat, r] of rows) {
      pass += r.pass;
      total += r.total;
      const acc = ((r.pass / r.total) * 100).toFixed(0).padStart(3);
      const flag = r.pass === r.total ? '' : '  ⚠';
      lines.push(`${cat.padEnd(pad)}   ${String(r.pass).padStart(4)}/${String(r.total).padEnd(5)}  ${acc}%${flag}`);
    }
    lines.push('─'.repeat(pad + 20));
    lines.push(`${'AGGREGATE'.padEnd(pad)}   ${String(pass).padStart(4)}/${String(total).padEnd(5)}  ${((pass / total) * 100).toFixed(1)}%`);
    lines.push('');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  });
});
