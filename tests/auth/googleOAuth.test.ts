import { describe, it, expect } from 'vitest';
import { exchangeCode, refreshTokens, getValidGoogleToken } from '../../src/lib/auth/googleOAuth';
import type { SessionData } from '../../src/lib/session';

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('google exchangeCode', () => {
  it('sends client_secret + code_verifier and maps the response', async () => {
    let body = '';
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3599 });
    }) as unknown as typeof fetch;

    const t = await exchangeCode({
      code: 'C',
      verifier: 'V',
      redirectUri: 'https://app/cb',
      clientId: 'CID',
      clientSecret: 'SECRET',
      now: 2_000,
      fetchImpl,
    });
    expect(body).toContain('client_secret=SECRET');
    expect(body).toContain('code_verifier=V');
    expect(t.accessToken).toBe('AT');
    expect(t.expiresAt).toBe(2_000 + 3599 * 1000);
  });
});

describe('getValidGoogleToken', () => {
  const base = { clientId: 'CID', clientSecret: 'SECRET' };

  it('returns null when not connected', async () => {
    expect(await getValidGoogleToken({}, { ...base, now: 0 })).toBeNull();
  });

  it('refreshes when expiring and keeps the refresh token', async () => {
    const session: SessionData = {
      google: { accessToken: 'OLD', refreshToken: 'RT', expiresAt: 1000 },
    };
    const fetchImpl = (async () =>
      jsonResponse({ access_token: 'NEW', expires_in: 3600 })) as unknown as typeof fetch;
    const token = await getValidGoogleToken(session, { ...base, now: 1000, fetchImpl });
    expect(token).toBe('NEW');
    expect(session.google?.refreshToken).toBe('RT');
  });
});

describe('refreshTokens', () => {
  it('maps expiry from now', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ access_token: 'A', expires_in: 10 })) as unknown as typeof fetch;
    const t = await refreshTokens({ refreshToken: 'RT', clientId: 'C', clientSecret: 'S', now: 100, fetchImpl });
    expect(t.expiresAt).toBe(100 + 10 * 1000);
    expect(t.refreshToken).toBe('RT');
  });
});
