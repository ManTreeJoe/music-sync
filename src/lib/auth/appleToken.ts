// lib/auth/appleToken.ts
//
// Apple Music developer token — a JWT signed ES256 with the MusicKit .p8 key.
// Generated server-side, cached until near expiry. Never shipped to the client.
//
// The failure modes here all surface as an unhelpful 401, so the details matter:
//   - restore real newlines in the .p8 (stored with literal \n)
//   - `kid` goes in the HEADER, not the payload
//   - `exp` must be within 6 months
//   - the key must be a MusicKit key, not an App Store key

import jwt from 'jsonwebtoken';

let cached: { token: string; expiresAt: number } | null = null;

export function getAppleDeveloperToken(now = Math.floor(Date.now() / 1000)): string {
  if (cached && cached.expiresAt > now + 3600) return cached.token;

  const teamId = requireEnv('APPLE_TEAM_ID');
  const keyId = requireEnv('APPLE_KEY_ID');
  // .p8 stored with literal \n — restore real newlines.
  const key = requireEnv('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');

  const exp = now + 60 * 60 * 24 * 180; // 180 days, under the 6-month max

  const token = jwt.sign({ iss: teamId, iat: now, exp }, key, {
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: keyId },
  });

  cached = { token, expiresAt: exp };
  return token;
}

/** Test hook — clears the module-level cache. */
export function _resetAppleTokenCache(): void {
  cached = null;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
