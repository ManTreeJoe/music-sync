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
