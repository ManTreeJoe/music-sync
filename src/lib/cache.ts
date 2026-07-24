// lib/cache.ts
//
// ISRC→platform and text→results caches — the single biggest cost lever, since
// popular playlists overlap heavily. Negatives are cached too (shorter TTL) so a
// playlist full of genuinely-unavailable tracks doesn't re-burn search cost on
// every retry.

import { createHash } from 'node:crypto';
import { redis } from './redis';
import type { Platform, Track } from './providers/types';

const TTL = 60 * 60 * 24 * 30; // 30 days
const NEG_TTL = 60 * 60 * 24 * 3; // 3 days — catalogs change

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

const isrcKey = (p: Platform, isrc: string) => `isrc:${p}:${isrc}`;
const textKey = (p: Platform, title: string, artist: string) =>
  `txt:${p}:${sha1(`${title}|${artist}`.toLowerCase()).slice(0, 16)}`;

/** null = cache miss; [] = cached negative (looked up, nothing found). */
export function getCachedIsrc(p: Platform, isrc: string): Promise<Track[] | null> {
  return redis.get<Track[]>(isrcKey(p, isrc));
}
export async function setCachedIsrc(p: Platform, isrc: string, tracks: Track[]): Promise<void> {
  await redis.set(isrcKey(p, isrc), tracks, { ex: tracks.length ? TTL : NEG_TTL });
}

export function getCachedText(p: Platform, title: string, artist: string): Promise<Track[] | null> {
  return redis.get<Track[]>(textKey(p, title, artist));
}
export async function setCachedText(
  p: Platform,
  title: string,
  artist: string,
  tracks: Track[],
): Promise<void> {
  await redis.set(textKey(p, title, artist), tracks, { ex: tracks.length ? TTL : NEG_TTL });
}
