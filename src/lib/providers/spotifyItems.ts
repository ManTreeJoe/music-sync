// lib/providers/spotifyItems.ts
//
// Pure helpers for turning raw Spotify playlist items into normalized Tracks.
// Split out from the network adapter so the fiddly skip/relink rules — the ones
// that crash naive code — are unit-testable with no network.

import type { Track } from './types';

/** The subset of Spotify's item shape we request via `fields=`. */
export interface SpotifyRawItem {
  track: SpotifyRawTrack | null;
}

export interface SpotifyRawTrack {
  id: string | null;
  name: string;
  artists?: { name: string }[];
  album?: { name: string };
  duration_ms?: number;
  external_ids?: { isrc?: string };
  is_local?: boolean;
  type?: string; // 'track' | 'episode'
  /** Present when Spotify relinked the track for the requested market. */
  linked_from?: { id: string };
}

export interface SkipCounts {
  local: number;
  episodes: number;
  unavailable: number;
}

export interface PartitionResult {
  tracks: Track[];
  skipped: SkipCounts;
}

/**
 * Partition raw playlist items into transferable tracks and skip counts.
 *
 * - `track: null` → unavailable (removed/region-locked). Guard against it; it
 *   crashes naive code.
 * - `is_local` / `id === null` → local file. Cannot be transferred by
 *   definition; count separately and tell the user.
 * - `type === 'episode'` → podcast episode. Filter out.
 * - Otherwise → a real track. Prefer `linked_from.id` for stable identity when
 *   the market param relinked it.
 */
export function partitionSpotifyItems(items: SpotifyRawItem[]): PartitionResult {
  const tracks: Track[] = [];
  const skipped: SkipCounts = { local: 0, episodes: 0, unavailable: 0 };

  for (const item of items) {
    const t = item?.track;

    if (!t) {
      skipped.unavailable++;
      continue;
    }
    if (t.is_local || t.id == null) {
      skipped.local++;
      continue;
    }
    if (t.type === 'episode') {
      skipped.episodes++;
      continue;
    }

    // Prefer linked_from.id — it's the stable identity across relinking.
    const stableId = t.linked_from?.id ?? t.id;

    tracks.push({
      title: t.name,
      artists: (t.artists ?? []).map((a) => a.name),
      album: t.album?.name,
      isrc: t.external_ids?.isrc,
      durationMs: t.duration_ms,
      platformId: `spotify:track:${stableId}`,
      platform: 'spotify',
      isrcMissingReason: t.external_ids?.isrc ? undefined : 'not_in_response',
    });
  }

  return { tracks, skipped };
}
