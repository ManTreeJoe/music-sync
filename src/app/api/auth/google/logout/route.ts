// app/api/auth/google/logout/route.ts

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSession();
  session.google = undefined;
  session.googleOauth = undefined;
  await session.save();
  return NextResponse.json({ ok: true });
}
