// lib/providers/apple.ts
//
// Apple Music adapter. Catalog reads (ISRC lookup, text search) need only the
// developer token; library writes need the developer token AND a Music User
// Token. Mapping functions are pure and exported for tests.
//
// Watch the gotchas the spec calls out: library IDs are not catalog IDs (adds
// use catalog ids with type 'songs'); filter[isrc] batches up to ~25; a valid
// dev token with a missing/expired user token returns 403, not 401.

import { httpJson } from '../http';
import { getAppleDeveloperToken } from '../auth/appleToken';
import type {
  Auth,
  MusicProvider,
  Platform,
  Playlist,
  SearchQuery,
  Track,
} from './types';

const API = 'https://api.music.apple.com/v1';

/** An Apple catalog song object. */
export interface AppleSong {
  id: string;
  type: string; // 'songs'
  attributes?: {
    name: string;
    artistName?: string;
    albumName?: string;
    isrc?: string;
    durationInMillis?: number;
    url?: string;
  };
}

/** Pure: map an Apple catalog song to the normalized Track. */
export function appleSongToTrack(s: AppleSong): Track {
  const a = s.attributes ?? { name: '' };
  return {
    title: a.name,
    artists: a.artistName ? [a.artistName] : [],
    album: a.albumName,
    isrc: a.isrc,
    durationMs: a.durationInMillis,
    platformId: s.id, // catalog id — what adds/dedup use, with type 'songs'
    platform: 'apple',
    sourceUrl: a.url,
    isrcMissingReason: a.isrc ? undefined : 'not_in_response',
  };
}

/** An Apple LIBRARY song (from /me/library) — different shape and IDs. */
export interface AppleLibrarySong {
  id: string; // library id (p.*)
  type: string; // 'library-songs'
  attributes?: {
    name: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    playParams?: { catalogId?: string };
  };
}

/** Pure: map an Apple library song to a Track. Library songs carry no ISRC;
 *  prefer the catalog id when present so a later write can target it. */
export function appleLibrarySongToTrack(s: AppleLibrarySong): Track {
  const a = s.attributes ?? { name: '' };
  return {
    title: a.name,
    artists: a.artistName ? [a.artistName] : [],
    album: a.albumName,
    durationMs: a.durationInMillis,
    platformId: a.playParams?.catalogId ?? s.id,
    platform: 'apple',
    isrcMissingReason: 'not_in_response',
  };
}

/**
 * Pure: parse an Apple Music playlist URL into its id. Handles catalog
 * playlists (`pl.*`, e.g. .../us/playlist/name/pl.abc) and a user's library
 * playlists (`p.*`, e.g. .../library/playlist/p.abc).
 */
export function parseAppleUrl(url: string): { playlistId: string } | null {
  const m = url.match(/playlist\/(?:[^/]+\/)?((?:pl|p)\.[A-Za-z0-9-]+)/);
  if (m) return { playlistId: m[1] };
  return null;
}

/** Library playlist ids start with `p.` (catalog ids start with `pl.`). */
function isLibraryId(id: string): boolean {
  return id.startsWith('p.') && !id.startsWith('pl.');
}

export interface AppleDeps {
  storefront?: string;
  fetchImpl?: typeof fetch;
}

export class AppleProvider implements MusicProvider {
  readonly platform: Platform = 'apple';
  private storefront: string;
  private fetchImpl?: typeof fetch;

  constructor(deps: AppleDeps = {}) {
    this.storefront = deps.storefront ?? process.env.DEFAULT_STOREFRONT ?? 'us';
    this.fetchImpl = deps.fetchImpl;
  }

  parseUrl(url: string) {
    return parseAppleUrl(url);
  }

  private devToken(auth: Auth): string {
    if (auth.kind === 'apple') return auth.developerToken;
    return getAppleDeveloperToken();
  }

  private userToken(auth: Auth): string {
    if (auth.kind === 'apple' && auth.userToken) return auth.userToken;
    throw new Error('AUTH_REQUIRED: Apple Music user token needed for this action');
  }

