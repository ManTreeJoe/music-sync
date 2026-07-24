// lib/providers/playlistId.ts
//
// Strict per-platform playlist-id validation. The brief's security rule:
// "Validate playlist IDs against a strict regex before interpolating into any
// URL." Reads go through parseUrl (already validated), but a write's append
// target comes straight from the request body — this is the guard for it.

import type { Platform } from './types';

const PATTERNS: Record<Platform, RegExp> = {
  // Spotify base-62 id, exactly 22 chars.
  spotify: /^[A-Za-z0-9]{22}$/,
  // Apple library (p.xxx) or catalog (pl.xxx) id.
  apple: /^(pl|p)\.[A-Za-z0-9-]+$/,
  // YouTube playlist id: letters, digits, dash, underscore.
  youtube: /^[A-Za-z0-9_-]+$/,
};

export function isValidPlaylistId(platform: Platform, id: string): boolean {
  const re = PATTERNS[platform];
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && re.test(id);
}
