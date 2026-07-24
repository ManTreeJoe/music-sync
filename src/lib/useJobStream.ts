'use client';

import { useEffect, useState } from 'react';
import type { JobProgress, ReviewJob } from './job/types';

export type JobStreamState =
  | { phase: 'connecting'; progress: JobProgress }
  | { phase: 'matching'; progress: JobProgress }
  | { phase: 'ready'; progress: JobProgress; job: ReviewJob }
  | { phase: 'error'; progress: JobProgress; message: string };

/**
 * Subscribe to a background match: stream progress over SSE, then fetch the
 * finished review. Falls back to a one-shot poll if the stream can't connect
 * (some proxies buffer text/event-stream).
 */
export function useJobStream(jobId: string | null): JobStreamState {
  const [state, setState] = useState<JobStreamState>({
    phase: 'connecting',
    progress: { done: 0, total: 0 },
  });

  useEffect(() => {
    if (!jobId) return;
    let done = false;

    async function loadReview() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        if (done) return;
        if (!res.ok) {
          setState((s) => ({ phase: 'error', progress: s.progress, message: data?.error?.message ?? 'Match failed.' }));
          return;
        }
        if (data.status === 'awaiting_review' && data.review) {
          setState((s) => ({ phase: 'ready', progress: s.progress, job: data.review }));
        } else if (data.status === 'failed') {
          setState((s) => ({ phase: 'error', progress: s.progress, message: data.error?.message ?? 'Match failed.' }));
        }
      } catch {
        if (!done) setState((s) => ({ phase: 'error', progress: s.progress, message: 'Lost the connection.' }));
      }
    }

    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.addEventListener('progress', (e) => {
      const p = JSON.parse((e as MessageEvent).data) as JobProgress;
      setState((s) => (s.phase === 'ready' ? s : { phase: 'matching', progress: p }));
    });
    es.addEventListener('done', () => {
      es.close();
      void loadReview();
    });
    es.addEventListener('error', (e) => {
      // Two cases: our explicit `error` event (has data), or a transport drop.
      const data = (e as MessageEvent).data;
      if (data) {
        es.close();
        const parsed = JSON.parse(data) as { message?: string };
        setState((s) => ({ phase: 'error', progress: s.progress, message: parsed.message ?? 'Match failed.' }));
      } else {
        // Transport hiccup — poll once for a terminal state instead of hanging.
        void loadReview();
      }
    });

    return () => {
      done = true;
      es.close();
    };
  }, [jobId]);

  return state;
}
