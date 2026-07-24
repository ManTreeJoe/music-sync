'use client';

import { useCallback, useEffect, useState } from 'react';
import { redirectConnect, connectApple, disconnectProvider } from '@/lib/connectClient';

type Provider = 'spotify' | 'apple' | 'youtube';
type Status = Record<Provider, boolean>;

export function Connections() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then((d) =>
        setStatus({ spotify: !!d.spotify, apple: !!d.apple, youtube: !!d.youtube }),
      )
      .catch(() => setStatus({ spotify: false, apple: false, youtube: false }));
  }, []);

  useEffect(() => {
    refresh();
    if (new URLSearchParams(window.location.search).get('connect') === 'error') {
      setMsg("Couldn't connect. Please try again.");
    }
  }, [refresh]);

  const onConnect = async (p: Provider) => {
    if (p === 'spotify') return redirectConnect('spotify');
    if (p === 'youtube') return redirectConnect('google');
    setBusy('apple');
    setMsg(null);
    try {
      await connectApple();
      refresh();
    } catch {
      setMsg("Couldn't connect Apple Music.");
    } finally {
      setBusy(null);
    }
  };

  const onDisconnect = async (p: Provider) => {
    setBusy(p);
    await disconnectProvider(p);
    refresh();
    setBusy(null);
  };

  if (!status) return <div className="connect-row" aria-hidden />;

  const chip = (key: Provider, label: string) => {
    const on = status[key];
    return (
      <button
        type="button"
        className={`conn-chip${on ? ' on' : ''}`}
        aria-pressed={on}
        disabled={busy === key}
        onClick={() => (on ? onDisconnect(key) : onConnect(key))}
        title={on ? `Disconnect ${label}` : `Connect ${label}`}
      >
        {on ? '✓ ' : ''}
        {label}
      </button>
    );
  };

  return (
    <div className="connect-row">
      <span className="connect-lead">Private playlists? Connect</span>
      <div className="conn-chips">
        {chip('spotify', 'Spotify')}
        {chip('apple', 'Apple')}
        {chip('youtube', 'YouTube')}
      </div>
      {msg && <span className="connect-msg">{msg}</span>}
    </div>
  );
}
