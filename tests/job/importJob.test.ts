import { describe, it, expect, beforeEach } from 'vitest';
import { runJob } from '../../src/lib/job/runJob';
import { parseExportJson } from '../../src/lib/providers/jsonFile';
import { _resetRedis } from '../../src/lib/redis';
import type { ExportJson } from '../../src/lib/export/json';
import type { MusicProvider, Platform, Playlist, Track } from '../../src/lib/providers/types';

beforeEach(() => _resetRedis());

const track = (t: Partial<Track>): Track => ({ title: '', artists: [], platformId: '', platform: 'apple', ...t });

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
    return Promise.resolve(
      isrc === 'GBAYE0000940'
        ? [track({ title: 'Yellow', artists: ['Coldplay'], isrc, durationMs: 266000, platformId: 'apple:1' })]
        : [],
    );
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

const doc: ExportJson = {
  name: 'Restored',
  source_platform: 'spotify',
  source_url: 'https://open.spotify.com/playlist/PL',
  exported_at: '2026-07-24T00:00:00Z',
  track_count: 2,
  tracks: [
    {
      position: 1,
      title: 'Yellow',
      artists: ['Coldplay'],
      isrc: 'GBAYE0000940',
      duration_ms: 266000,
      platform_ids: { spotify: 's1', apple: null, youtube: null },
      match_confidence: 'high',
    },
    {
      position: 2,
      title: 'Nowhere Song',
      artists: ['Nobody'],
      platform_ids: { spotify: 's2', apple: null, youtube: null },
      match_confidence: 'none',
    },
  ],
};

const deps = { getProvider: () => new FakeDest() as MusicProvider };

describe('runJob — JSON re-import source', () => {
  it('matches imported tracks against the destination by ISRC', async () => {
    const importSource = parseExportJson(doc);
    const job = await runJob({ importSource, destination: 'apple' }, deps);

    expect(job.name).toBe('Restored');
    expect(job.sourcePlatform).toBe('spotify');
    expect(job.results).toHaveLength(2);
    expect(job.results[0].confidence).toBe('high'); // Yellow via ISRC
    expect(job.results[0].tier).toBe(1);
    expect(job.results[1].destination).toBeNull(); // Nowhere Song unmatched
  });

  it('allows re-import back to the origin platform (restore)', async () => {
    const importSource = parseExportJson(doc); // source_platform spotify
    // Destination spotify would be SAME_PLATFORM for a link, but a restore is ok.
    const job = await runJob(
      { importSource, destination: 'spotify' },
      { getProvider: () => new FakeDest() as unknown as MusicProvider },
    );
    expect(job.destinationPlatform).toBe('spotify');
  });
});
