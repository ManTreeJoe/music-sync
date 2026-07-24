// lib/redis.ts
//
// A tiny KV abstraction with two backends: Upstash Redis (REST) when configured,
// otherwise an in-memory map. The in-memory backend keeps local dev and tests
// working with no infra; production sets UPSTASH_REDIS_REST_URL/TOKEN and gets a
// shared store across serverless invocations. The surface is only what the
// cache, quota, rate-limiter, and idempotency need.

import { Redis } from '@upstash/redis';

export interface Kv {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<'OK' | null>;
  del(key: string): Promise<void>;
  incrby(key: string, n: number): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  zadd(key: string, member: string, score: number): Promise<void>;
  zremrangebyscore(key: string, min: number, max: number): Promise<void>;
  zcard(key: string): Promise<number>;
}

class MemoryKv implements Kv {
  private store = new Map<string, { value: unknown; expireAt?: number }>();
  private zsets = new Map<string, { members: Map<string, number>; expireAt?: number }>();

  private live(key: string): boolean {
    const e = this.store.get(key);
    if (!e) return false;
    if (e.expireAt && e.expireAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }
  private zlive(key: string) {
    const z = this.zsets.get(key);
    if (!z) return null;
    if (z.expireAt && z.expireAt <= Date.now()) {
      this.zsets.delete(key);
      return null;
    }
    return z;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.live(key) ? (this.store.get(key)!.value as T) : null;
  }
  async set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<'OK' | null> {
    if (opts?.nx && this.live(key)) return null;
    this.store.set(key, { value, expireAt: opts?.ex ? Date.now() + opts.ex * 1000 : undefined });
    return 'OK';
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.zsets.delete(key);
  }
  async incrby(key: string, n: number): Promise<number> {
    const cur = this.live(key) ? Number(this.store.get(key)!.value) || 0 : 0;
    const next = cur + n;
    const prev = this.store.get(key);
    this.store.set(key, { value: next, expireAt: prev?.expireAt });
    return next;
  }
  async expire(key: string, seconds: number): Promise<void> {
    const at = Date.now() + seconds * 1000;
    const e = this.store.get(key);
    if (e) e.expireAt = at;
    const z = this.zsets.get(key);
    if (z) z.expireAt = at;
  }
  async zadd(key: string, member: string, score: number): Promise<void> {
    const z = this.zlive(key) ?? { members: new Map<string, number>() };
    z.members.set(member, score);
    this.zsets.set(key, z);
  }
  async zremrangebyscore(key: string, min: number, max: number): Promise<void> {
    const z = this.zlive(key);
    if (!z) return;
    for (const [m, s] of z.members) if (s >= min && s <= max) z.members.delete(m);
  }
  async zcard(key: string): Promise<number> {
    return this.zlive(key)?.members.size ?? 0;
  }
  _reset() {
    this.store.clear();
    this.zsets.clear();
  }
}

class UpstashKv implements Kv {
  constructor(private r: Redis) {}
  get<T>(key: string) {
    return this.r.get<T>(key);
  }
  async set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<'OK' | null> {
    const res = await this.r.set(key, value, opts as Parameters<Redis['set']>[2]);
    return res as 'OK' | null;
  }
  async del(key: string): Promise<void> {
    await this.r.del(key);
  }
  incrby(key: string, n: number) {
    return this.r.incrby(key, n);
  }
  async expire(key: string, seconds: number) {
    await this.r.expire(key, seconds);
  }
  async zadd(key: string, member: string, score: number) {
    await this.r.zadd(key, { score, member });
  }
  async zremrangebyscore(key: string, min: number, max: number) {
    await this.r.zremrangebyscore(key, min, max);
  }
  zcard(key: string) {
    return this.r.zcard(key);
  }
}

const upstashConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

export const redis: Kv = upstashConfigured
  ? new UpstashKv(
      new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      }),
    )
  : new MemoryKv();

/** Whether the shared (Upstash) store is active. */
export const redisShared = upstashConfigured;

/** Test hook — clears the in-memory backend (no-op with Upstash). */
export function _resetRedis(): void {
  if (redis instanceof MemoryKv) redis._reset();
}
