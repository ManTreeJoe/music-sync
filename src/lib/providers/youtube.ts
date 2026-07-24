// lib/providers/youtube.ts
//
// YouTube adapter, via the OFFICIAL YouTube Data API v3 only. No ytmusicapi or
// any reverse-engineered client — that's a hard rule (ToS + audit risk).
//
// Reads are cheap (playlistItems.list ~1 unit/page) so YouTube ships first as a
// SOURCE. Writes are quota-starved (50 units/track) and gated behind
// YOUTUBE_WRITE_ENABLED. There is no ISRC in the API, so matching is Tier 2
// only and confidence is capped at 'medium' by the engine.

import { httpJson } from '../http';
import type {
  Auth,
  MusicProvider,
  Platform,
  Playlist,
  SearchQuery,
  Track,
} from './types';

const API = 'https://www.googleapis.com/youtube/v3';

/** Strip the promotional cruft YouTube titles carry, keeping the DISPLAY title. */
export function stripYouTubeNoise(raw: string): string {
  return raw
    // bracketed noise: (Official Video), [HD], (Lyric Video), (Audio), (MV)…
    .replace(
      /\s*[([][^)\]]*\b(official|video|audio|lyrics?|visuali[sz]er|m\/?v|hd|hq|4k|explicit|clean|remaster(ed)?)\b[^)\]]*[)\]]/gi,
      ' ',
    )
    // trailing "| Official ..." tails
    .replace(/\s*\|.*$/g, ' ')
    // bare trailing tokens left after bracket removal
    .replace(/\s*\b(official\s+(music\s+)?video|hd|hq|4k|mv)\b\s*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–|]\s*$/, '')
    .trim();
}

/**
 * Parse a YouTube video title (+ channel) into artist/title. When the channel
 * is "X - Topic" (auto-generated official audio), the channel is the most
 * trustworthy artist. Otherwise split on the first " - ".
 */
export function parseYouTubeTitle(
  rawTitle: string,
  channelTitle?: string,
): { title: string; artists: string[] } {
  const topic = channelTitle && /-\s*topic\s*$/i.test(channelTitle);
  if (topic) {
    const artist = channelTitle!.replace(/\s*-\s*topic\s*$/i, '').trim();
    return { title: stripYouTubeNoise(rawTitle), artists: artist ? [artist] : [] };
  }

  const idx = rawTitle.indexOf(' - ');
  if (idx !== -1) {
    const artist = rawTitle.slice(0, idx).trim();
    const rest = rawTitle.slice(idx + 3);
    return { title: stripYouTubeNoise(rest), artists: artist ? [artist] : [] };
  }

  const artist = channelTitle
    ? channelTitle.replace(/\s*-\s*(topic|vevo)\s*$/i, '').trim()
    : '';
  return { title: stripYouTubeNoise(rawTitle), artists: artist ? [artist] : [] };
}

/** Pure: parse a YouTube playlist URL into its list id. */
export function parseYouTubeUrl(url: string): { playlistId: string } | null {
  if (!/youtube\.com|youtu\.be|music\.youtube/.test(url)) return null;
  const m = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m ? { playlistId: m[1] } : null;
}

function videoToTrack(videoId: string, title: string, channelTitle?: string): Track {
  const parsed = parseYouTubeTitle(title, channelTitle);
  return {
    title: parsed.title,
    artists: parsed.artists,
    platform: 'youtube',
    platformId: videoId,
    isrcMissingReason: 'platform_unsupported',
    sourceUrl: `https://music.youtube.com/watch?v=${videoId}`,
  };
}

const DEAD_TITLES = new Set(['Private video', 'Deleted video']);

export interface YouTubeDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class YouTubeProvider implements MusicProvider {
  readonly platform: Platform = 'youtube';
  private apiKey?: string;
  private fetchImpl?: typeof fetch;

  constructor(deps: YouTubeDeps = {}) {
    this.apiKey = deps.apiKey ?? process.env.YOUTUBE_API_KEY;
    this.fetchImpl = deps.fetchImpl;
  }

  parseUrl(url: string) {
    return parseYouTubeUrl(url);
  }

  /** Public reads use an API key; a user bearer token also works (OAuth). */
  private authQuery(auth: Auth): { headers: Record<string, string>; keyParam: string } {
    if (auth.kind === 'bearer') return { headers: { Authorization: `Bearer ${auth.token}` }, keyParam: '' };
    if (!this.apiKey) throw new Error('Missing required env var: YOUTUBE_API_KEY');
    return { headers: {}, keyParam: `&key=${this.apiKey}` };
  }

  private get<T>(path: string, auth: Auth): Promise<T> {
    const { headers, keyParam } = this.authQuery(auth);
    return httpJson<T>(`${API}${path}${keyParam}`, { headers, fetchImpl: this.fetchImpl });
  }

