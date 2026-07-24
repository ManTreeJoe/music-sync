'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { ReviewScreen } from '@/components/ReviewScreen';
import { MatchProgress } from '@/components/MatchProgress';
import { useJobStream } from '@/lib/useJobStream';
import { buildSampleJob } from '@/lib/demo/sampleJob';

function ReviewBody() {
  const params = useSearchParams();
  const jobId = params.get('job');

  // No job id → the demo/sample review (the "see an example" entry point).
  if (!jobId) {
    return <ReviewScreen job={buildSampleJob()} />;
  }
  return <StreamedReview jobId={jobId} />;
}

function StreamedReview({ jobId }: { jobId: string }) {
  const state = useJobStream(jobId);

  if (state.phase === 'ready') {
    return <ReviewScreen job={state.job} />;
  }
  if (state.phase === 'error') {
    return (
      <main className="review wrap">
        <div className="matching">
          <div className="matching-label mono">Couldn&apos;t finish</div>
          <p className="matching-hint">{state.message}</p>
          <a className="btn btn-primary" href="/">
            ← Start over
          </a>
        </div>
      </main>
    );
  }
  return <MatchProgress progress={state.progress} />;
}

export default function ReviewPage() {
  return (
    <>
      <SiteHeader />
      <Suspense
        fallback={
          <main className="review wrap">
            <p className="review-loading">Loading review…</p>
          </main>
        }
      >
        <ReviewBody />
      </Suspense>
    </>
  );
}
