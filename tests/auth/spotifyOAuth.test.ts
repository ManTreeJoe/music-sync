import { describe, it, expect } from 'vitest';
import {
  exchangeCode,
  refreshTokens,
  getValidSpotifyToken,
} from '../../src/lib/auth/spotifyOAuth';
import type { SessionData } from '../../src/lib/session';

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('exchangeCode', () => {
  it('sends the PKCE code_verifier (no client secret) and maps the response', async () => {
    let body = '';
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 });
    }) as unknown as typeof fetch;

    const tokens = await exchangeCode({
      code: 'CODE',
      verifier: 'VER',
      redirectUri: 'https://app/cb',
      clientId: 'CID',
      now: 1_000_000,
      fetchImpl,
    });

    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code_verifier=VER');
    expect(body).toContain('client_id=CID');
    expect(body).not.toContain('client_secret');
    expect(tokens.accessToken).toBe('AT');
    expect(tokens.refreshToken).toBe('RT');
    expect(tokens.expiresAt).toBe(1_000_000 + 3600 * 1000);
  });
});

describe('refreshTokens', () => {
  it('keeps the old refresh token when the response omits one', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ access_token: 'AT2', expires_in: 3600 })) as unknown as typeof fetch;
    const t = await refreshTokens({ refreshToken: 'RT', clientId: 'CID', now: 5000, fetchImpl });
    expect(t.accessToken).toBe('AT2');
    expect(t.refreshToken).toBe('RT');
    expect(t.expiresAt).toBe(5000 + 3600 * 1000);
  });
});

describe('getValidSpotifyToken', () => {
  const clientId = 'CID';

  it('returns null when not connected', async () => {
    const session: SessionData = {};
    expect(await getValidSpotifyToken(session, { clientId, now: 0 })).toBeNull();
  });

  it('returns the current token when it is not near expiry', async () => {
    const session: SessionData = {
      spotify: { accessToken: 'AT', refreshToken: 'RT', expiresAt: 1_000_000 },
    };
    const fetchImpl = (async () => {
      throw new Error('should not refresh');
    }) as unknown as typeof fetch;
    expect(await getValidSpotifyToken(session, { clientId, now: 500_000, fetchImpl })).toBe('AT');
  });

  it('refreshes and updates the session when the token is expiring', async () => {
    const session: SessionData = {
      spotify: { accessToken: 'OLD', refreshToken: 'RT', expiresAt: 1000, userId: 'u1' },
    };
    const fetchImpl = (async () =>
      jsonResponse({ access_token: 'NEW', expires_in: 3600 })) as unknown as typeof fetch;
    const token = await getValidSpotifyToken(session, { clientId, now: 1000, fetchImpl });
    expect(token).toBe('NEW');
    expect(session.spotify?.accessToken).toBe('NEW');
    expect(session.spotify?.userId).toBe('u1'); // preserved
  });
});
