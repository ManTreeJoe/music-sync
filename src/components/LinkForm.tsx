'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
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
  const fileInput = useRef<HTMLInputElement>(null);

  // Kick off a background job (link or JSON import) and hand off to the review
  // screen, which streams progress from the returned job id.
  async function submit(payload: Record<string, unknown>, mode: 'convert' | 'export' = 'convert') {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, destination: dest }),
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

  const run = (mode: 'convert' | 'export') => submit({ url: link }, mode);

  async function importFile(file: File) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError("Couldn't read that file.");
      return;
    }
    await submit({ json: text });
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

        <div className="import-row">
          <span>Have a JSON export?</span>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            Re-import it →
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ''; // allow re-selecting the same file
              if (f) void importFile(f);
            }}
          />
        </div>
      </div>
    </form>
  );
}