  private headers(auth: Auth, withUser = false): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.devToken(auth)}` };
    if (withUser) h['Music-User-Token'] = this.userToken(auth);
    return h;
  }

  async getPlaylist(id: string, auth: Auth): Promise<Playlist> {
    // A user's private library playlist needs the user token; catalog reads
    // need only the developer token.
    const library = isLibraryId(id);
    const path = library
      ? `${API}/me/library/playlists/${id}`
      : `${API}/catalog/${this.storefront}/playlists/${id}`;
    const data = await httpJson<{
      data: { id: string; attributes?: { name: string; description?: { standard?: string }; url?: string } }[];
    }>(path, { headers: this.headers(auth, library), fetchImpl: this.fetchImpl });
    const p = data.data?.[0];
    return {
      id,
      name: p?.attributes?.name ?? 'Apple Music playlist',
      description: p?.attributes?.description?.standard,
      trackCount: 0,
      platform: 'apple',
      url: library
        ? `https://music.apple.com/library/playlist/${id}`
        : p?.attributes?.url ?? `https://music.apple.com/${this.storefront}/playlist/${id}`,
    };
  }

  async getTracks(id: string, auth: Auth): Promise<Track[]> {
    if (isLibraryId(id)) return this.getLibraryTracks(id, auth);
    const out: Track[] = [];
    let url: string | null =
      `/catalog/${this.storefront}/playlists/${id}/tracks?limit=100`;
    while (url) {
      const page: { data: AppleSong[]; next?: string } = await httpJson(`${API}${url}`, {
        headers: this.headers(auth),
        fetchImpl: this.fetchImpl,
      });
      out.push(...(page.data ?? []).map(appleSongToTrack));
      url = page.next ?? null;
    }
    return out;
  }

  /** Read a user's private library playlist (needs the Music User Token). */
  private async getLibraryTracks(id: string, auth: Auth): Promise<Track[]> {
    const out: Track[] = [];
    let url: string | null = `/me/library/playlists/${id}/tracks?limit=100`;
    while (url) {
      const page: { data: AppleLibrarySong[]; next?: string } = await httpJson(`${API}${url}`, {
        headers: this.headers(auth, true),
        fetchImpl: this.fetchImpl,
      });
      out.push(...(page.data ?? []).map(appleLibrarySongToTrack));
      url = page.next ?? null;
    }
    return out;
  }

  /** Tier 1. filter[isrc] accepts a comma-separated batch, but the interface is
   *  one ISRC at a time; batching is an optimization the job layer can add. */
  async findByIsrc(isrc: string, auth: Auth): Promise<Track[]> {
    const data = await httpJson<{ data: AppleSong[] }>(
      `${API}/catalog/${this.storefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}`,
      { headers: this.headers(auth), fetchImpl: this.fetchImpl },
    );
    return (data.data ?? []).map(appleSongToTrack);
  }

  async search(query: SearchQuery, auth: Auth): Promise<Track[]> {
    const term = [query.title, query.artist].filter(Boolean).join(' ');
    const data = await httpJson<{ results?: { songs?: { data: AppleSong[] } } }>(
      `${API}/catalog/${this.storefront}/search?types=songs&limit=10&term=${encodeURIComponent(term)}`,
      { headers: this.headers(auth), fetchImpl: this.fetchImpl },
    );
    return (data.results?.songs?.data ?? []).map(appleSongToTrack);
  }

  async createPlaylist(name: string, desc: string, auth: Auth): Promise<Playlist> {
    // Create first, add tracks in a second call — the create response doesn't
    // reliably echo passed-in tracks.
    const created = await httpJson<{ data: { id: string; href?: string }[] }>(
      `${API}/me/library/playlists`,
      {
        method: 'POST',
        headers: { ...this.headers(auth, true), 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: { name, description: desc } }),
        fetchImpl: this.fetchImpl,
      },
    );
    const id = created.data?.[0]?.id ?? '';
    return {
      id,
      name,
      description: desc,
      trackCount: 0,
      platform: 'apple',
      url: `https://music.apple.com/library/playlist/${id}`,
    };
  }

  /** trackIds are CATALOG ids. Added with type 'songs', batched at 25. */
  async addTracks(playlistId: string, trackIds: string[], auth: Auth): Promise<void> {
    for (let i = 0; i < trackIds.length; i += 25) {
      const data = trackIds.slice(i, i + 25).map((id) => ({ id, type: 'songs' }));
      await httpJson(`${API}/me/library/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { ...this.headers(auth, true), 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
        fetchImpl: this.fetchImpl,
      });
    }
  }

  async getWritablePlaylists(auth: Auth): Promise<Playlist[]> {
    const out: Playlist[] = [];
    let url: string | null = '/me/library/playlists?limit=100';
    while (url) {
      const page: {
        data: { id: string; attributes?: { name: string; canEdit?: boolean } }[];
        next?: string;
      } = await httpJson(`${API}${url}`, {
        headers: this.headers(auth, true),
        fetchImpl: this.fetchImpl,
      });
      for (const p of page.data ?? []) {
        // Library playlists are user-owned; still honor canEdit when present.
        if (p.attributes?.canEdit !== false) {
          out.push({
            id: p.id,
            name: p.attributes?.name ?? 'Library playlist',
            trackCount: 0,
            platform: 'apple',
            url: `https://music.apple.com/library/playlist/${p.id}`,
          });
        }
      }
      url = page.next ?? null;
    }
    return out;
  }

  /** Apple writes are rate-limited, not quota-metered. */
  estimateWriteCost(): number {
    return 0;
  }
}
