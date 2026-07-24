// app/api/inngest/route.ts
//
// The Inngest entry point. `inngest-cli dev` (local) and Inngest Cloud (prod)
// discover and invoke registered functions through here.

import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { matchPlaylist } from '@/inngest/functions/matchPlaylist';

export const runtime = 'nodejs';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [matchPlaylist],
});
