'use client';

import { useEffect, useState } from 'react';
import type { JobProgress, JobRecord } from './job/types';

export type JobStreamState =
  | { phase: 'connecting'; progress: JobProgress }
  | { phase: 'running'; progress: JobProgress }
  | { phase: 'ready'; progress: JobProgress; record: JobRecord }
  | { phase: 'error'; progress: JobProgress; message: string; code?: string; record?: JobRecord };

/**
 * Subscribe to a background job (match or write): stream progress over SSE,
 * then fetch the finished record. Falls back to a one-shot poll if the stream
 * can't connect (some proxies buffer text/event-stream). Callers read
 * `record.review` (match) or `record.writeResult` (write) once ready.
 */
export function useJobStream(jobId: string | null): JobStreamState {
  const [state, setState] = useState<JobStreamState>({
    phase: 'connecting',
    progress: { done: 0, total: 0 },
  });

  useEffect(() => {
    if (!jobId) return;
    let done = false;

    async function loadRecord() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = (await res.json()) as JobRecord & { error?: { message?: string } };
        if (done) return;
        if (!res.ok) {
          setState((s) => ({
            phase: 'error',
            progress: s.progress,
            message: data?.error?.message ?? 'Job failed.',
            code: data?.error?.code,
          }));
          return;
        }
        if (data.status === 'awaiting_review' || data.status === 'complete') {
          setState((s) => ({ phase: 'ready', progress: s.progress, record: data }));
        } else if (data.status === 'failed') {
          setState((s) => ({
            phase: 'error',
            progress: s.progress,
            message: data.error?.message ?? 'Job failed.',
            code: data.error?.code,
            record: data, // carries `partial` for a resumable write
          }));
        }
      } catch {
        if (!done) setState((s) => ({ phase: 'error', progress: s.progress, message: 'Lost the connection.' }));
      }
    }

    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.addEventListener('progress', (e) => {
      const p = JSON.parse((e as MessageEvent).data) as JobProgress;
      setState((s) => (s.phase === 'ready' ? s : { phase: 'running', progress: p }));
    });
    es.addEventListener('done', () => {
      es.close();
      void loadRecord();
    });
    es.addEventListener('error', (e) => {
      // Two cases: our explicit `error` event (has data), or a transport drop.
      // Either way, fetch the full record so a resumable write's `partial`
      // payload is available — the SSE event only carries code + message.
      if ((e as MessageEvent).data) es.close();
      void loadRecord();
    });

    return () => {
      done = true;
      es.close();
    };
  }, [jobId]);

  return state;
}
