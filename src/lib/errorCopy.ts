// lib/errorCopy.ts
//
// Single source of truth for how a coded error is shown to a person. The brief's
// rule: say what to DO, not what broke. Each code maps to a short headline, a
// do-this-next hint, and the kind of action to offer (reconnect / retry / home).
//
// Pure and client-safe — no imports beyond the shared error-code type.

import type { JobErrorCode } from './job/types';

export type ErrorAction = 'reconnect' | 'retry' | 'home' | 'none';

export interface ErrorPresentation {
  headline: string;
  hint: string;
  action: ErrorAction;
}

const COPY: Record<JobErrorCode, Omit<ErrorPresentation, 'hint'> & { hint?: string }> = {
  INVALID_URL: {
    headline: "That link didn't work",
    hint: "Paste a Spotify, Apple Music, or YouTube playlist link — or a Playlist Bridge JSON export.",
    action: 'home',
  },
  SAME_PLATFORM: {
    headline: 'Pick a different destination',
    hint: 'The source and destination are the same service. Choose another to send it to.',
    action: 'home',
  },
  PROVIDER_UNAVAILABLE: {
    headline: 'That service isn’t available',
    hint: 'This one isn’t wired up on the server yet. Try a different destination.',
    action: 'home',
  },
  PLAYLIST_NOT_FOUND: {
    headline: "We couldn't find that playlist",
    hint: 'Double-check the link. If it’s private, connect the account that owns it.',
    action: 'home',
  },
  PLAYLIST_PRIVATE: {
    headline: 'That playlist is private',
    hint: 'Connect the account that owns it, then try again.',
    action: 'reconnect',
  },
  AUTH_REQUIRED: {
    headline: 'Connect to continue',
    hint: 'This step needs you to connect the account first.',
    action: 'reconnect',
  },
  AUTH_EXPIRED: {
    headline: 'Your connection expired',
    hint: 'Reconnect the account to continue — tokens expire periodically.',
    action: 'reconnect',
  },
  RATE_LIMITED: {
    headline: 'The service is busy',
    hint: 'We’re being rate-limited. Wait a moment and try again.',
    action: 'retry',
  },
  PLAYLIST_TOO_LARGE: {
    headline: 'That playlist is too large',
    hint: 'It’s over the size we’ll transfer. Try a smaller playlist.',
    action: 'home',
  },
  DEST_NOT_WRITABLE: {
    headline: "Can't write there",
    hint: 'Pick a playlist you own, or create a new one instead.',
    action: 'retry',
  },
  QUOTA_EXCEEDED: {
    headline: 'YouTube’s daily limit is used up',
    hint: 'The shared YouTube quota resets at midnight Pacific. Try again after that.',
    action: 'none',
  },
  PARTIAL_WRITE: {
    // Handled by the resume UI, but keep sane copy in case it surfaces here.
    headline: 'The write was interrupted',
    hint: 'Some tracks were added. Resume to finish the rest without duplicates.',
    action: 'retry',
  },
  PLATFORM_ERROR: {
    headline: 'The music service errored',
    hint: 'Something went wrong on their end. Try again in a moment.',
    action: 'retry',
  },
};

const FALLBACK: ErrorPresentation = {
  headline: 'Something went wrong',
  hint: 'Try again in a moment.',
  action: 'retry',
};

/**
 * Resolve a code to display copy. A server-supplied `message` (which may carry
 * live detail, e.g. a quota reset time) is preferred as the hint when present.
 */
export function presentError(code: string | undefined, message?: string): ErrorPresentation {
  const base = (code && COPY[code as JobErrorCode]) || null;
  if (!base) {
    return { ...FALLBACK, hint: message?.trim() || FALLBACK.hint };
  }
  return {
    headline: base.headline,
    hint: message?.trim() || base.hint || FALLBACK.hint,
    action: base.action,
  };
}
