import { describe, it, expect, beforeEach } from 'vitest';
import { isValidPlaylistId } from '../src/lib/providers/playlistId';
import { tryConsume, clientIp } from '../src/lib/ratelimit';
import { _resetRedis } from '../src/lib/redis';

beforeEach(() => _resetRedis());

describe('isValidPlaylistId', () => {
  it('accepts well-formed ids per platform', () => {
    expect(isValidPlaylistId('spotify', '37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
    expect(isValidPlaylistId('apple', 'p.AWXoZoNuekzXlN0')).toBe(true);
    expect(isValidPlaylistId('apple', 'pl.u-abc123')).toBe(true);
    expect(isValidPlaylistId('youtube', 'PLabc_-123')).toBe(true);
  });

  it('rejects path-injection and malformed ids', () => {
    expect(isValidPlaylistId('spotify', '../../me')).toBe(false);
    expect(isValidPlaylistId('spotify', 'short')).toBe(false); // not 22 chars
    expect(isValidPlaylistId('apple', 'p.abc/tracks?x=1')).toBe(false);
    expect(isValidPlaylistId('youtube', 'ab cd')).toBe(false); // space
    expect(isValidPlaylistId('spotify', '')).toBe(false);
    expect(isValidPlaylistId('youtube', 'a'.repeat(200))).toBe(false); // too long
  });
});

describe('tryConsume — non-blocking IP limiter', () => {
  it('allows up to the limit, then denies with a retry-after', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await tryConsume('k', 3, 60_000)).ok).toBe(true);
    }
    const denied = await tryConsume('k', 3, 60_000);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
  });

  it('keeps separate buckets per key', async () => {
    await tryConsume('a', 1, 60_000);
    expect((await tryConsume('a', 1, 60_000)).ok).toBe(false);
    expect((await tryConsume('b', 1, 60_000)).ok).toBe(true); // independent
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for hop', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } });
    expect(clientIp(req)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip, then unknown', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '198.51.100.2' } }))).toBe('198.51.100.2');
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});
