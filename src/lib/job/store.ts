// lib/job/store.ts
//
// Durable state for background match jobs, backed by the shared KV (Upstash in
// prod, in-memory in dev/tests). Two keys per job:
//
//   job:{id}            the full JobRecord, 24h TTL
//   job:{id}:progress   a hot {done,total} counter, written per track so the
//                       SSE stream can report progress without rewriting the
//                       whole record on every step
//
// The record and the counter are kept loosely in sync on purpose: the counter
// is cheap to bump frequently; the record is rewritten only on status changes.

import { redis } from '../redis';
import type {
  JobErrorCode,
  JobProgress,
  JobRecord,
  JobStatus,
  ReviewJob,
} from './types';
import type { Platform } from '../providers/types';

const TTL = 60 * 60 * 24; // 24h — matches the job's useful lifetime

const recordKey = (id: string) => `job:${id}`;
const progressKey = (id: string) => `job:${id}:progress`;

/** A URL-safe id. crypto.randomUUID is available on the Node runtime. */
export function newJobId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 21);
}

export async function createJob(input: {
  id: string;
  url: string;
  destination: Platform;
  total: number;
}): Promise<JobRecord> {
  const record: JobRecord = {
    id: input.id,
    status: 'pending',
    destination: input.destination,
    url: input.url,
    progress: { done: 0, total: input.total },
    createdAt: Date.now(),
  };
  await redis.set(recordKey(input.id), record, { ex: TTL });
  await redis.set(progressKey(input.id), record.progress, { ex: TTL });
  return record;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const record = await redis.get<JobRecord>(recordKey(id));
  if (!record) return null;
  // Prefer the hot counter — the record's embedded progress may be stale.
  const live = await redis.get<JobProgress>(progressKey(id));
  if (live) record.progress = live;
  return record;
}

/** Just the hot counter — what the stream polls between status changes. */
export async function getProgress(id: string): Promise<JobProgress | null> {
  return redis.get<JobProgress>(progressKey(id));
}

/** Bump the hot counter. Total is carried on the record; done climbs here. */
export async function setProgress(id: string, done: number, total: number): Promise<void> {
  await redis.set(progressKey(id), { done, total }, { ex: TTL });
}

async function patch(id: string, changes: Partial<JobRecord>): Promise<void> {
  const cur = await redis.get<JobRecord>(recordKey(id));
  if (!cur) return;
  await redis.set(recordKey(id), { ...cur, ...changes }, { ex: TTL });
}

export function setStatus(id: string, status: JobStatus): Promise<void> {
  return patch(id, { status });
}

export async function completeJob(id: string, review: ReviewJob): Promise<void> {
  await setProgress(id, review.results.length, review.results.length);
  await patch(id, {
    status: 'awaiting_review',
    review,
    progress: { done: review.results.length, total: review.results.length },
  });
}

export function failJob(id: string, error: { code: JobErrorCode; message: string }): Promise<void> {
  return patch(id, { status: 'failed', error });
}
