import { describe, it, expect } from 'vitest';
import { jaro, jaroWinkler } from '../../src/lib/matching/jaroWinkler';
import { durationScore, scoreMatch, negativeSignal } from '../../src/lib/matching/score';
import type { Track } from '../../src/lib/providers/types';

const track = (t: Partial<Track>): Track => ({
  title: '',
  artists: [],
  platformId: 'x',
  platform: 'spotify',
  ...t,
});

describe('jaroWinkler', () => {
  it('is 1 for identical strings', () => {
    expect(jaroWinkler('martha', 'martha')).toBe(1);
  });

  it('is 0 for no shared characters', () => {
    expect(jaro('abc', 'xyz')).toBe(0);
  });

  it('rewards a shared prefix over plain Jaro', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeGreaterThan(jaro('martha', 'marhta'));
  });

  it('handles empty strings without throwing', () => {
    expect(jaroWinkler('', '')).toBe(1);
    expect(jaroWinkler('a', '')).toBe(0);
  });
});

describe('durationScore', () => {
  it('is 1 within 2 seconds', () => {
    expect(durationScore(200000, 201500)).toBe(1);
  });

  it('is 0 at or beyond 10 seconds', () => {
    expect(durationScore(200000, 211000)).toBe(0);
  });

  it('is neutral (0.5) when a duration is unknown', () => {
    expect(durationScore(undefined, 200000)).toBe(0.5);
    expect(durationScore(200000, undefined)).toBe(0.5);
  });

  it('degrades linearly between 2 and 10 seconds', () => {
    expect(durationScore(200000, 206000)).toBeCloseTo(0.5, 5); // 6s diff
  });
});

describe('scoreMatch', () => {
  it('scores an exact title+artist+duration match at ~1', () => {
    const a = track({ title: 'Yellow', artists: ['Coldplay'], durationMs: 269000 });
    const b = track({ title: 'Yellow', artists: ['Coldplay'], durationMs: 269000 });
    expect(scoreMatch(a, b)).toBeGreaterThanOrEqual(0.99);
  });

  it('matches across remaster noise', () => {
    const a = track({ title: 'Bohemian Rhapsody - Remastered 2011', artists: ['Queen'], durationMs: 354000 });
    const b = track({ title: 'Bohemian Rhapsody', artists: ['Queen'], durationMs: 354000 });
    expect(scoreMatch(a, b)).toBeGreaterThanOrEqual(0.9);
  });

  it('penalizes a wrong artist', () => {
    const a = track({ title: 'Alive', artists: ['Sia'], durationMs: 244000 });
    const b = track({ title: 'Alive', artists: ['Pearl Jam'], durationMs: 341000 });
    expect(scoreMatch(a, b)).toBeLessThan(0.7);
  });
});

describe('negativeSignal', () => {
  const source = track({ title: 'Someone Like You', artists: ['Adele'] });

  it('rejects a karaoke "made famous by" candidate', () => {
    const cand = track({ title: 'Someone Like You (Made Famous by Adele)' });
    expect(negativeSignal(source, cand)).toBe('made famous by');
  });

  it('rejects a live candidate when the source is not live', () => {
    const cand = track({ title: 'Someone Like You (Live)' });
    expect(negativeSignal(source, cand)).toBe('live');
  });

  it('allows a live candidate when the source is itself live', () => {
    const liveSource = track({ title: 'Someone Like You (Live at the BRITs)' });
    const cand = track({ title: 'Someone Like You (Live)' });
    expect(negativeSignal(liveSource, cand)).toBeNull();
  });

  it('passes a clean candidate', () => {
    const cand = track({ title: 'Someone Like You' });
    expect(negativeSignal(source, cand)).toBeNull();
  });
});
