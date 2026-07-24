// lib/format.ts — small display helpers, safe on client and server.

import type { Platform, Track } from './providers/types';

export const PLATFORM_LABEL: Record<Platform, string> = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  youtube: 'YouTube Music',
};

/** Milliseconds → m:ss, or an em dash when unknown. */
export function msToClock(ms?: number): string {
  if (ms == null) return '—';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A deep-search URL on the destination platform for an unmatched track. */
export function deepSearchUrl(platform: Platform, track: Track): string {
  const term = `${track.title} ${track.artists[0] ?? ''}`.trim();
  const q = encodeURIComponent(term);
  switch (platform) {
    case 'apple':
      return `https://music.apple.com/us/search?term=${q}`;
    case 'spotify':
      return `https://open.spotify.com/search/${q}`;
    case 'youtube':
      return `https://music.youtube.com/search?q=${q}`;
  }
}
