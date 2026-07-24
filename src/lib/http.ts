// lib/http.ts
//
// Small resilient JSON fetch used by the provider adapters. Honors Retry-After
// on 429 and backs off on 5xx, mirroring the spec's withRetry contract. This is
// the in-process resilience layer; the Redis token-bucket limiter is a separate
// concern that can wrap these calls once Upstash is configured.

import type { Platform } from './providers/types';
import { acquire } from './ratelimit';

export class HttpError extends Error {
  status: number;
  headers: Headers;
  body: string;
  constructor(status: number, message: string, headers: Headers, body: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.headers = headers;
    this.body = body;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Already-serialized body (string) or form params. */
  body?: string;
  /** Max attempts on retryable failures. Default 5. */
  retries?: number;
  /** If set, acquire a rate-limit slot for this platform before each attempt. */
  rateLimit?: Platform;
  /** Injectable fetch, for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch and parse JSON, retrying on 429/5xx with backoff + jitter. Throws
 * HttpError on a non-retryable error or once retries are exhausted.
 */
export async function httpJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, retries = 5 } = opts;
  const doFetch = opts.fetchImpl ?? fetch;

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (opts.rateLimit) await acquire(opts.rateLimit);
    let res: Response;
    try {
      res = await doFetch(url, { method, headers, body });
    } catch (e) {
      // Network-level failure — back off and retry.
      lastErr = e;
      await sleep(2 ** attempt * 500 + Math.random() * 300);
      continue;
    }

    if (res.ok) {
      // 204/empty bodies are valid for writes.
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    const text = await res.text().catch(() => '');

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
      lastErr = new HttpError(429, 'Rate limited', res.headers, text);
      await sleep(retryAfter * 1000 + Math.random() * 400);
      continue;
    }
    if (res.status >= 500) {
      lastErr = new HttpError(res.status, `Upstream ${res.status}`, res.headers, text);
      await sleep(2 ** attempt * 1000 + Math.random() * 400);
      continue;
    }
    // 4xx other than 429 — retrying won't help.
    throw new HttpError(res.status, `Request failed ${res.status}`, res.headers, text);
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Request failed after ${retries} attempts`);
}
