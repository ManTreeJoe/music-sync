import { describe, it, expect } from 'vitest';
import { runWrite } from '../../src/lib/job/write';
import { JobError } from '../../src/lib/job/types';
import type { Auth, MusicProvider, Platform, Playlist, Track } from '../../src/lib/providers/types';

const track = (t: Partial<Track>): Track => ({
  title: '',
  artists: [],
  platformId: '',
  platform: 'apple',
  ...t,
});

class FakeDest implements MusicProvider {
  platform: Platform;
  added: string[][] = [];
  created: { name: string } | null = null;
  constructor(
    platform: Platform,
    private existing: Track[] = [],
    private cost = 0,
  ) {
    this.platform = platform;
  }
  parseUrl() {
    return null;
  }
  async getPlaylist(): Promise<Playlist> {
    throw new Error('unused');
  }
  async getTracks(): Promise<Track[]> {
    return this.existing;
  }
  findByIsrc() {
    return null;
  }
  async search() {
    return [];
  }
  async createPlaylist(name: string): Promise<Playlist> {
    this.created = { name };
    return { id: 'NEW', name, trackCount: 0, platform: this.platform, url: 'https://new' };
  }
  async addTracks(_id: string, ids: string[]): Promise<void> {
    this.added.push(ids);
  }
  async getWritablePlaylists(): Promise<Playlist[]> {
    return [];
  }
  estimateWriteCost(n: number): number {
    return this.cost || n;
  }
}

const auth: Auth = { kind: 'none' };

describe('runWrite — create', () => {
  it('creates a playlist and adds all tracks, deduping the input', async () => {
    const dest = new FakeDest('apple');
    const res = await runWrite(
      {
        destination: 'apple',
        mode: 'create',
        name: 'My Mix',
        tracks: [{ platformId: 'a' }, { platformId: 'b' }, { platformId: 'a' }],
        unmatchedCount: 2,
      },
      { auth, getProvider: () => dest },
    );
    expect(dest.created?.name).toBe('My Mix');
    expect(dest.added[0]).toEqual(['a', 'b']); // 'a' deduped
    expect(res.added).toBe(2);
    expect(res.skippedDupes).toBe(1);
    expect(res.unmatched).toBe(2);
    expect(res.playlistUrl).toBe('https://new');
  });
});

describe('runWrite — append', () => {
  it('skips tracks already present by platform id and by ISRC', async () => {
    const dest = new FakeDest('spotify', [
      track({ platformId: 'x', platform: 'spotify' }),
      track({ platformId: 'zzz', isrc: 'ISRC1', platform: 'spotify' }),
    ]);
    const res = await runWrite(
      {
        destination: 'spotify',
        mode: 'append',
        playlistId: 'PL',
        tracks: [
          { platformId: 'x' }, // dup by id
          { platformId: 'y', isrc: 'ISRC1' }, // dup by isrc
          { platformId: 'z', isrc: 'ISRC2' }, // new
        ],
      },
      { auth, getProvider: () => dest },
    );
    expect(dest.added[0]).toEqual(['z']);
    expect(res.added).toBe(1);
    expect(res.skippedDupes).toBe(2);
    expect(res.playlistUrl).toContain('open.spotify.com/playlist/PL');
  });

  it('refuses without a target playlist', async () => {
    const dest = new FakeDest('spotify');
    await expect(
      runWrite(
        { destination: 'spotify', mode: 'append', tracks: [{ platformId: 'a' }] },
        { auth, getProvider: () => dest },
      ),
    ).rejects.toMatchObject({ code: 'DEST_NOT_WRITABLE' });
  });
});

describe('runWrite — YouTube quota', () => {
  it('refuses when quota is insufficient (before writing)', async () => {
    const dest = new FakeDest('youtube', [], 5050);
    await expect(
      runWrite(
        { destination: 'youtube', mode: 'create', name: 'x', tracks: [{ platformId: 'v1' }] },
        { auth, getProvider: () => dest, canAfford: () => false, charge: () => {} },
      ),
    ).rejects.toBeInstanceOf(JobError);
    expect(dest.added).toHaveLength(0); // nothing written
  });

  it('charges quota after a successful write', async () => {
    const dest = new FakeDest('youtube', [], 100);
    let charged = 0;
    const res = await runWrite(
      { destination: 'youtube', mode: 'create', name: 'x', tracks: [{ platformId: 'v1' }] },
      { auth, getProvider: () => dest, canAfford: () => true, charge: (u) => void (charged = u) },
    );
    expect(res.added).toBe(1);
    expect(charged).toBe(100);
  });
});
