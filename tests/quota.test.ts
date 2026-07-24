import { describe, it, expect, beforeEach } from 'vitest';
import {
  estimateYouTubeTransferCost,
  quotaKey,
  consumed,
  canAfford,
  charge,
  YOUTUBE_COSTS,
} from '../src/lib/quota';
import { _resetRedis } from '../src/lib/redis';

describe('estimateYouTubeTransferCost', () => {
  it('costs 50/track + 50, matching the ~15k-for-100 figure with searches', () => {
    expect(estimateYouTubeTransferCost(100)).toBe(5050);
    expect(estimateYouTubeTransferCost(100, 100)).toBe(15050);
  });
  it('search is the killer at 100 units', () => {
    expect(YOUTUBE_COSTS.search).toBe(100);
  });
});

describe('quota accounting (Redis-backed)', () => {
  beforeEach(() => _resetRedis());

  it('uses a Pacific-day key', () => {
    // 2026-07-24T05:00:00Z is still 2026-07-23 in Pacific (UTC-7).
    expect(quotaKey(new Date('2026-07-24T05:00:00Z'))).toBe('quota:youtube:2026-07-23');
  });

  it('tracks consumption and reserves headroom for reads', async () => {
    expect(await consumed()).toBe(0);
    await charge(9000);
    expect(await consumed()).toBe(9000);
    // budget 10000, reserve 500 -> can afford up to 500 more
    expect(await canAfford(500)).toBe(true);
    expect(await canAfford(501)).toBe(false);
  });
});
