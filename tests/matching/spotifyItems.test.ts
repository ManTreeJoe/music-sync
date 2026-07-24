import { describe, it, expect } from 'vitest';
import {
  partitionSpotifyItems,
  type SpotifyRawItem,
} from '../../src/lib/providers/spotifyItems';

describe('partitionSpotifyItems — the skip/relink rules', () => {
  it('[10] skips and counts a local file without crashing', () => {
    const items: SpotifyRawItem[] = [
      {
        track: {
          id: null,
          name: 'A Local MP3',
          is_local: true,
          type: 'track',
        },
      },
      {
        track: {
          id: 'abc',
          name: 'Real Track',
          artists: [{ name: 'Artist' }],
          album: { name: 'Album' },
          duration_ms: 200000,
          external_ids: { isrc: 'USABC1234567' },
          type: 'track',
        },
      },
    ];

    const { tracks, skipped } = partitionSpotifyItems(items);
    expect(skipped.local).toBe(1);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].isrc).toBe('USABC1234567');
    expect(tracks[0].platformId).toBe('spotify:track:abc');
  });

  it('filters podcast episodes', () => {
    const items: SpotifyRawItem[] = [
      { track: { id: 'ep1', name: 'Some Episode', type: 'episode' } },
    ];
    const { tracks, skipped } = partitionSpotifyItems(items);
    expect(skipped.episodes).toBe(1);
    expect(tracks).toHaveLength(0);
  });

  it('guards against a null track (unavailable)', () => {
    const items: SpotifyRawItem[] = [{ track: null }];
    const { tracks, skipped } = partitionSpotifyItems(items);
    expect(skipped.unavailable).toBe(1);
    expect(tracks).toHaveLength(0);
  });

  it('prefers linked_from.id for stable identity under relinking', () => {
    const items: SpotifyRawItem[] = [
      {
        track: {
          id: 'relinked-us',
          name: 'Relinked Track',
          type: 'track',
          linked_from: { id: 'original-id' },
        },
      },
    ];
    const { tracks } = partitionSpotifyItems(items);
    expect(tracks[0].platformId).toBe('spotify:track:original-id');
  });

  it('flags missing ISRC reason', () => {
    const items: SpotifyRawItem[] = [
      { track: { id: 'x', name: 'No ISRC', type: 'track' } },
    ];
    const { tracks } = partitionSpotifyItems(items);
    expect(tracks[0].isrcMissingReason).toBe('not_in_response');
  });
});
