'use client';

import { useEffect, useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { ReviewScreen } from '@/components/ReviewScreen';
import { JOB_HANDOFF_KEY } from '@/components/LinkForm';
import { buildSampleJob } from '@/lib/demo/sampleJob';
import type { ReviewJob } from '@/lib/job/types';

export default function ReviewPage() {
  const [job, setJob] = useState<ReviewJob | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(JOB_HANDOFF_KEY);
      setJob(stored ? (JSON.parse(stored) as ReviewJob) : buildSampleJob());
    } catch {
      setJob(buildSampleJob());
    }
    setReady(true);
  }, []);

  return (
    <>
      <SiteHeader />
      {ready && job ? (
        <ReviewScreen job={job} />
      ) : (
        <main className="review wrap">
          <p className="review-loading">Loading review…</p>
        </main>
      )}
    </>
  );
}
