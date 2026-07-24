'use client';

import { useCallback, useEffect, useState } from 'react';

type Provider = 'spotify' | 'apple' | 'youtube';
type Status = Record<Provider, boolean>;

interface MusicKitInstance {
  authorize(): Promise<string>;
}
interface MusicKitGlobal {
  configure(options: unknown): Promise<void>;
  getInstance(): MusicKitInstance;
}
declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}

/** Load MusicKit v3 and resolve once it's attached to window.MusicKit. */
function loadMusicKit(): Promise<MusicKitGlobal> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  return new Promise((resolve, reject) => {
    const ready = () => {
      if (window.MusicKit) resolve(window.MusicKit);
      else reject(new Error('MusicKit failed to initialize'));
    };
    document.addEventListener('musickitloaded', ready, { once: true });
    if (!document.getElementById('musickit-js')) {
      const s = document.createElement('script');
      s.id = 'musickit-js';
      s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
      s.async = true;
      s.onerror = () => reject(new Error('Failed to load MusicKit'));
      document.body.appendChild(s);
    }
  });
}

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

  const redirect = (route: 'spotify' | 'google') => {
    window.location.href = `/api/auth/${route}?returnTo=${encodeURIComponent(
      window.location.pathname,
    )}`;
  };

  const connectApple = async () => {
    setBusy('apple');
    setMsg(null);
    try {
      const mk = await loadMusicKit();
      const res = await fetch('/api/auth/apple');
      if (!res.ok) throw new Error('not configured');
      const { developerToken } = await res.json();
      await mk.configure({ developerToken, app: { name: 'Playlist Bridge', build: '1.0' } });
      const userToken = await mk.getInstance().authorize();
      await fetch('/api/auth/apple/user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userToken }),
      });
      refresh();
    } catch {
      setMsg("Couldn't connect Apple Music.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (p: Provider) => {
    setBusy(p);
    const url =
      p === 'apple'
        ? '/api/auth/apple/user'
        : p === 'youtube'
          ? '/api/auth/google/logout'
          : '/api/auth/spotify/logout';
    await fetch(url, { method: p === 'apple' ? 'DELETE' : 'POST' });
    refresh();
    setBusy(null);
  };

  if (!status) return <div className="connect-row" aria-hidden />;

  const chip = (key: Provider, label: string, onConnect: () => void) => {
    const on = status[key];
    return (
      <button
        type="button"
        className={`conn-chip${on ? ' on' : ''}`}
        aria-pressed={on}
        disabled={busy === key}
        onClick={() => (on ? disconnect(key) : onConnect())}
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
        {chip('spotify', 'Spotify', () => redirect('spotify'))}
        {chip('apple', 'Apple', connectApple)}
        {chip('youtube', 'YouTube', () => redirect('google'))}
      </div>
      {msg && <span className="connect-msg">{msg}</span>}
    </div>
  );
}
