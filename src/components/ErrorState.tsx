'use client';

import { useState } from 'react';
import type { Platform } from '@/lib/providers/types';
import { presentError } from '@/lib/errorCopy';
import { PLATFORM_LABEL } from '@/lib/format';
import { redirectConnect, connectApple } from '@/lib/connectClient';

/**
 * Consistent, actionable error card. Turns a coded failure into a headline, a
 * do-this-next hint, and the right action button (reconnect / retry / start
 * over). Used wherever a job or write terminates in failure.
 */
export function ErrorState({
  code,
  message,
  platform,
  onRetry,
  compact,
}: {
  code?: string;
  message?: string;
  /** Destination platform — enables a "Reconnect {X}" action for auth errors. */
  platform?: Platform;
  /** If provided, a 'retry' action re-runs this instead of going home. */
  onRetry?: () => void;
  /** Inline variant (e.g. inside the write panel) vs. full-screen. */
  compact?: boolean;
}) {
  const { headline, hint, action } = presentError(code, message);
  const [busy, setBusy] = useState(false);

  const reconnect = async () => {
    if (!platform) return;
    if (platform === 'spotify') return redirectConnect('spotify');
    if (platform === 'youtube') return redirectConnect('google');
    setBusy(true);
    try {
      await connectApple();
      onRetry?.(); // once reconnected, offer to re-run
    } finally {
      setBusy(false);
    }
  };

  // Resolve the action to a concrete button. Reconnect needs a platform;
  // retry needs an onRetry handler; otherwise fall back to "start over".
  let button: React.ReactNode = null;
  if (action === 'reconnect' && platform) {
    button = (
      <button className="btn btn-primary" type="button" onClick={() => void reconnect()} disabled={busy}>
        {busy ? 'Connecting…' : `Reconnect ${PLATFORM_LABEL[platform]} →`}
      </button>
    );
  } else if (action === 'retry' && onRetry) {
    button = (
      <button className="btn btn-primary" type="button" onClick={onRetry}>
        Try again
      </button>
    );
  } else if (action !== 'none') {
    button = (
      <a className="btn btn-primary" href="/">
        ← Start over
      </a>
    );
  }

  return (
    <div className={`error-state${compact ? ' error-state-compact' : ''}`} role="alert">
      <div className="error-state-headline">{headline}</div>
      <p className="error-state-hint">{hint}</p>
      {button}
    </div>
  );
}
