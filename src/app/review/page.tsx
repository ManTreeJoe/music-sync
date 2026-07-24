import { SiteHeader } from '@/components/SiteHeader';
import { ReviewScreen } from '@/components/ReviewScreen';
import { buildSampleJob } from '@/lib/demo/sampleJob';

// Server component: runs the real matching engine on a sample source playlist
// and hands the results to the review UI. Swap buildSampleJob() for a real job
// lookup once the provider adapters + Inngest wiring exist.
export default function ReviewPage() {
  const job = buildSampleJob();
  return (
    <>
      <SiteHeader />
      <ReviewScreen job={job} />
    </>
  );
}
