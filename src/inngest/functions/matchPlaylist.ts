// inngest/functions/matchPlaylist.ts
//
// Durable background match. Triggered by `job/match.requested`; reads the
// source publicly, matches every track against the destination, and drives the
// job record to a terminal state in Redis. The client streams progress from
// that record — it never waits on this function directly.
//
// Concurrency is capped so a burst of jobs can't blow the shared per-platform
// rate limits or (for YouTube) the daily quota.

import { inngest, EVENTS, type MatchRequestedData } from '../client';
import { executeMatchJob } from '../../lib/job/execute';

export const matchPlaylist = inngest.createFunction(
  {
    id: 'match-playlist',
    name: 'Match playlist',
    concurrency: { limit: 3 },
    retries: 2,
  },
  { event: EVENTS.matchRequested },
  async ({ event, step }) => {
    const { jobId, url, destination } = event.data as MatchRequestedData;

    // executeMatchJob owns its own status/progress/terminal writes and never
    // throws (it maps failures onto the job record), so a single step captures
    // the whole run. Background reads are public — no session, no tokens.
    await step.run('match', () => executeMatchJob({ id: jobId, url, destination }).then(() => ({ jobId })));

    return { jobId };
  },
);
