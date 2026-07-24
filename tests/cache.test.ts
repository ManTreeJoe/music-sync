import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedIsrc,
  setCachedIsrc,
  getCachedText,
  setCachedText,
} from '../src/lib/cache';
import { _resetRedis } from '../src/lib/redis';
import type { Track } from '../src/lib/providers/types';

const track = (t: Partial<Track>): Track => ({
  title: '',
  artists: [],
  platformId: '',
  platform: 'apple',
  ...t,
});

beforeEach(() => _resetRedis());

describe('match cache', () => {
  it('miss returns null; hit returns the stored tracks', async () => {
    expect(await getCachedIsrc('apple', 'ISRC1')).toBeNull();
    await setCachedIsrc('apple', 'ISRC1', [track({ platformId: 'a' })]);
    const hit = await getCachedIsrc('apple', 'ISRC1');
    expect(hit).toHaveLength(1);
    expect(hit![0].platformId).toBe('a');
  });

  it('a negative result ([]) is a hit, not a miss', async () => {
    await setCachedIsrc('apple', 'NONE', []);
    expect(await getCachedIsrc('apple', 'NONE')).toEqual([]); // hit-empty, distinct from null
  });

  it('text cache is keyed by title + artist + platform', async () => {
    await setCachedText('apple', 'Yellow', 'Coldplay', [track({ platformId: 'y' })]);
    expect(await getCachedText('apple', 'Yellow', 'Coldplay')).toHaveLength(1);
    expect(await getCachedText('apple', 'Yellow', 'Someone Else')).toBeNull();
    expect(await getCachedText('spotify', 'Yellow', 'Coldplay')).toBeNull();
  });
});
