// lib/auth/sessionAuth.ts
//
// Build the destination Auth for a write from the connected session. Throws a
// coded AUTH_REQUIRED if the relevant account isn't connected. Mutates the
// session on token refresh — the caller must session.save().

import type { SessionData } from '../session';
import type { Auth, Platform } from '../providers/types';
import { getValidSpotifyToken } from './spotifyOAuth';
import { getValidGoogleToken } from './googleOAuth';
import { getAppleDeveloperToken } from './appleToken';
import { JobError } from '../job/types';

export async function destAuthFor(platform: Platform, session: SessionData): Promise<Auth> {
  if (platform === 'spotify') {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!session.spotify || !clientId) {
      throw new JobError('AUTH_REQUIRED', 'Connect Spotify to write.');
    }
    const token = await getValidSpotifyToken(session, { clientId });
    if (!token) throw new JobError('AUTH_REQUIRED', 'Connect Spotify to write.');
    return { kind: 'bearer', token };
  }

  if (platform === 'youtube') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!session.google || !clientId || !clientSecret) {
      throw new JobError('AUTH_REQUIRED', 'Connect YouTube to write.');
    }
    const token = await getValidGoogleToken(session, { clientId, clientSecret });
    if (!token) throw new JobError('AUTH_REQUIRED', 'Connect YouTube to write.');
    return { kind: 'bearer', token };
  }

  // apple
  if (!session.apple) {
    throw new JobError('AUTH_REQUIRED', 'Connect Apple Music to write.');
  }
  return {
    kind: 'apple',
    developerToken: getAppleDeveloperToken(),
    userToken: session.apple.userToken,
  };
}
