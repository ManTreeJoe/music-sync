// app/api/auth/apple/route.ts
//
// Hand the MusicKit developer token to the client so MusicKit JS can configure
// itself and open Apple's auth flow. The developer token is meant to be used in
// the browser; the .p8 private key never leaves the server.

import { NextResponse } from 'next/server';
import { getAppleDeveloperToken } from '@/lib/auth/appleToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ developerToken: getAppleDeveloperToken() });
  } catch {
    return NextResponse.json(
      { error: 'Apple Music is not configured on the server.' },
      { status: 501 },
    );
  }
}
