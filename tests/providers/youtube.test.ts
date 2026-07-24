import { describe, it, expect } from 'vitest';
import {
  parseYouTubeUrl,
  parseYouTubeTitle,
  stripYouTubeNoise,
  YouTubeProvider,
} from '../../src/lib/providers/youtube';

describe('parseYouTubeUrl', () => {
  it('parses youtube.com and music.youtube.com playlist URLs', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PLabc123')).toEqual({
      playlistId: 'PLabc123',
    });
    expect(
      parseYouTubeUrl('https://music.youtube.com/playlist?list=OLAK5uy_xyz&si=1'),
    ).toEqual({ playlistId: 'OLAK5uy_xyz' });
  });
  it('returns null for a Spotify URL', () => {
    expect(parseYouTubeUrl('https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd')).toBeNull();
  });
});

describe('stripYouTubeNoise', () => {
  it('removes official/video/hd/4k cruft', () => {
    expect(stripYouTubeNoise('Bohemian Rhapsody (Official Video) [HD] 4K')).toBe(
      'Bohemian Rhapsody',
    );
    expect(stripYouTubeNoise('Song (Official Music Video)')).toBe('Song');
    expect(stripYouTubeNoise('Song | Official Audio')).toBe('Song');
  });
});

describe('parseYouTubeTitle', () => {
  it('[hard case 6] splits "Artist - Song (Official Video) [HD] 4K"', () => {
    expect(parseYouTubeTitle('Queen - Bohemian Rhapsody (Official Video) [HD] 4K')).toEqual({
      title: 'Bohemian Rhapsody',
      artists: ['Queen'],
    });
  });

  it('trusts the "- Topic" channel as the artist', () => {
    expect(parseYouTubeTitle('Bohemian Rhapsody', 'Queen - Topic')).toEqual({
      title: 'Bohemian Rhapsody',
      artists: ['Queen'],
    });
  });

  it('preserves non-Latin titles', () => {
    const r = parseYouTubeTitle('IU - 봄 사랑 벚꽃 말고 (Official Video)');
    expect(r.artists).toEqual(['IU']);
    expect(r.title).toBe('봄 사랑 벚꽃 말고');
  });

  it('falls back to the channel when there is no dash', () => {
    expect(parseYouTubeTitle('Redbone', 'Childish Gambino - Topic')).toEqual({
      title: 'Redbone',
      artists: ['Childish Gambino'],
    });
  });
});

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('YouTubeProvider', () => {
  it('findByIsrc is null — no ISRC support', () => {
    expect(new YouTubeProvider({ apiKey: 'k' }).findByIsrc()).toBeNull();
  });

  it('getTracks paginates and skips private/deleted videos', async () => {
    const page1 = {
      items: [
        { snippet: { title: 'Queen - Bohemian Rhapsody (Official Video)', channelTitle: 'Queen', resourceId: { videoId: 'v1' } } },
        { snippet: { title: 'Private video', resourceId: { videoId: 'v2' } } },
      ],
      nextPageToken: 'PG2',
    };
    const page2 = {
      items: [
        { snippet: { title: 'Redbone', videoOwnerChannelTitle: 'Childish Gambino - Topic', resourceId: { videoId: 'v3' } } },
      ],
    };
    const fetchImpl = (async (url: string) =>
      jsonResponse(String(url).includes('pageToken=PG2') ? page2 : page1)) as unknown as typeof fetch;

    const provider = new YouTubeProvider({ apiKey: 'k', fetchImpl });
    const tracks = await provider.getTracks('PL1', { kind: 'none' });

    expect(tracks.map((t) => t.title)).toEqual(['Bohemian Rhapsody', 'Redbone']);
    expect(tracks[1].artists).toEqual(['Childish Gambino']);
    expect(tracks[0].platform).toBe('youtube');
    expect(tracks[0].isrcMissingReason).toBe('platform_unsupported');
  });

  it('estimateWriteCost is 50/track + 50', () => {
    expect(new YouTubeProvider({ apiKey: 'k' }).estimateWriteCost(100)).toBe(5050);
  });
});
