// lib/providers/spotify.ts
//
// Spotify adapter. Reads (public playlists, ISRC lookup, text search) need only
// a client-credentials token; writes need a user bearer token with the
// playlist-modify scopes. The response-mapping functions are pure and exported
// so they can be unit-tested against captured API JSON with no network.

import { httpJson } from '../http';
import { getSpotifyAppToken } from './spotifyAuth';
import { partitionSpotifyItems, type SpotifyRawItem } from './spotifyItems';
import type {
  Auth,
  MusicProvider,
  Platform,
  Playlist,
  SearchQuery,
  Track,
} from './types';

const API = 'https://api.spotify.com/v1';
const PLAYLIST_ID = /^[A-Za-z0-9]{22}$/;

const TRACK_FIELDS =
  'items(track(id,uri,name,artists(name),album(name),duration_ms,external_ids,is_local,type,linked_from(id))),next';

/** A Spotify track object as returned by /search and /tracks. */
export interface SpotifyApiTrack {
  id: string | null;
  uri?: string;
  name: string;
  artists?: { name: string }[];
  album?: { name: string };
  duration_ms?: number;
  external_ids?: { isrc?: string };
  linked_from?: { id: string };
}

/** Pure: map a Spotify track object to the normalized Track. */
export function spotifyTrackToTrack(t: SpotifyApiTrack): Track {
  const stableId = t.linked_from?.id ?? t.id ?? '';
  return {
    title: t.name,
    artists: (t.artists ?? []).map((a) => a.name),
    album: t.album?.name,
    isrc: t.external_ids?.isrc,
    durationMs: t.duration_ms,
    platformId: t.uri ?? `spotify:track:${stableId}`,
    platform: 'spotify',
    isrcMissingReason: t.external_ids?.isrc ? undefined : 'not_in_response',
  };
}

/** Pure: parse any Spotify playlist reference into its id. Null if not Spotify. */
export function parseSpotifyUrl(url: string): { playlistId: string } | null {
  const m = url.match(/playlist[/:]([A-Za-z0-9]{22})/);
  if (m && PLAYLIST_ID.test(m[1])) return { playlistId: m[1] };
  return null;
}

export interface SpotifyDeps {
  market?: string;
  fetchImpl?: typeof fetch;
}

export class SpotifyProvider implements MusicProvider {
  readonly platform: Platform = 'spotify';
  private market: string;
  private fetchImpl?: typeof fetch;

  constructor(deps: SpotifyDeps = {}) {
    this.market = deps.market ?? process.env.DEFAULT_STOREFRONT?.toUpperCase() ?? 'US';
    this.fetchImpl = deps.fetchImpl;
  }

  parseUrl(url: string) {
    return parseSpotifyUrl(url);
  }

  /** A bearer token for the request: the user's if present, else client-credentials. */
  private async bearer(auth: Auth): Promise<string> {
    if (auth.kind === 'bearer') return auth.token;
    return getSpotifyAppToken({ fetchImpl: this.fetchImpl });
  }

