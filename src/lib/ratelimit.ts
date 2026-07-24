// lib/ratelimit.ts
//
// Sliding-window rate limiter shared across instances via a Redis sorted set,
// keyed by platform. Keeps us under each service's real limit even when several
// serverless functions run concurrently. Backed by the in-memory KV when Upstash
// isn't configured (single-process dev/test).

import { redis } from './redis';
import type { Platform } from './providers/types';

const LIMITS: Record<Platform, { max: number; windowMs: number }> = {
  spotify: { max: 160, windowMs: 60_000 }, // under the ~180 real limit
  apple: { max: 900, windowMs: 60_000 }, // ~15/s, undocumented
  youtube: { max: 300, windowMs: 60_000 }, // quota-bound, not rate-bound
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Block until a request slot is free for this platform. */
export async function acquire(platform: Platform): Promise<void> {
  const { max, windowMs } = LIMITS[platform];
  const key = `rl:${platform}`;

  for (let attempt = 0; attempt < 50; attempt++) {
    const now = Date.now();
    await redis.zremrangebyscore(key, 0, now - windowMs);
    const count = await redis.zcard(key);

    if (count < max) {
      await redis.zadd(key, `${now}:${Math.random()}`, now);
      await redis.expire(key, Math.ceil(windowMs / 1000) + 1);
      return;
    }
    await sleep(200 + Math.random() * 300);
  }
  throw new Error(`Rate limit acquire timeout: ${platform}`);
}

/**
 * Non-blocking sliding-window check for an arbitrary key (e.g. an IP on a public
 * endpoint). Returns whether the request is allowed and, if not, roughly how
 * many seconds until a slot frees. Unlike acquire(), it never waits.
 */
export async function tryConsume(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  const now = Date.now();
  const k = `rlip:${key}`;
  await redis.zremrangebyscore(k, 0, now - windowMs);
  const count = await redis.zcard(k);
  if (count >= max) {
    return { ok: false, retryAfter: Math.ceil(windowMs / 1000) };
  }
  await redis.zadd(k, `${now}:${Math.random()}`, now);
  await redis.expire(k, Math.ceil(windowMs / 1000) + 1);
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
