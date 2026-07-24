// lib/connectClient.ts
//
// Client-side connect helpers shared by the form and the write panel. Functions
// only — safe to import in any client component; they touch window at call time.

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

/** Redirect into a Spotify/Google OAuth flow, returning to the current page. */
export function redirectConnect(route: 'spotify' | 'google'): void {
  const returnTo = window.location.pathname + window.location.search;
  window.location.href = `/api/auth/${route}?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Load MusicKit v3 and resolve once it's attached to window.MusicKit. */
function loadMusicKit(): Promise<MusicKitGlobal> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  return new Promise((resolve, reject) => {
    const ready = () =>
      window.MusicKit ? resolve(window.MusicKit) : reject(new Error('MusicKit failed to init'));
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

/** Open Apple's MusicKit auth popup and store the returned user token. */
export async function connectApple(): Promise<void> {
  const mk = await loadMusicKit();
  const res = await fetch('/api/auth/apple');
  if (!res.ok) throw new Error('Apple Music not configured');
  const { developerToken } = await res.json();
  await mk.configure({ developerToken, app: { name: 'Playlist Bridge', build: '1.0' } });
  const userToken = await mk.getInstance().authorize();
  await fetch('/api/auth/apple/user', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userToken }),
  });
}

export async function disconnectProvider(p: 'spotify' | 'youtube' | 'apple'): Promise<void> {
  const url =
    p === 'apple'
      ? '/api/auth/apple/user'
      : p === 'youtube'
        ? '/api/auth/google/logout'
        : '/api/auth/spotify/logout';
  await fetch(url, { method: p === 'apple' ? 'DELETE' : 'POST' });
}