  private async get<T>(path: string, auth: Auth): Promise<T> {
    const token = await this.bearer(auth);
    return httpJson<T>(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      rateLimit: 'spotify',
      fetchImpl: this.fetchImpl,
    });
  }

  async getPlaylist(id: string, auth: Auth): Promise<Playlist> {
    const data = await this.get<{
      id: string;
      name: string;
      description?: string;
      tracks: { total: number };
      external_urls?: { spotify?: string };
      owner?: { display_name?: string; id?: string };
    }>(
      `/playlists/${id}?market=${this.market}&fields=id,name,description,tracks(total),external_urls,owner(display_name,id)`,
      auth,
    );
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      trackCount: data.tracks?.total ?? 0,
      platform: 'spotify',
      url: data.external_urls?.spotify ?? `https://open.spotify.com/playlist/${id}`,
      owner: data.owner?.display_name ?? data.owner?.id,
    };
  }

  /** Paginates fully and returns only transferable tracks. */
  async getTracks(id: string, auth: Auth): Promise<Track[]> {
    return (await this.getTracksDetailed(id, auth)).tracks;
  }

  /** Like getTracks but also reports what was skipped (local/episode/unavailable). */
  async getTracksDetailed(
    id: string,
    auth: Auth,
  ): Promise<{ tracks: Track[]; skipped: { local: number; episodes: number; unavailable: number } }> {
    const all: SpotifyRawItem[] = [];
    let url: string | null =
      `/playlists/${id}/tracks?market=${this.market}&limit=100&fields=${encodeURIComponent(TRACK_FIELDS)}`;

    while (url) {
      const page: { items: SpotifyRawItem[]; next: string | null } = await this.get(url, auth);
      all.push(...(page.items ?? []));
      // `next` is an absolute URL; strip the API prefix to reuse get().
      url = page.next ? page.next.replace(API, '') : null;
    }

    return partitionSpotifyItems(all);
  }

  findByIsrc(isrc: string, auth: Auth): Promise<Track[]> {
    return this.searchRaw(`isrc:${isrc}`, auth, 20);
  }

  search(query: SearchQuery, auth: Auth): Promise<Track[]> {
    const q = [query.title, query.artist].filter(Boolean).join(' ');
    return this.searchRaw(q, auth, 10);
  }

  private async searchRaw(q: string, auth: Auth, limit: number): Promise<Track[]> {
    const data = await this.get<{ tracks?: { items: SpotifyApiTrack[] } }>(
      `/search?q=${encodeURIComponent(q)}&type=track&market=${this.market}&limit=${limit}`,
      auth,
    );
    return (data.tracks?.items ?? []).map(spotifyTrackToTrack);
  }

  async createPlaylist(name: string, desc: string, auth: Auth): Promise<Playlist> {
    const me = await this.get<{ id: string }>('/me', auth);
    const token = await this.bearer(auth);
    const created = await httpJson<{ id: string; external_urls?: { spotify?: string } }>(
      `${API}/users/${me.id}/playlists`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        rateLimit: 'spotify',
        body: JSON.stringify({ name, description: desc, public: false }),
        fetchImpl: this.fetchImpl,
      },
    );
    return {
      id: created.id,
      name,
      description: desc,
      trackCount: 0,
      platform: 'spotify',
      url: created.external_urls?.spotify ?? `https://open.spotify.com/playlist/${created.id}`,
    };
  }

  /** trackIds are Spotify URIs. Batched at 100/request per the API limit. */
  async addTracks(
    playlistId: string,
    trackIds: string[],
    auth: Auth,
    onProgress?: (added: number) => void,
  ): Promise<void> {
    const token = await this.bearer(auth);
    for (let i = 0; i < trackIds.length; i += 100) {
      const uris = trackIds.slice(i, i + 100);
      await httpJson(`${API}/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        rateLimit: 'spotify',
        body: JSON.stringify({ uris }),
        fetchImpl: this.fetchImpl,
      });
      onProgress?.(Math.min(i + uris.length, trackIds.length));
    }
  }

  async getWritablePlaylists(auth: Auth): Promise<Playlist[]> {
    const me = await this.get<{ id: string }>('/me', auth);
    const out: Playlist[] = [];
    let url: string | null = '/me/playlists?limit=50';
    while (url) {
      const page: {
        items: {
          id: string;
          name: string;
          description?: string;
          tracks: { total: number };
          external_urls?: { spotify?: string };
          owner: { id: string };
          collaborative: boolean;
        }[];
        next: string | null;
      } = await this.get(url, auth);
      for (const p of page.items ?? []) {
        // Writable = owned by the user and not collaborative.
        if (p.owner.id === me.id && !p.collaborative) {
          out.push({
            id: p.id,
            name: p.name,
            description: p.description,
            trackCount: p.tracks?.total ?? 0,
            platform: 'spotify',
            url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`,
            owner: p.owner.id,
          });
        }
      }
      url = page.next ? page.next.replace(API, '') : null;
    }
    return out;
  }

  /** Spotify writes are unmetered. */
  estimateWriteCost(): number {
    return 0;
  }
}
