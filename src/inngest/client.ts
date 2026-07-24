// inngest/client.ts
//
// The Inngest client. In production, Inngest owns durable execution of the
// match job so a 200+ track playlist isn't bound by a single function's
// timeout. Locally, `npx inngest-cli dev` discovers the functions via the
// /api/inngest route.

import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'playlist-bridge' });

/** Event names, centralized so producers and consumers can't drift. */
export const EVENTS = {
  matchRequested: 'job/match.requested',
} as const;

/** Payload for a background match. Note: no auth tokens — background reads are
 *  public. Private-source reads stay on the in-process path. */
export interface MatchRequestedData {
  jobId: string;
  url: string;
  destination: 'spotify' | 'apple' | 'youtube';
}
