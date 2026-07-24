import { describe, it, expect, beforeEach } from 'vitest';
import { resolveMatch, resolveMatches } from '../../src/lib/job/resolve';
import { _resetRedis } from '../../src/lib/redis';

beforeEach(() => _resetRedis()); // clear the match cache between tests
import type { Auth, MusicProvider, Playlist, SearchQuery, Track } from '../../src/lib/providers/types';

const auth: Auth = { kind: 'none' };

const track = (t: Partial<Track>): Track => ({
  title: '',
  artists: [],
  platformId: '',
  platform: 'spotify',
  ...t,
});

/** A fake Apple-side destination provider that records which lookups ran. */
class FakeDest implements MusicProvider {
  platform = 'apple' as const;
  isrcCalls = 0;
  searchCalls = 0;
  constructor(
    private opts: { isrcHits?: Track[]; searchHits?: Track[] } = {},
  ) {}

  parseUrl() {
    return null;
  }
  async getPlaylist(): Promise<Playlist> {
    throw new Error('unused');
  }
  async getTracks(): Promise<Track[]> {
    return [];
  }
  findByIsrc(): Promise<Track[]> {
    this.isrcCalls++;
    return Promise.resolve(this.opts.isrcHits ?? []);
  }
  async search(_q: SearchQuery): Promise<Track[]> {
    this.searchCalls++;
    return this.opts.searchHits ?? [];
  }
  async createPlaylist(): Promise<Playlist> {
    throw new Error('unused');
  }
  async addTracks(): Promise<void> {}
  async getWritablePlaylists(): Promise<Playlist[]> {
    return [];
  }
  estimateWriteCost(): number {
    return 0;
  }
}

describe('resolveMatch', () => {
  it('Tier 1: an ISRC hit returns high confidence and skips search', async () => {
    const dest = new FakeDest({
      isrcHits: [track({ platform: 'apple', title: 'Yellow', artists: ['Coldplay'], isrc: 'GBAYE0000940', durationMs: 266000, platformId: 'apple:1' })],
    });
    const source = track({ title: 'Yellow', artists: ['Coldplay'], isrc: 'GBAYE0000940', durationMs: 266000 });

    const r = await resolveMatch(source, dest, auth);
    expect(r.tier).toBe(1);
    expect(r.confidence).toBe('high');
    expect(dest.isrcCalls).toBe(1);
    expect(dest.searchCalls).toBe(0); // search must not run on a Tier-1 hit
  });

  it('falls back to search when the ISRC lookup is empty', async () => {
    const dest = new FakeDest({
      isrcHits: [],
      searchHits: [track({ platform: 'apple', title: 'Yellow', artists: ['Coldplay'], durationMs: 266000, platformId: 'apple:2' })],
    });
    const source = track({ title: 'Yellow', artists: ['Coldplay'], isrc: 'ZZ0000000000', durationMs: 266000 });

    const r = await resolveMatch(source, dest, auth);
    expect(dest.isrcCalls).toBe(1);
    expect(dest.searchCalls).toBe(1);
    expect(r.tier).toBe(2);
    expect(r.confidence).toBe('medium');
  });

  it('goes straight to search when the source has no ISRC', async () => {
    const dest = new FakeDest({
      searchHits: [track({ platform: 'apple', title: 'Yellow', artists: ['Coldplay'], durationMs: 266000, platformId: 'apple:3' })],
    });
    const source = track({ title: 'Yellow', artists: ['Coldplay'], durationMs: 266000 });

    const r = await resolveMatch(source, dest, auth);
    expect(dest.isrcCalls).toBe(0);
    expect(dest.searchCalls).toBe(1);
    expect(r.tier).toBe(2);
  });

  it('returns unmatched when nothing is found', async () => {
    const dest = new FakeDest({});
    const source = track({ title: 'Obscure', artists: ['Nobody'] });
    const r = await resolveMatch(source, dest, auth);
    expect(r.tier).toBe(3);
    expect(r.confidence).toBe('none');
    expect(r.destination).toBeNull();
  });
});

describe('resolveMatches', () => {
  it('resolves many tracks preserving order and reports progress', async () => {
    const dest = new FakeDest({
      searchHits: [track({ platform: 'apple', title: 'X', artists: ['Y'], platformId: 'apple:x' })],
    });
    const sources = [
      track({ title: 'One', artists: ['A'] }),
      track({ title: 'Two', artists: ['B'] }),
      track({ title: 'Three', artists: ['C'] }),
    ];
    let last = 0;
    const results = await resolveMatches(sources, dest, auth, {
      concurrency: 2,
      onProgress: (done) => (last = done),
    });
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.source.title)).toEqual(['One', 'Two', 'Three']);
    expect(last).toBe(3);
  });
});
