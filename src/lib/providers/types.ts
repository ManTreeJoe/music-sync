// lib/providers/types.ts
//
// The core vocabulary of the app. Everything depends on these types.
// `lib/matching/` operates ONLY on the normalized `Track` type below and must
// never import anything from `lib/providers/` beyond this file's types.

export type Platform = 'spotify' | 'apple' | 'youtube';
export type Confidence = 'high' | 'medium' | 'low' | 'none';

/** Normalized track — the lingua franca. Providers convert to/from this. */
export interface Track {
  title: string;
  artists: string[]; // [0] is primary
  album?: string;
  isrc?: string; // absent on YouTube
  durationMs?: number; // absent on some YouTube results
  platformId: string; // Spotify URI, Apple catalog id, YT video id
  platform: Platform;
  sourceUrl?: string;
  isrcMissingReason?: 'platform_unsupported' | 'not_in_response';
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackCount: number;
  platform: Platform;
  url: string;
  owner?: string;
}

export interface MatchResult {
  source: Track;
  destination: Track | null;
  confidence: Confidence;
  score?: number; // 0-1, present for tier-2 matches
  tier: 1 | 2 | 3;
  alternatives?: Track[]; // for user review on low confidence
  reason?: string; // why it failed, for the UI
}

export interface SearchQuery {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
}

export type Auth =
  | { kind: 'none' } // public reads
  | { kind: 'bearer'; token: string } // Spotify, YouTube
  | { kind: 'apple'; developerToken: string; userToken?: string };

export interface MusicProvider {
  platform: Platform;

  /** Parse a URL into a playlist ref. Returns null if not this platform. */
  parseUrl(url: string): { playlistId: string } | null;

  getPlaylist(id: string, auth: Auth): Promise<Playlist>;

  /** Must handle pagination internally and return ALL tracks. */
  getTracks(id: string, auth: Auth): Promise<Track[]>;

  /** Tier 1. Return null if platform has no ISRC support. */
  findByIsrc(isrc: string, auth: Auth): Promise<Track[]> | null;

  /** Tier 2. Free-text search. */
  search(query: SearchQuery, auth: Auth): Promise<Track[]>;

  createPlaylist(name: string, desc: string, auth: Auth): Promise<Playlist>;

  /** Must batch internally per platform limits. */
  addTracks(playlistId: string, trackIds: string[], auth: Auth): Promise<void>;

  /** For append-mode dedup and the write-permission check. */
  getWritablePlaylists(auth: Auth): Promise<Playlist[]>;

  /** Cost estimate in whatever unit the platform meters. 0 if unmetered. */
  estimateWriteCost(trackCount: number): number;
}
