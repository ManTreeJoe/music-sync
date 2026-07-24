import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getAppleDeveloperToken, _resetAppleTokenCache } from '../../src/lib/auth/appleToken';

// A real P-256 key so ES256 signing actually works.
const { privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

describe('getAppleDeveloperToken', () => {
  beforeEach(() => {
    _resetAppleTokenCache();
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    process.env.APPLE_KEY_ID = 'KEY7654321';
    // Stored with literal \n, as it would be in an env var.
    process.env.APPLE_PRIVATE_KEY = (privateKey as string).replace(/\n/g, '\\n');
  });

  it('signs ES256 with kid in the HEADER and the team id as issuer', () => {
    const now = 1_700_000_000;
    const token = getAppleDeveloperToken(now);
    const decoded = jwt.decode(token, { complete: true }) as {
      header: { alg: string; kid: string };
      payload: { iss: string; iat: number; exp: number };
    };

    expect(decoded.header.alg).toBe('ES256');
    expect(decoded.header.kid).toBe('KEY7654321'); // header, not payload
    expect(decoded.payload).not.toHaveProperty('kid');
    expect(decoded.payload.iss).toBe('TEAM123456');
    expect(decoded.payload.iat).toBe(now);

    // exp must be within 6 months of iat.
    const sixMonths = 60 * 60 * 24 * 180;
    expect(decoded.payload.exp - decoded.payload.iat).toBeLessThanOrEqual(sixMonths);
    expect(decoded.payload.exp).toBeGreaterThan(now);
  });

  it('caches within the validity window', () => {
    const a = getAppleDeveloperToken(1_700_000_000);
    const b = getAppleDeveloperToken(1_700_000_000 + 10);
    expect(a).toBe(b);
  });
});
