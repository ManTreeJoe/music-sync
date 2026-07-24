import { describe, it, expect, beforeEach } from 'vitest';
import { redis, _resetRedis } from '../src/lib/redis';

beforeEach(() => _resetRedis());

describe('in-memory KV backend', () => {
  it('get/set round-trips objects', async () => {
    await redis.set('k', { a: 1 });
    expect(await redis.get<{ a: number }>('k')).toEqual({ a: 1 });
    expect(await redis.get('missing')).toBeNull();
  });

  it('set with nx does not overwrite', async () => {
    expect(await redis.set('lock', '1', { nx: true })).toBe('OK');
    expect(await redis.set('lock', '2', { nx: true })).toBeNull();
    expect(await redis.get('lock')).toBe('1');
  });

  it('ex expires the key', async () => {
    await redis.set('t', 'v', { ex: -1 }); // already expired
    expect(await redis.get('t')).toBeNull();
  });

  it('del removes a key so nx can re-acquire it', async () => {
    expect(await redis.set('lock', '1', { nx: true })).toBe('OK');
    await redis.del('lock');
    expect(await redis.get('lock')).toBeNull();
    // A released lock is re-acquirable — the idempotency retry case.
    expect(await redis.set('lock', '1', { nx: true })).toBe('OK');
  });

  it('incrby accumulates', async () => {
    expect(await redis.incrby('n', 5)).toBe(5);
    expect(await redis.incrby('n', 3)).toBe(8);
  });

  it('sorted set supports zadd/zremrangebyscore/zcard', async () => {
    await redis.zadd('z', 'a', 10);
    await redis.zadd('z', 'b', 20);
    await redis.zadd('z', 'c', 30);
    expect(await redis.zcard('z')).toBe(3);
    await redis.zremrangebyscore('z', 0, 20);
    expect(await redis.zcard('z')).toBe(1);
  });
});
