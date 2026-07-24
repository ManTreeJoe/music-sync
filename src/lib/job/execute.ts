// lib/job/execute.ts
//
// Run a match into the job store. This is the single place that drives a
// background job to a terminal state, shared by two callers:
//
//   • the /api/jobs route, via Next's after() — runs in-process after the
//     response is sent, so it may use the caller's session tokens (they never
//     leave the process).
//   • the Inngest function — runs later in a separate invocation with no
//     session, so it reads sources publicly (no tokens in event payloads).
//
// Either way the contract is the same: flip status to 'matching', stream
// progress to the hot counter, then complete or fail.

import { runJob, type RunJobDeps } from './runJob';
import { setStatus, setProgress, completeJob, failJob } from './store';
import { toJobError } from './errors';
import { JobError } from './types';
import type { ParsedImport } from '../providers/jsonFile';
import type { Platform } from '../providers/types';

export interface ExecuteMatchInput {
  id: string;
  /** A platform link, or omit and pass importSource for a JSON re-import. */
  url?: string;
  importSource?: ParsedImport;
  destination: Platform;
  /** Extra runJob deps (source auth, provider overrides). Progress is wired here. */
  deps?: Omit<RunJobDeps, 'onProgress'>;
}

export async function executeMatchJob(input: ExecuteMatchInput): Promise<void> {
  const { id, url, importSource, destination, deps } = input;
  try {
    await setStatus(id, 'matching');
    const review = await runJob(
      { url, importSource, destination },
      { ...deps, onProgress: (done, total) => void setProgress(id, done, total) },
    );
    await completeJob(id, review);
  } catch (e) {
    const err = e instanceof JobError ? e : toJobError(e);
    await failJob(id, { code: err.code, message: err.message });
  }
}
