// app/api/jobs/[id]/stream/route.ts
//
// Live progress for a background match over Server-Sent Events. Emits a
// `progress` event per tick, then a terminal `done` (matching finished, review
// ready to fetch) or `error`, and closes. The client fetches the finished
// review from /api/jobs/{id} once it sees `done`.
//
// Streaming works on the Node runtime — no edge required.

import { getJob } from '@/lib/job/store';
import { sseEvent, sseComment } from '@/lib/job/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TICK_MS = 400;
const MAX_MS = 1000 * 60 * 5; // stop holding the connection after 5 minutes

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now();
      let closed = false;
      const send = (s: string) => {
        if (!closed) controller.enqueue(encoder.encode(s));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Stop promptly if the client navigates away.
      req.signal.addEventListener('abort', close);

      let lastDone = -1;
      while (!closed) {
        const job = await getJob(id);
        if (!job) {
          send(sseEvent('error', { code: 'PLAYLIST_NOT_FOUND', message: 'Job not found.' }));
          break;
        }

        // Only re-send progress when it actually moved — keeps the stream quiet.
        if (job.progress.done !== lastDone) {
          lastDone = job.progress.done;
          send(sseEvent('progress', { done: job.progress.done, total: job.progress.total }));
        }

        if (job.status === 'awaiting_review') {
          send(sseEvent('done', { jobId: id }));
          break;
        }
        if (job.status === 'failed') {
          send(
            sseEvent('error', {
              code: job.error?.code ?? 'PLATFORM_ERROR',
              message: job.error?.message ?? 'The match failed.',
            }),
          );
          break;
        }

        if (Date.now() - started > MAX_MS) {
          send(sseComment('timeout')); // client falls back to polling /api/jobs/{id}
          break;
        }

        await new Promise((r) => setTimeout(r, TICK_MS));
      }

      close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
