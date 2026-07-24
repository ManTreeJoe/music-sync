import { describe, it, expect, beforeEach } from 'vitest';
import { runJob } from '../../src/lib/job/runJob';
import { _resetRedis } from '../../src/lib/redis';

beforeEach(() => _resetRedis()); // clear the match cache between tests
import { JobError } from '../../src/lib/job/types';
import type { Auth, MusicProvider, Platform, Playlist, SearchQuery, Track } from '../../src/lib/providers/types';

const track = (t: Partial<Track>): Track => ({
  title: '',
  artists: [],
  platformId: '',
  platform: 'spotify',
  ...t,
});

class FakeSource implements MusicProvider {
  platform: Platform = 'spotify';
  parseUrl() {
    return { playlistId: 'PL' };
  }
  async getPlaylist(): Promise<Playlist> {
    return { id: 'PL', name: 'My Mix', trackCount: 2, platform: 'spotify', url: 'https://src/PL' };
  }
  async getTracks(): Promise<Track[]> {
    return [];
  }
  async getTracksDetailed() {
    return {
      tracks: [
        track({ title: 'Yellow', artists: ['Coldplay'], isrc: 'GBAYE0000940', durationMs: 266000, platformId: 'spotify:track:1' }),
        track({ title: 'Obscure', artists: ['Nobody'], platformId: 'spotify:track:2' }),
      ],
      skipped: { local: 1, episodes: 0, unavailable: 0 },
    };
  }
  findByIsrc() {
    return Promise.resolve([]);
  }
  async search() {
    return [];
  }
  async createPlaylist(): Promise<Playlist> {
    throw new Error('unused');
  }
  async addTracks() {}
  async getWritablePlaylists() {
    return [];
  }
  estimateWriteCost() {
    return 0;
  }
}

class FakeDest implements MusicProvider {
  platform: Platform = 'apple';
  parseUrl() {
    return null;
  }
  async getPlaylist(): Promise<Playlist> {
    throw new Error('unused');
  }
  async getTracks() {
    return [];
  }
  findByIsrc(isrc: string): Promise<Track[]> {
    if (isrc === 'GBAYE0000940') {
      return Promise.resolve([track({ platform: 'apple', title: 'Yellow', artists: ['Coldplay'], isrc, durationMs: 266000, platformId: 'apple:1' })]);
    }
    return Promise.resolve([]);
  }
  async search(_q: SearchQuery) {
    return [];
  }
  async createPlaylist(): Promise<Playlist> {
    throw new Error('unused');
  }
  async addTracks() {}
  async getWritablePlaylists() {
    return [];
  }
  estimateWriteCost() {
    return 0;
  }
}

const source = new FakeSource();
const dest = new FakeDest();
const deps = {
  resolveProviderForUrl: () => ({ provider: source as MusicProvider, playlistId: 'PL' }),
  getProvider: () => dest as MusicProvider,
};

describe('runJob', () => {
  it('assembles a review job from source read + matching', async () => {
    const job = await runJob({ url: 'https://src/PL', destination: 'apple' }, deps);

    expect(job.name).toBe('My Mix');
    expect(job.sourcePlatform).toBe('spotify');
    expect(job.destinationPlatform).toBe('apple');
    expect(job.skipped.local).toBe(1);
    expect(job.results).toHaveLength(2);

    // Yellow resolves via ISRC (Tier 1, high); Obscure is unmatched (Tier 3).
    expect(job.results[0].tier).toBe(1);
    expect(job.results[0].confidence).toBe('high');
    expect(job.results[1].tier).toBe(3);
    expect(job.results[1].destination).toBeNull();
  });

  it('rejects an unrecognized URL', async () => {
    await expect(
      runJob({ url: 'nope', destination: 'apple' }, { resolveProviderForUrl: () => null }),
    ).rejects.toMatchObject({ code: 'INVALID_URL' });
  });

  it('rejects source === destination', async () => {
    await expect(runJob({ url: 'https://src/PL', destination: 'spotify' }, deps)).rejects.toBeInstanceOf(
      JobError,
    );
    await expect(runJob({ url: 'https://src/PL', destination: 'spotify' }, deps)).rejects.toMatchObject({
      code: 'SAME_PLATFORM',
    });
  });

  it('maps an unavailable destination provider', async () => {
    await expect(
      runJob(
        { url: 'https://src/PL', destination: 'youtube' },
        {
          resolveProviderForUrl: () => ({ provider: source as MusicProvider, playlistId: 'PL' }),
          getProvider: () => {
            throw new Error('no provider');
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});
