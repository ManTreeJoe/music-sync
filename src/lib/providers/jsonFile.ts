// lib/providers/jsonFile.ts
//
// Read-only adapter that treats an exported JSON file as a source. This closes
// the loop: export from anywhere, re-import to anywhere, with the ISRCs making
// the second hop as accurate as the first. It is a fourth MusicProvider, but
// only the read half is meaningful — every write method is unsupported.
//
// It never reaches the network (the data IS the input) and isn't in the URL
// registry: there's no playlist URL to parse, so the route hands the parsed
// document straight to runJob.

import { JobError } from '../job/types';
import type { ExportJson } from '../export/json';
import type { MusicProvider, Platform, Playlist, SearchQuery, Track } from './types';

const PLATFORMS: Platform[] = ['spotify', 'apple', 'youtube'];

function isPlatform(v: unknown): v is Platform {
  return typeof v === 'string' && (PLATFORMS as string[]).includes(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

export interface ParsedImport {
  playlist: Omit<Playlist, 'id' | 'url'> & { id?: string; url?: string };
  tracks: Track[];
}

/**
 * Parse exported JSON (the shape produced by `toExportJson`) back into the
 * normalized types. The source platform's id becomes each track's platformId
 * when present (so a re-import round-trips to an equivalent Track); otherwise a
 * stable synthetic id is used. Titleless tracks can't be matched and are
 * dropped. Throws a coded JobError on a file that isn't a valid export.
 */
export function parseExportJson(input: unknown): ParsedImport {
  const json = input as ExportJson;
  if (!json || typeof json !== 'object' || !Array.isArray(json.tracks)) {
    throw new JobError('INVALID_URL', "That JSON isn't a Playlist Bridge export — no track list found.");
  }
  if (!isPlatform(json.source_platform)) {
    throw new JobError(
      'INVALID_URL',
      `That export's source platform (${json.source_platform ?? 'unknown'}) isn't a supported service.`,
    );
  }
  const sourcePlatform = json.source_platform;

  const tracks: Track[] = [];
  json.tracks.forEach((t, i) => {
    const title = str(t?.title);
    if (!title) return; // unmatchable without a title
    const ids = t.platform_ids ?? { spotify: null, apple: null, youtube: null };
    tracks.push({
      title,
      artists: Array.isArray(t.artists) ? t.artists.filter((a): a is string => typeof a === 'string') : [],
      album: str(t.album),
      isrc: str(t.isrc),
      durationMs: typeof t.duration_ms === 'number' ? t.duration_ms : undefined,
      platformId: str(ids[sourcePlatform]) ?? `json:${t.position ?? i + 1}`,
      platform: sourcePlatform,
      sourceUrl: str(json.source_url),
    });
  });

  if (tracks.length === 0) {
    throw new JobError('INVALID_URL', 'That export has no usable tracks.');
  }

  return {
    playlist: {
      name: str(json.name) ?? 'Imported playlist',
      description: str(json.description),
      trackCount: tracks.length,
      platform: sourcePlatform,
      url: str(json.source_url),
    },
    tracks,
  };
}

/** Parse raw file text (JSON.parse + validate). Coded errors for the UI. */
export function parseImportText(text: string): ParsedImport {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new JobError('INVALID_URL', "That file isn't valid JSON.");
  }
  return parseExportJson(obj);
}

const unsupported = (): never => {
  throw new JobError('PROVIDER_UNAVAILABLE', 'A JSON import can only be used as a source.');
};

/** Read-only source built from a parsed export. Ignores id/auth — data is local. */
export class JsonFileProvider implements MusicProvider {
  readonly platform: Platform;
  constructor(private readonly parsed: ParsedImport) {
    this.platform = parsed.playlist.platform;
  }

  parseUrl(): { playlistId: string } | null {
    return null; // not URL-addressable
  }

  async getPlaylist(): Promise<Playlist> {
    const p = this.parsed.playlist;
    return {
      id: p.id ?? 'import',
      name: p.name,
      description: p.description,
      trackCount: this.parsed.tracks.length,
      platform: p.platform,
      url: p.url ?? '',
    };
  }

  async getTracks(): Promise<Track[]> {
    return this.parsed.tracks;
  }

  findByIsrc(): Promise<Track[]> | null {
    return null;
  }
  async search(_q: SearchQuery): Promise<Track[]> {
    return [];
  }
  async createPlaylist(): Promise<Playlist> {
    return unsupported();
  }
  async addTracks(): Promise<void> {
    unsupported();
  }
  async getWritablePlaylists(): Promise<Playlist[]> {
    return [];
  }
  estimateWriteCost(): number {
    return 0;
  }
}
