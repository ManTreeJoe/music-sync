// lib/export/json.ts
//
// JSON export — the rich, re-importable format. The ISRCs make it accurate on a
// second hop by any tool. The jsonFile provider re-reads exactly this shape.

import type { ExportPlaylist } from './model';

/** The on-disk JSON schema. Kept explicit so the re-import adapter can rely on it. */
export interface ExportJson {
  name: string;
  description?: string;
  source_platform: string;
  source_url?: string;
  exported_at: string;
  track_count: number;
  tracks: Array<{
    position: number;
    title: string;
    artists: string[];
    album?: string;
    isrc?: string;
    duration_ms?: number;
    platform_ids: {
      spotify: string | null;
      apple: string | null;
      youtube: string | null;
    };
    match_confidence: string;
  }>;
}

export function toExportJson(playlist: ExportPlaylist): ExportJson {
  return {
    name: playlist.name,
    description: playlist.description,
    source_platform: playlist.sourcePlatform,
    source_url: playlist.sourceUrl,
    exported_at: playlist.exportedAt,
    track_count: playlist.trackCount,
    tracks: playlist.tracks.map((t) => ({
      position: t.position,
      title: t.title,
      artists: t.artists,
      album: t.album,
      isrc: t.isrc,
      duration_ms: t.durationMs,
      platform_ids: {
        spotify: t.platformIds.spotify ?? null,
        apple: t.platformIds.apple ?? null,
        youtube: t.platformIds.youtube ?? null,
      },
      match_confidence: t.confidence,
    })),
  };
}

export function toJSON(playlist: ExportPlaylist): string {
  return JSON.stringify(toExportJson(playlist), null, 2) + '\n';
}
