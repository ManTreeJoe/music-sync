import { describe, it, expect } from 'vitest';
import {
  parseAppleUrl,
  appleSongToTrack,
  appleLibrarySongToTrack,
  AppleProvider,
  type AppleSong,
  type AppleLibrarySong,
} from '../../src/lib/providers/apple';
import type { Auth } from '../../src/lib/providers/types';

const auth: Auth = { kind: 'apple', developerToken: 'dev' };

describe('parseAppleUrl', () => {
  it('parses a catalog playlist URL', () => {
    expect(
      parseAppleUrl('https://music.apple.com/us/playlist/late-night/pl.u-abc123'),
    ).toEqual({ playlistId: 'pl.u-abc123' });
  });
  it('parses a private library playlist URL (p.*)', () => {
    expect(parseAppleUrl('https://music.apple.com/library/playlist/p.abc-123')).toEqual({
      playlistId: 'p.abc-123',
    });
  });
  it('returns null for a Spotify URL', () => {
    expect(parseAppleUrl('https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd')).toBeNull();
  });
});

describe('appleLibrarySongToTrack', () => {
  it('maps a library song, preferring the catalog id', () => {
    const song: AppleLibrarySong = {
      id: 'i.abc',
      type: 'library-songs',
      attributes: {
        name: 'Yellow',
        artistName: 'Coldplay',
        durationInMillis: 266000,
        playParams: { catalogId: '1000' },
      },
    };
    const t = appleLibrarySongToTrack(song);
    expect(t.title).toBe('Yellow');
    expect(t.platformId).toBe('1000'); // catalog id preferred
    expect(t.isrcMissingReason).toBe('not_in_response');
  });
});

describe('appleSongToTrack', () => {
  it('maps catalog attributes to a Track with the catalog id', () => {
    const song: AppleSong = {
      id: '1440899723',
      type: 'songs',
      attributes: {
        name: 'Redbone',
        artistName: 'Childish Gambino',
        albumName: 'Awaken, My Love!',
        isrc: 'USUM71614306',
        durationInMillis: 327000,
        url: 'https://music.apple.com/us/album/redbone/1',
      },
    };
    const t = appleSongToTrack(song);
    expect(t.platformId).toBe('1440899723'); // catalog id, not library id
    expect(t.artists).toEqual(['Childish Gambino']);
    expect(t.isrc).toBe('USUM71614306');
    expect(t.platform).toBe('apple');
  });

  it('flags a missing ISRC', () => {
    const t = appleSongToTrack({ id: '1', type: 'songs', attributes: { name: 'X' } });
    expect(t.isrcMissingReason).toBe('not_in_response');
  });
});

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AppleProvider network methods', () => {
  it('findByIsrc queries filter[isrc] and maps data[]', async () => {
    let calledUrl = '';
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return jsonResponse({
        data: [{ id: '1440899723', type: 'songs', attributes: { name: 'Redbone', isrc: 'USUM71614306', durationInMillis: 327000 } }],
      });
    }) as unknown as typeof fetch;

    const provider = new AppleProvider({ fetchImpl });
    const r = await provider.findByIsrc('USUM71614306', auth);
    expect(calledUrl).toContain('filter[isrc]=USUM71614306');
    expect(r[0].platformId).toBe('1440899723');
  });

  it('search reads results.songs.data', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        results: { songs: { data: [{ id: '99', type: 'songs', attributes: { name: 'Yellow', artistName: 'Coldplay' } }] } },
      })) as unknown as typeof fetch;

    const provider = new AppleProvider({ fetchImpl });
    const r = await provider.search({ title: 'Yellow', artist: 'Coldplay' }, auth);
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('Yellow');
  });

  it('addTracks uses catalog ids with type songs, batched at 25', async () => {
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return jsonResponse({}, 200);
    }) as unknown as typeof fetch;

    const provider = new AppleProvider({ fetchImpl });
    const ids = Array.from({ length: 30 }, (_, i) => `cat${i}`);
    await provider.addTracks('p.lib', ids, { kind: 'apple', developerToken: 'dev', userToken: 'user' });

    expect(bodies).toHaveLength(2); // 25 + 5
    const first = JSON.parse(bodies[0]);
    expect(first.data[0]).toEqual({ id: 'cat0', type: 'songs' });
    expect(first.data).toHaveLength(25);
  });
});
