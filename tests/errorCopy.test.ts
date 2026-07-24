import { describe, it, expect } from 'vitest';
import { presentError } from '../src/lib/errorCopy';

describe('presentError', () => {
  it('maps auth codes to a reconnect action', () => {
    expect(presentError('AUTH_REQUIRED').action).toBe('reconnect');
    expect(presentError('AUTH_EXPIRED').action).toBe('reconnect');
    expect(presentError('AUTH_EXPIRED').headline).toMatch(/expired/i);
  });

  it('quota has no action and points at the reset boundary', () => {
    const p = presentError('QUOTA_EXCEEDED');
    expect(p.action).toBe('none');
    expect(p.hint).toMatch(/midnight pacific/i);
  });

  it('rate-limit and platform errors offer a retry', () => {
    expect(presentError('RATE_LIMITED').action).toBe('retry');
    expect(presentError('PLATFORM_ERROR').action).toBe('retry');
  });

  it('validation errors send the user home', () => {
    expect(presentError('INVALID_URL').action).toBe('home');
    expect(presentError('SAME_PLATFORM').action).toBe('home');
  });

  it('prefers a live server message as the hint (e.g. a quota reset time)', () => {
    const p = presentError('QUOTA_EXCEEDED', 'Resets at midnight Pacific (in 4h).');
    expect(p.hint).toBe('Resets at midnight Pacific (in 4h).');
  });

  it('falls back gracefully for an unknown code', () => {
    const p = presentError('SOMETHING_NEW', 'raw detail');
    expect(p.headline).toBeTruthy();
    expect(p.hint).toBe('raw detail');
    expect(p.action).toBe('retry');
  });

  it('says what to do, not what broke (no raw status codes in default copy)', () => {
    for (const code of ['AUTH_EXPIRED', 'RATE_LIMITED', 'PLAYLIST_PRIVATE', 'DEST_NOT_WRITABLE']) {
      const p = presentError(code);
      expect(p.hint).not.toMatch(/\b40[0-9]\b|\b50[0-9]\b/); // no bare HTTP codes
      expect(p.hint.length).toBeGreaterThan(10);
    }
  });
});
