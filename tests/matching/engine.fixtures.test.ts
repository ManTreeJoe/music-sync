import { describe, it, expect } from 'vitest';
import fixtures from '../fixtures/tracks.json';
import { matchTrack } from '../../src/lib/matching';
import type { Platform, Track } from '../../src/lib/providers/types';

interface FixtureCase {
  id: string;
  hardCase: number;
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

describe('matching engine — hand-verified hard cases', () => {
  for (const c of cases) {
    it(`[${c.hardCase}] ${c.id}: ${c.note}`, () => {
      const result = matchTrack({
        source: c.source,
        isrcCandidates: c.isrcCandidates,
        searchCandidates: c.searchCandidates,
        destinationPlatform: c.destinationPlatform,
      });

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
        expect(result.destination?.platformId, 'chosen candidate').toBe(
          c.expect.destinationPlatformId,
        );
      }
    });
  }

  it('never marks a YouTube-involved match as high confidence', () => {
    for (const c of cases) {
      const youtubeInvolved =
        c.source.platform === 'youtube' || c.destinationPlatform === 'youtube';
      const result = matchTrack({
        source: c.source,
        isrcCandidates: c.isrcCandidates,
        searchCandidates: c.searchCandidates,
        destinationPlatform: c.destinationPlatform,
      });
      if (youtubeInvolved) {
        expect(result.confidence, `${c.id} must not be high`).not.toBe('high');
      }
    }
  });
});
