// lib/job/sse.ts
//
// Server-Sent Events formatting, kept pure so it can be unit-tested without a
// running stream. One event is a `event:` line plus a JSON `data:` line and a
// blank line terminator.

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A comment line — used as a keepalive that clients ignore. */
export function sseComment(text: string): string {
  return `: ${text}\n\n`;
}

export type JobStreamEvent =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };
