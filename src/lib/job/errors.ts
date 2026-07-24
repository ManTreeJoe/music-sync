// lib/job/errors.ts
//
// Map low-level failures to a coded, user-actionable JobError. Shared by the
// read (runJob) and write (runWrite) paths.

import { HttpError } from '../http';
import { JobError } from './types';

export function toJobError(e: unknown): JobError {
  if (e instanceof JobError) return e;

  // A missing credential surfaces as "Missing required env var: ...".
  if (e instanceof Error && /Missing required env var/.test(e.message)) {
    return new JobError(
      'PROVIDER_UNAVAILABLE',
      'The server is missing the API credentials for one of these services.',
    );
  }

  if (e instanceof HttpError) {
    switch (e.status) {
      case 404:
        return new JobError('PLAYLIST_NOT_FOUND', "We couldn't find that playlist. Is it public?");
      case 401:
        return new JobError('AUTH_REQUIRED', 'The service rejected our credentials. Reconnect and try again.');
      case 403:
        return new JobError('PLAYLIST_PRIVATE', "That's private or not writable — connect the right account.");
      case 429:
        return new JobError('RATE_LIMITED', 'The service is rate-limiting us. Try again in a moment.');
      default:
        return new JobError('PLATFORM_ERROR', `The music service returned an error (${e.status}).`);
    }
  }

  return new JobError('PLATFORM_ERROR', 'Something went wrong talking to the music service.');
}
