import { describe, it, expect } from 'vitest';
import {
  parseSpotifyUrl,
  spotifyTrackToTrack,
  SpotifyProvider,
  type SpotifyApiTrack,
} from '../../src/lib/providers/spotify';

const ID = '37i9dQZF1DX0XUsuxWHRQd';

describe('parseSpotifyUrl', () => {
  it('parses an open.spotify.com URL with a query string', () => {
    expect(parseSpotifyUrl(`https://open.spotify.com/playlist/${ID}?si=abc`)).toEqual({
      playlistId: ID,
    });
  });
  it('parses an intl-prefixed URL', () => {
    expect(parseSpotifyUrl(`https://open.spotify.com/intl-de/playlist/${ID}`)).toEqual({
      playlistId: ID,
    });
  });
  it('parses a spotify: URI', () => {
    expect(parseSpotifyUrl(`spotify:playlist:${ID}`)).toEqual({ playlistId: ID });
  });
  it('returns null for a non-Spotify URL', () => {
    expect(parseSpotifyUrl('https://music.apple.com/us/playlist/x/pl.123')).toBeNull();
  });
});

describe('spotifyTrackToTrack', () => {
  it('maps fields and prefers linked_from.id for stable identity', () => {
    const api: SpotifyApiTrack = {
      id: 'relinked',
      name: 'Redbone',
      artists: [{ name: 'Childish Gambino' }],
      album: { name: 'Awaken, My Love!' },
      duration_ms: 326933,
      external_ids: { isrc: 'USUM71614306' },
      linked_from: { id: 'original' },
    };
    const t = spotifyTrackToTrack(api);
    expect(t.title).toBe('Redbone');
    expect(t.isrc).toBe('USUM71614306');
    expect(t.platformId).toBe('spotify:track:original');
    expect(t.platform).toBe('spotify');
  });

  it('uses the uri when present and flags a missing ISRC', () => {
    const t = spotifyTrackToTrack({ id: 'x', uri: 'spotify:track:x', name: 'No ISRC' });
    expect(t.platformId).toBe('spotify:track:x');
    expect(t.isrcMissingReason).toBe('not_in_response');
  });
});

// --- network methods via injected fetch ---------------------------------

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SpotifyProvider.getTracksDetailed', () => {
  it('paginates and partitions local files / episodes', async () => {
    const page1 = {
      items: [
        { track: { id: null, name: 'Local', is_local: true, type: 'track' } },
        {
          track: {
            id: 'a',
            uri: 'spotify:track:a',
            name: 'Real One',
            artists: [{ name: 'Artist' }],
            duration_ms: 200000,
            external_ids: { isrc: 'US1111111111' },
            type: 'track',
          },
        },
      ],
      next: 'https://api.spotify.com/v1/playlists/ID/tracks?offset=100',
    };
    const page2 = {
      items: [
        { track: { id: 'ep', name: 'Episode', type: 'episode' } },
        {
          track: {
            id: 'b',
            uri: 'spotify:track:b',
            name: 'Real Two',
            artists: [{ name: 'Artist' }],
            duration_ms: 210000,
            type: 'track',
          },
        },
      ],
      next: null,
    };

    const fetchImpl = (async (url: string) =>
      jsonResponse(String(url).includes('offset=100') ? page2 : page1)) as unknown as typeof fetch;

    const provider = new SpotifyProvider({ fetchImpl });
    const { tracks, skipped } = await provider.getTracksDetailed('ID', { kind: 'bearer', token: 't' });

    expect(tracks.map((t) => t.title)).toEqual(['Real One', 'Real Two']);
    expect(skipped).toEqual({ local: 1, episodes: 1, unavailable: 0 });
  });
});

describe('SpotifyProvider.findByIsrc / search', () => {
  it('maps ISRC search results', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        tracks: {
          items: [
            {
              id: 'a',
              uri: 'spotify:track:a',
              name: 'Yellow',
              artists: [{ name: 'Coldplay' }],
              duration_ms: 266000,
              external_ids: { isrc: 'GBAYE0000940' },
            },
          ],
        },
      })) as unknown as typeof fetch;

    const provider = new SpotifyProvider({ fetchImpl });
    const results = await provider.findByIsrc('GBAYE0000940', { kind: 'bearer', token: 't' });
    expect(results).toHaveLength(1);
    expect(results[0].platformId).toBe('spotify:track:a');
    expect(results[0].isrc).toBe('GBAYE0000940');
  });
});
