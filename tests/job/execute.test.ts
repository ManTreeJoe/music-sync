import { describe, it, expect, beforeEach } from 'vitest';
import { executeMatchJob } from '../../src/lib/job/execute';
import { createJob, getJob, newJobId } from '../../src/lib/job/store';
import { _resetRedis } from '../../src/lib/redis';
import type { MusicProvider, Platform, Playlist, Track } from '../../src/lib/providers/types';

beforeEach(() => _resetRedis());

const track = (t: Partial<Track>): Track => ({ title: '', artists: [], platformId: '', platform: 'spotify', ...t });

class Source implements MusicProvider {
  platform: Platform = 'spotify';
  parseUrl() {
    return { playlistId: 'PL' };
  }
  async getPlaylist(): Promise<Playlist> {
    return { id: 'PL', name: 'Mix', trackCount: 2, platform: 'spotify', url: 'https://src/PL' };
  }
  async getTracks(): Promise<Track[]> {
    return [
      track({ title: 'Yellow', artists: ['Coldplay'], isrc: 'GBAYE0000940', durationMs: 266000, platformId: 's:1' }),
      track({ title: 'Obscure', artists: ['Nobody'], platformId: 's:2' }),
    ];
  }
  findByIsrc() {
    return Promise.resolve([]);
  }
  async search() {
    return [];
  }
  async createPlaylist(): Promise<Playlist> {
    throw new Error('x');
  }
  async addTracks() {}
  async getWritablePlaylists() {
    return [];
  }
  estimateWriteCost() {
    return 0;
  }
}

class Dest implements MusicProvider {
  platform: Platform = 'apple';
  parseUrl() {
    return null;
  }
  async getPlaylist(): Promise<Playlist> {
    throw new Error('x');
  }
  async getTracks() {
    return [];
  }
  findByIsrc(isrc: string): Promise<Track[]> {
    return Promise.resolve(
      isrc === 'GBAYE0000940'
        ? [track({ platform: 'apple', title: 'Yellow', artists: ['Coldplay'], isrc, durationMs: 266000, platformId: 'a:1' })]
        : [],
    );
  }
  async search() {
    return [];
  }
  async createPlaylist(): Promise<Playlist> {
    throw new Error('x');
  }
  async addTracks() {}
  async getWritablePlaylists() {
    return [];
  }
  estimateWriteCost() {
    return 0;
  }
}

const deps = {
  resolveProviderForUrl: () => ({ provider: new Source() as MusicProvider, playlistId: 'PL' }),
  getProvider: () => new Dest() as MusicProvider,
};

describe('executeMatchJob', () => {
  it('drives a job to awaiting_review with the resolved matches', async () => {
    const id = newJobId();
    await createJob({ id, url: 'https://src/PL', destination: 'apple', total: 0 });
    await executeMatchJob({ id, url: 'https://src/PL', destination: 'apple', deps });

    const job = await getJob(id);
    expect(job?.status).toBe('awaiting_review');
    expect(job?.review?.results).toHaveLength(2);
    expect(job?.review?.results[0].confidence).toBe('high'); // Yellow via ISRC
    expect(job?.progress).toEqual({ done: 2, total: 2 });
  });

  it('records a failure on the job record rather than throwing', async () => {
    const id = newJobId();
    await createJob({ id, url: 'nope', destination: 'apple', total: 0 });
    await executeMatchJob({
      id,
      url: 'nope',
      destination: 'apple',
      deps: { resolveProviderForUrl: () => null },
    });

    const job = await getJob(id);
    expect(job?.status).toBe('failed');
    expect(job?.error?.code).toBe('INVALID_URL');
  });
});
