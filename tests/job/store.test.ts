import { describe, it, expect, beforeEach } from 'vitest';
import {
  createJob,
  getJob,
  getProgress,
  setProgress,
  setStatus,
  completeJob,
  failJob,
  newJobId,
} from '../../src/lib/job/store';
import { _resetRedis } from '../../src/lib/redis';
import type { ReviewJob } from '../../src/lib/job/types';

beforeEach(() => _resetRedis());

const review = (n: number): ReviewJob => ({
  name: 'Mix',
  sourcePlatform: 'spotify',
  destinationPlatform: 'apple',
  sourceUrl: 'https://src/PL',
  results: Array.from({ length: n }, () => ({
    source: { title: 't', artists: ['a'], platformId: 'p', platform: 'spotify' as const },
    destination: null,
    confidence: 'none' as const,
    tier: 3 as const,
  })),
  skipped: { local: 0, episodes: 0, unavailable: 0 },
});

describe('job store', () => {
  it('newJobId is url-safe and unique', () => {
    const a = newJobId();
    const b = newJobId();
    expect(a).toMatch(/^[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });

  it('creates a pending job and reads it back', async () => {
    const id = newJobId();
    await createJob({ id, url: 'https://src/PL', destination: 'apple', total: 0 });
    const job = await getJob(id);
    expect(job?.status).toBe('pending');
    expect(job?.destination).toBe('apple');
    expect(job?.progress).toEqual({ done: 0, total: 0 });
  });

  it('progress uses the hot counter, not the stale record copy', async () => {
    const id = newJobId();
    await createJob({ id, url: 'u', destination: 'apple', total: 10 });
    await setProgress(id, 4, 10);
    expect(await getProgress(id)).toEqual({ done: 4, total: 10 });
    // getJob overlays the live counter onto the record.
    expect((await getJob(id))?.progress).toEqual({ done: 4, total: 10 });
  });

  it('completeJob makes the review available and fills progress', async () => {
    const id = newJobId();
    await createJob({ id, url: 'u', destination: 'apple', total: 0 });
    await setStatus(id, 'matching');
    await completeJob(id, review(3));
    const job = await getJob(id);
    expect(job?.status).toBe('awaiting_review');
    expect(job?.review?.results).toHaveLength(3);
    expect(job?.progress).toEqual({ done: 3, total: 3 });
  });

  it('failJob records the error code and message', async () => {
    const id = newJobId();
    await createJob({ id, url: 'u', destination: 'apple', total: 0 });
    await failJob(id, { code: 'PLAYLIST_NOT_FOUND', message: 'gone' });
    const job = await getJob(id);
    expect(job?.status).toBe('failed');
    expect(job?.error).toEqual({ code: 'PLAYLIST_NOT_FOUND', message: 'gone' });
  });

  it('getJob returns null for an unknown id', async () => {
    expect(await getJob('nope')).toBeNull();
  });
});
