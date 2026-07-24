// lib/job/types.ts
//
// Shapes shared by the API route, the demo, and the review UI.

import type { MatchResult, Platform } from '../providers/types';

/** The data the review screen renders — from a real job or the sample. */
export interface ReviewJob {
  name: string;
  sourcePlatform: Platform;
  destinationPlatform: Platform;
  sourceUrl: string;
  results: MatchResult[];
  skipped: { local: number; episodes: number; unavailable: number };
}

/** A job is either a match (read + resolve) or a write (create/append). */
export type JobKind = 'match' | 'write';

/**
 * Lifecycle across both kinds. Match: pending → matching → awaiting_review.
 * Write: pending → writing → complete. Either can end in failed.
 * `awaiting_review` and `complete` are both terminal-success states.
 */
export type JobStatus =
  | 'pending'
  | 'matching'
  | 'awaiting_review'
  | 'writing'
  | 'complete'
  | 'failed';

/** Hot progress counter, updated per track/batch as the job runs. */
export interface JobProgress {
  done: number;
  total: number;
}

/** The stored result of a write job — mirrors runWrite's WriteResult. */
export interface WriteSummary {
  playlistId: string;
  playlistUrl: string;
  added: number;
  skippedDupes: number;
  unmatched: number;
}

/**
 * The durable record for a background job, stored in Redis. It carries enough
 * to render the result once the job finishes, plus the progress the client
 * streams while it runs. Only one of `review` / `writeResult` is set, per kind.
 */
export interface JobRecord {
  id: string;
  kind: JobKind;
  status: JobStatus;
  destination: Platform;
  url: string;
  progress: JobProgress;
  /** Present once a match reaches awaiting_review. */
  review?: ReviewJob;
  /** Present once a write reaches complete. */
  writeResult?: WriteSummary;
  /** Present once status === 'failed'. */
  error?: { code: JobErrorCode; message: string };
  createdAt: number;
}

export type JobErrorCode =
  | 'INVALID_URL'
  | 'SAME_PLATFORM'
  | 'PROVIDER_UNAVAILABLE'
  | 'PLAYLIST_NOT_FOUND'
  | 'PLAYLIST_PRIVATE'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'PLAYLIST_TOO_LARGE'
  | 'DEST_NOT_WRITABLE'
  | 'QUOTA_EXCEEDED'
  | 'PARTIAL_WRITE'
  | 'PLATFORM_ERROR';

export class JobError extends Error {
  code: JobErrorCode;
  constructor(code: JobErrorCode, message: string) {
    super(message);
    this.name = 'JobError';
    this.code = code;
  }
}
