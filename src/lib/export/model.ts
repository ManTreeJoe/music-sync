// lib/export/model.ts
//
// The intermediate export model. CSV/JSON/M3U8 all render from this. It's
// derived entirely from the source read plus match results, so export works
// with zero destination auth.

import type { Confidence, MatchResult, Platform, Track } from '../providers/types';

export interface ExportTrack {
  position: number;
  title: string;
  artists: string[];
  album?: string;
  isrc?: string;
  durationMs?: number;
  sourceUrl?: string;
  /** Resolved platform IDs. A key present with null means "looked up, absent". */
  platformIds: Partial<Record<Platform, string | null>>;
  confidence: Confidence;
}

export interface ExportPlaylist {
  name: string;
  description?: string;
  sourcePlatform: Platform;
  sourceUrl?: string;
  exportedAt: string; // ISO 8601
  trackCount: number;
  tracks: ExportTrack[];
}

export interface ExportMeta {
  name: string;
  description?: string;
  sourcePlatform: Platform;
  sourceUrl?: string;
  /** ISO timestamp; caller supplies it (keeps this module deterministic). */
  exportedAt: string;
}

/**
 * Build the export model from match results. Unmatched tracks are INCLUDED with
 * their original source metadata — never filtered out. That's the whole point:
 * the export is the user's portable record even when a transfer fails.
 */
export function buildExportPlaylist(
  meta: ExportMeta,
  results: MatchResult[],
): ExportPlaylist {
  const tracks: ExportTrack[] = results.map((r, i) => {
    const src = r.source;
    const dest = r.destination;

    const platformIds: Partial<Record<Platform, string | null>> = {
      [src.platform]: src.platformId,
    };
    if (dest) {
      platformIds[dest.platform] = dest.platformId;
    }

    return {
      position: i + 1,
      title: src.title,
      artists: src.artists,
      album: src.album,
      // Prefer the source ISRC; fall back to the matched destination's ISRC.
      isrc: src.isrc ?? dest?.isrc,
      durationMs: src.durationMs ?? dest?.durationMs,
      sourceUrl: src.sourceUrl,
      platformIds,
      confidence: r.confidence,
    };
  });

  return {
    name: meta.name,
    description: meta.description,
    sourcePlatform: meta.sourcePlatform,
    sourceUrl: meta.sourceUrl,
    exportedAt: meta.exportedAt,
    trackCount: tracks.length,
    tracks,
  };
}

/** A file-system-safe base name: `{sanitized-name}-{yyyy-mm-dd}`. */
export function exportBaseName(playlist: ExportPlaylist): string {
  const safe = playlist.name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'playlist';
  const day = playlist.exportedAt.slice(0, 10); // yyyy-mm-dd from ISO
  return `${safe}-${day}`;
}
