import { describe, it, expect, beforeEach } from 'vitest';
import { acquire } from '../src/lib/ratelimit';
import { redis, _resetRedis } from '../src/lib/redis';

beforeEach(() => _resetRedis());

describe('sliding-window rate limiter', () => {
  it('admits requests under the limit immediately', async () => {
    // Well under Spotify's 160/min — should not block.
    for (let i = 0; i < 5; i++) await acquire('spotify');
    expect(await redis.zcard('rl:spotify')).toBe(5);
  });

  it('drops entries outside the window on the next acquire', async () => {
    // Seed an old entry (2 minutes ago) directly, then acquire.
    await redis.zadd('rl:spotify', 'old', Date.now() - 120_000);
    await acquire('spotify');
    // The stale one is pruned; only the fresh acquire remains.
    expect(await redis.zcard('rl:spotify')).toBe(1);
  });
});
