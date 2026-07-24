// lib/job/errors.ts
//
// Map low-level failures to a coded, user-actionable JobError. Shared by the
// read (runJob) and write (runWrite) paths.

import { HttpError } from '../http';
import { JobError } from './types';
import type { Platform } from '../providers/types';

export interface ToJobErrorOpts {
  /** True when the failure happened on a write (create/append) rather than a read. */
  write?: boolean;
  /** Which platform the call was against — sharpens the 401/403 interpretation. */
  platform?: Platform;
}

export function toJobError(e: unknown, opts: ToJobErrorOpts = {}): JobError {
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
        // On a write, a 401 means our access token was rejected (refresh failed) —
        // except Apple, where 401 is a bad *developer* token (a server-side config
        // problem, not something the user can fix by reconnecting).
        if (opts.write) {
          return opts.platform === 'apple'
            ? new JobError('PROVIDER_UNAVAILABLE', 'The server’s Apple Music credentials were rejected.')
            : new JobError('AUTH_EXPIRED', 'Your connection expired. Reconnect to continue.');
        }
        return new JobError('AUTH_REQUIRED', 'The service rejected our credentials. Reconnect and try again.');
      case 403:
        // On a write, a 403 is a stale/expired user token (Apple’s in particular
        // expires ~every 6 months and fails silently) — the reconnect canary.
        if (opts.write) {
          return new JobError('AUTH_EXPIRED', 'Your connection expired. Reconnect to continue.');
        }
        return new JobError('PLAYLIST_PRIVATE', "That's private or not writable — connect the right account.");
      case 429:
        return new JobError('RATE_LIMITED', 'The service is rate-limiting us. Try again in a moment.');
      default:
        return new JobError('PLATFORM_ERROR', `The music service returned an error (${e.status}).`);
    }
  }

  return new JobError('PLATFORM_ERROR', 'Something went wrong talking to the music service.');
}
