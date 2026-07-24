// lib/pkce.ts
//
// PKCE + CSRF helpers for OAuth. Pure (Node crypto), so they're unit-testable.

import crypto from 'node:crypto';

export function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** A high-entropy PKCE code verifier. */
export function generateVerifier(): string {
  return base64url(crypto.randomBytes(32));
}

/** The S256 challenge for a verifier: base64url(sha256(verifier)). */
export function challengeFromVerifier(verifier: string): string {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

/** An opaque CSRF state token. */
export function randomState(): string {
  return base64url(crypto.randomBytes(16));
}
