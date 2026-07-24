import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { base64url, generateVerifier, challengeFromVerifier, randomState } from '../src/lib/pkce';

describe('PKCE helpers', () => {
  it('base64url has no +, /, or = padding', () => {
    const s = base64url(Buffer.from([251, 252, 253, 254, 255]));
    expect(s).not.toMatch(/[+/=]/);
  });

  it('generateVerifier is url-safe and high-entropy', () => {
    const v = generateVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(v.length).toBeGreaterThanOrEqual(43); // 32 bytes -> 43 base64url chars
  });

  it('challenge is base64url(sha256(verifier))', () => {
    const v = 'test-verifier-value';
    const expected = createHash('sha256')
      .update(v)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challengeFromVerifier(v)).toBe(expected);
  });

  it('state tokens are url-safe and unique', () => {
    const a = randomState();
    const b = randomState();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });
});
