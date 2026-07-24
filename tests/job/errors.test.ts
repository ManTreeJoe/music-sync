import { describe, it, expect } from 'vitest';
import { toJobError } from '../../src/lib/job/errors';
import { HttpError } from '../../src/lib/http';
import { JobError } from '../../src/lib/job/types';

const http = (status: number) => new HttpError(status, `err ${status}`, new Headers(), '');

describe('toJobError — context-aware mapping', () => {
  it('passes a JobError through unchanged', () => {
    const e = new JobError('QUOTA_EXCEEDED', 'x');
    expect(toJobError(e)).toBe(e);
  });

  it('a read 403 is a private playlist; a write 403 is an expired connection', () => {
    expect(toJobError(http(403)).code).toBe('PLAYLIST_PRIVATE');
    expect(toJobError(http(403), { write: true, platform: 'apple' }).code).toBe('AUTH_EXPIRED');
    expect(toJobError(http(403), { write: true, platform: 'spotify' }).code).toBe('AUTH_EXPIRED');
  });

  it('a write 401 is expired for token platforms, but a server-config issue for Apple', () => {
    expect(toJobError(http(401), { write: true, platform: 'spotify' }).code).toBe('AUTH_EXPIRED');
    expect(toJobError(http(401), { write: true, platform: 'youtube' }).code).toBe('AUTH_EXPIRED');
    expect(toJobError(http(401), { write: true, platform: 'apple' }).code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('a read 401 is auth-required', () => {
    expect(toJobError(http(401)).code).toBe('AUTH_REQUIRED');
  });

  it('maps the rest: 404, 429, 5xx, and a missing env var', () => {
    expect(toJobError(http(404)).code).toBe('PLAYLIST_NOT_FOUND');
    expect(toJobError(http(429)).code).toBe('RATE_LIMITED');
    expect(toJobError(http(503)).code).toBe('PLATFORM_ERROR');
    expect(toJobError(new Error('Missing required env var: APPLE_TEAM_ID')).code).toBe('PROVIDER_UNAVAILABLE');
  });
});
