'use client';

import type { JobProgress } from '@/lib/job/types';

/** Full-screen progress while a background match runs. */
export function MatchProgress({ progress }: { progress: JobProgress }) {
  const { done, total } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const known = total > 0;

  return (
    <main className="review wrap">
      <div className="matching">
        <div className="matching-label mono">Matching tracks</div>
        <div className="matching-count">
          {known ? (
            <>
              <span className="mono">{done}</span>
              <span className="matching-sep"> / </span>
              <span className="mono">{total}</span>
            </>
          ) : (
            <span className="mono">reading playlist…</span>
          )}
        </div>
        <div className="matching-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`matching-fill ${known ? '' : 'indeterminate'}`}
            style={known ? { width: `${pct}%` } : undefined}
          />
        </div>
        <p className="matching-hint">
          Resolving each track against the destination catalog. Large playlists
          keep matching in the background — you can leave this open.
        </p>
      </div>
    </main>
  );
}
