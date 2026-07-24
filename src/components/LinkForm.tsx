'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Platform } from '@/lib/providers/types';
import { PLATFORM_LABEL } from '@/lib/format';

const DESTINATIONS: Platform[] = ['apple', 'spotify', 'youtube'];

export function LinkForm() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [dest, setDest] = useState<Platform>('apple');

  // Demo: any submit routes to the sample review. Real wiring posts to
  // /api/jobs and streams progress before landing here.
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    router.push('/review');
  };

  return (
    <form className="panel" onSubmit={go}>
      <div className="panel-head">
        <span>Paste a public playlist link</span>
        <span className="mono">no login to start</span>
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
          />
          <button className="btn btn-primary" type="submit">
            Convert →
          </button>
        </div>

        <div className="dest-row">
          <span>Send it to</span>
          <div className="seg" role="group" aria-label="Destination platform">
            {DESTINATIONS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={dest === p}
                onClick={() => setDest(p)}
              >
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto' }}>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => router.push('/review')}
            >
              Just export it
            </button>
          </span>
        </div>
      </div>
    </form>
  );
}
