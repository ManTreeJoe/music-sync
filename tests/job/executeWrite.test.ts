import { describe, it, expect, beforeEach } from 'vitest';
import { executeWriteJob } from '../../src/lib/job/executeWrite';
import { createJob, getJob, newJobId } from '../../src/lib/job/store';
import { _resetRedis } from '../../src/lib/redis';
import type { Auth, MusicProvider, Platform, Playlist, Track } from '../../src/lib/providers/types';

beforeEach(() => _resetRedis());

class FakeDest implements MusicProvider {
  platform: Platform = 'apple';
  added: string[][] = [];
  progressTicks: number[] = [];
  parseUrl() {
    return null;
  }
  async getPlaylist(): Promise<Playlist> {
    throw new Error('x');
  }
  async getTracks(): Promise<Track[]> {
    return [];
  }
  findByIsrc() {
    return null;
  }
  async search() {
    return [];
  }
  async createPlaylist(name: string): Promise<Playlist> {
    return { id: 'NEW', name, trackCount: 0, platform: 'apple', url: 'https://new' };
  }
  async addTracks(_id: string, ids: string[], _auth: Auth, onProgress?: (n: number) => void) {
    // Two Apple batches (25/batch) — here just report a mid + final tick.
    this.added.push(ids);
    onProgress?.(Math.min(1, ids.length));
    onProgress?.(ids.length);
  }
  async getWritablePlaylists(): Promise<Playlist[]> {
    return [];
  }
  estimateWriteCost(n: number) {
    return n;
  }
}

const auth: Auth = { kind: 'none' };

describe('executeWriteJob', () => {
  it('drives a write job to complete with the result and full progress', async () => {
    const id = newJobId();
    await createJob({ id, kind: 'write', url: '', destination: 'apple', total: 2 });
    const dest = new FakeDest();

    await executeWriteJob({
      id,
      input: { destination: 'apple', mode: 'create', name: 'Mix', tracks: [{ platformId: 'a' }, { platformId: 'b' }] },
      deps: { auth, getProvider: () => dest },
    });

    const job = await getJob(id);
    expect(job?.status).toBe('complete');
    expect(job?.writeResult?.added).toBe(2);
    expect(job?.writeResult?.playlistUrl).toBe('https://new');
    expect(job?.progress).toEqual({ done: 2, total: 2 });
    expect(dest.added[0]).toEqual(['a', 'b']);
  });

  it('records a failure (e.g. append without a target) on the record', async () => {
    const id = newJobId();
    await createJob({ id, kind: 'write', url: '', destination: 'apple', total: 1 });

    await executeWriteJob({
      id,
      input: { destination: 'apple', mode: 'append', tracks: [{ platformId: 'a' }] },
      deps: { auth, getProvider: () => new FakeDest() },
    });

    const job = await getJob(id);
    expect(job?.status).toBe('failed');
    expect(job?.error?.code).toBe('DEST_NOT_WRITABLE');
  });

  it('stores a resume plan when the write fails partway', async () => {
    const id = newJobId();
    await createJob({ id, kind: 'write', url: '', destination: 'apple', total: 4 });

    // addTracks lands 2 of 4, then throws.
    class HalfDest extends FakeDest {
      async addTracks(_id: string, ids: string[], _auth: Auth, onProgress?: (n: number) => void) {
        onProgress?.(2);
        throw new Error('interrupted');
      }
    }

    await executeWriteJob({
      id,
      input: {
        destination: 'apple',
        mode: 'create',
        name: 'Mix',
        tracks: [{ platformId: 'a' }, { platformId: 'b' }, { platformId: 'c' }, { platformId: 'd' }],
      },
      deps: { auth, getProvider: () => new HalfDest() },
    });

    const job = await getJob(id);
    expect(job?.status).toBe('failed');
    expect(job?.error?.code).toBe('PARTIAL_WRITE');
    expect(job?.partial?.added).toBe(2);
    expect(job?.partial?.remaining.map((t) => t.platformId)).toEqual(['c', 'd']);
    expect(job?.progress).toEqual({ done: 2, total: 4 });
  });
});
