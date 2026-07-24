// lib/quota.ts
//
// YouTube Data API quota accounting. The 10,000 units/day is PROJECT-WIDE, so
// it's the binding constraint on YouTube-destination transfers. Preflight before
// enqueuing a write — never fail mid-job with a half-built playlist.
//
// Backed by Redis so the count is shared across serverless invocations. Google
// resets quota at midnight Pacific.

import { redis } from './redis';

export const YOUTUBE_COSTS = {
  search: 100,
  playlistInsert: 50,
  playlistItemsInsert: 50,
  playlistItemsList: 1,
  playlistsList: 1,
} as const;

/**
 * Total quota to transfer a playlist INTO YouTube: one playlists.insert, one
 * playlistItems.insert per track, plus one search.list per track that needs a
 * lookup (no cache hit).
 */
export function estimateYouTubeTransferCost(trackCount: number, searchCount = 0): number {
  return (
    YOUTUBE_COSTS.playlistInsert +
    trackCount * YOUTUBE_COSTS.playlistItemsInsert +
    searchCount * YOUTUBE_COSTS.search
  );
}

/** Google resets quota at midnight Pacific, NOT UTC. */
export function quotaKey(date = new Date()): string {
  const pacific = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return `quota:youtube:${pacific}`;
}

export async function consumed(key = quotaKey()): Promise<number> {
  return (await redis.get<number>(key)) ?? 0;
}

/** Reserve headroom so cheap reads never starve behind an expensive write. */
export async function canAfford(
  units: number,
  budget = Number(process.env.YOUTUBE_DAILY_QUOTA ?? 10000),
  reserve = 500,
): Promise<boolean> {
  return (await consumed()) + units <= budget - reserve;
}

export async function charge(units: number, key = quotaKey()): Promise<void> {
  await redis.incrby(key, units);
  await redis.expire(key, 60 * 60 * 36);
}