  async getPlaylist(id: string, auth: Auth): Promise<Playlist> {
    const data = await this.get<{
      items: { snippet?: { title: string; channelTitle?: string }; contentDetails?: { itemCount?: number } }[];
    }>(`/playlists?part=snippet,contentDetails&id=${id}`, auth);
    const p = data.items?.[0];
    return {
      id,
      name: p?.snippet?.title ?? 'YouTube playlist',
      trackCount: p?.contentDetails?.itemCount ?? 0,
      platform: 'youtube',
      url: `https://music.youtube.com/playlist?list=${id}`,
      owner: p?.snippet?.channelTitle,
    };
  }

  async getTracks(id: string, auth: Auth): Promise<Track[]> {
    const out: Track[] = [];
    let pageToken = '';
    do {
      const page: {
        items: {
          snippet?: {
            title: string;
            videoOwnerChannelTitle?: string;
            channelTitle?: string;
            resourceId?: { videoId?: string };
          };
        }[];
        nextPageToken?: string;
      } = await this.get(
        `/playlistItems?part=snippet&maxResults=50&playlistId=${id}${pageToken ? `&pageToken=${pageToken}` : ''}`,
        auth,
      );
      for (const it of page.items ?? []) {
        const s = it.snippet;
        const videoId = s?.resourceId?.videoId;
        if (!s || !videoId || DEAD_TITLES.has(s.title)) continue; // skip private/deleted
        out.push(videoToTrack(videoId, s.title, s.videoOwnerChannelTitle ?? s.channelTitle));
      }
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  /** No ISRC in the YouTube API — Tier 1 is unavailable in both directions. */
  findByIsrc(): null {
    return null;
  }

  async search(query: SearchQuery, auth: Auth): Promise<Track[]> {
    const q = [query.title, query.artist].filter(Boolean).join(' ');
    const data = await this.get<{
      items: { id?: { videoId?: string }; snippet?: { title: string; channelTitle?: string } }[];
    }>(
      `/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${encodeURIComponent(q)}`,
      auth,
    );
    const out: Track[] = [];
    for (const it of data.items ?? []) {
      const videoId = it.id?.videoId;
      if (!videoId || !it.snippet) continue;
      out.push(videoToTrack(videoId, it.snippet.title, it.snippet.channelTitle));
    }
    return out;
  }

  async createPlaylist(name: string, desc: string, auth: Auth): Promise<Playlist> {
    this.requireWriteEnabled();
    if (auth.kind !== 'bearer') throw new Error('AUTH_REQUIRED: YouTube writes need OAuth');
    const created = await httpJson<{ id: string }>(`${API}/playlists?part=snippet,status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: { title: name, description: desc }, status: { privacyStatus: 'private' } }),
      fetchImpl: this.fetchImpl,
    });
    return {
      id: created.id,
      name,
      description: desc,
      trackCount: 0,
      platform: 'youtube',
      url: `https://music.youtube.com/playlist?list=${created.id}`,
    };
  }

  /** One insert per track — no batch endpoint. This is the quota killer. */
  async addTracks(
    playlistId: string,
    trackIds: string[],
    auth: Auth,
    onProgress?: (added: number) => void,
  ): Promise<void> {
    this.requireWriteEnabled();
    if (auth.kind !== 'bearer') throw new Error('AUTH_REQUIRED: YouTube writes need OAuth');
    let done = 0;
    for (const videoId of trackIds) {
      await httpJson(`${API}/playlistItems?part=snippet`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
        fetchImpl: this.fetchImpl,
      });
      onProgress?.(++done);
    }
  }

  async getWritablePlaylists(auth: Auth): Promise<Playlist[]> {
    if (auth.kind !== 'bearer') return [];
    const data = await this.get<{
      items: { id: string; snippet?: { title: string }; contentDetails?: { itemCount?: number } }[];
    }>('/playlists?part=snippet,contentDetails&mine=true&maxResults=50', auth);
    return (data.items ?? []).map((p) => ({
      id: p.id,
      name: p.snippet?.title ?? 'Playlist',
      trackCount: p.contentDetails?.itemCount ?? 0,
      platform: 'youtube' as Platform,
      url: `https://music.youtube.com/playlist?list=${p.id}`,
    }));
  }

  /** playlists.insert (50) + one playlistItems.insert (50) per track. */
  estimateWriteCost(trackCount: number): number {
    return 50 * trackCount + 50;
  }

  private requireWriteEnabled(): void {
    if (process.env.YOUTUBE_WRITE_ENABLED !== 'true') {
      throw new Error('YouTube writing is disabled (quota-gated). Set YOUTUBE_WRITE_ENABLED=true.');
    }
  }
}
