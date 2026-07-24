// app/api/jobs/[id]/route.ts
//
// Poll a background job's state. The client uses the SSE stream for live
// progress; this is the fetch that pulls the finished review (or the error),
// and a fallback for clients that can't hold an EventSource open.

import { NextResponse } from 'next/server';
import { getJob } from '@/lib/job/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json(
      { error: { code: 'PLAYLIST_NOT_FOUND', message: 'That job has expired or never existed.' } },
      { status: 404 },
    );
  }
  return NextResponse.json(job);
}
