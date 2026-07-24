'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Platform } from '@/lib/providers/types';
import { Connections } from './Connections';

const DESTINATIONS: Platform[] = ['apple', 'spotify', 'youtube'];

// Short labels for the compact segmented control ("Send it to" disambiguates).
const DEST_SHORT: Record<Platform, string> = {
  apple: 'Apple',
  spotify: 'Spotify',
  youtube: 'YouTube',
};

export function LinkForm() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [dest, setDest] = useState<Platform>('apple');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: 'convert' | 'export') {
    setError(null);
    setBusy(true);
    try {
      // The match runs in the background; we get a job id back right away and
      // stream progress on the review screen.
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: link, destination: dest }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Something went wrong.');
        return;
      }
      const q = new URLSearchParams({ job: data.jobId });
      if (mode === 'export') q.set('export', '1');
      router.push(`/review?${q.toString()}`);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        void run('convert');
      }}
    >
      <div className="panel-head">
        <span>Paste a public playlist link</span>
        <span>no login to start</span>
      </div>
      <div className="panel-body">
        <div className="field">
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://open.spotify.com/playlist/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            aria-label="Playlist link"
            disabled={busy}
            required
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !link}>
            {busy ? 'Reading…' : 'Convert →'}
          </button>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <Connections />

        <div className="dest-row">
          <span>Send it to</span>
          <div className="seg" role="group" aria-label="Destination platform">
            {DESTINATIONS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={dest === p}
                onClick={() => setDest(p)}
                disabled={busy}
              >
                {DEST_SHORT[p]}
              </button>
            ))}
          </div>
          <span className="dest-export">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void run('export')}
              disabled={busy || !link}
            >
              Just export it
            </button>
          </span>
        </div>
      </div>
    </form>
  );
}
