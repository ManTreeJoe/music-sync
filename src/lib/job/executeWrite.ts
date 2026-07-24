// lib/job/executeWrite.ts
//
// Run a write into the job store. Like executeMatchJob, this is the single
// place that drives a write job to a terminal state — but a write always needs
// the destination user token, so it only ever runs in-process (via the route's
// after()), never on Inngest. Progress streams to the hot counter as batches
// land; failures are recorded on the record rather than thrown.

import { runWrite, PartialWriteError, type WriteInput, type RunWriteDeps } from './write';
import { setStatus, setProgress, completeWriteJob, failJob, partialWriteJob } from './store';
import { toJobError } from './errors';
import { JobError } from './types';

export interface ExecuteWriteInput {
  id: string;
  input: WriteInput;
  deps: Omit<RunWriteDeps, 'onProgress'>;
}

export async function executeWriteJob({ id, input, deps }: ExecuteWriteInput): Promise<void> {
  try {
    await setStatus(id, 'writing');
    const result = await runWrite(input, {
      ...deps,
      onProgress: (added, total) => void setProgress(id, added, total),
    });
    await completeWriteJob(id, result);
  } catch (e) {
    if (e instanceof PartialWriteError) {
      // Record what landed + how to finish, so the UI can offer "resume".
      await setProgress(id, e.partial.added, e.partial.added + e.partial.remaining.length);
      await partialWriteJob(id, { code: e.code, message: e.message }, e.partial);
      return;
    }
    const err = e instanceof JobError ? e : toJobError(e);
    if (err.code === 'AUTH_EXPIRED') {
      // The silent-failure canary: a user token expired mid-write. Worth a log
      // line — a cluster of these means someone's connection quietly went stale.
      console.warn(`[write ${id}] AUTH_EXPIRED — destination user token rejected`);
    }
    await failJob(id, { code: err.code, message: err.message });
  }
}
