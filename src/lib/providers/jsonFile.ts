// lib/providers/jsonFile.ts
//
// Read-only adapter that treats an exported JSON file as a source. This closes
// the loop: export from anywhere, re-import to anywhere, with the ISRCs making
// the second hop as accurate as the first. It is a fourth MusicProvider, but
// only the read half is meaningful — write methods are intentionally absent.

import type { ExportJson } from '../export/json';
import type { Platform, Playlist, Track } from './types';

const PLATFORMS: Platform[] = ['spotify', 'apple', 'youtube'];

function isPlatform(v: string): v is Platform {
  return (PLATFORMS as string[]).includes(v);
}

export interface ParsedImport {
  playlist: Omit<Playlist, 'id' | 'url'> & { id?: string; url?: string };
  tracks: Track[];
}

/**
 * Parse exported JSON (the shape produced by `toExportJson`) back into the
 * normalized types. The source platform's id is used as each track's
 * platformId when present, so a re-import round-trips to an equivalent Track.
 */
export function parseExportJson(input: unknown): ParsedImport {
  const json = input as ExportJson;
  if (!json || typeof json !== 'object' || !Array.isArray(json.tracks)) {
    throw new Error('Not a valid Playlist Bridge export: missing tracks[]');
  }

  const sourcePlatform: Platform = isPlatform(json.source_platform)
    ? json.source_platform
    : 'spotify';

  const tracks: Track[] = json.tracks.map((t) => {
    const ids = t.platform_ids ?? { spotify: null, apple: null, youtube: null };
    const platformId = ids[sourcePlatform] ?? '';
    return {
      title: t.title,
      artists: t.artists ?? [],
      album: t.album,
      isrc: t.isrc,
      durationMs: t.duration_ms,
      platformId,
      platform: sourcePlatform,
      sourceUrl: json.source_url,
    };
  });

  return {
    playlist: {
      name: json.name,
      description: json.description,
      trackCount: json.track_count ?? tracks.length,
      platform: sourcePlatform,
      url: json.source_url,
    },
    tracks,
  };
}
