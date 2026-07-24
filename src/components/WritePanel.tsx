'use client';

import { useEffect, useState } from 'react';
import type { Platform } from '@/lib/providers/types';
import { PLATFORM_LABEL } from '@/lib/format';
import { redirectConnect, connectApple } from '@/lib/connectClient';
import type { WriteTrackRef } from '@/lib/job/write';
import type { WritePartial } from '@/lib/job/types';
import { useJobStream } from '@/lib/useJobStream';
import { ErrorState } from './ErrorState';

interface WritablePlaylist {
  id: string;
  name: string;
  trackCount: number;
}

export function WritePanel({
  destination,
  sourceName,
  tracks,
  unmatchedCount,
}: {
  destination: Platform;
  sourceName: string;
  tracks: WriteTrackRef[];
  unmatchedCount: number;
}) {
  const label = PLATFORM_LABEL[destination];
  const [connected, setConnected] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'create' | 'append'>('create');
  const [name, setName] = useState(`${sourceName} (Playlist Bridge)`);
  const [playlists, setPlaylists] = useState<WritablePlaylist[] | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [resume, setResume] = useState<WritePartial | null>(null);
  // Stream the background write once it's kicked off.
  const stream = useJobStream(jobId);
  const result = stream.phase === 'ready' ? stream.record.writeResult ?? null : null;
  const writing = jobId !== null && stream.phase !== 'ready' && stream.phase !== 'error';
  // Stable per-panel key so a retry replays instead of double-creating.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );

  const refreshStatus = () =>
    fetch('/api/session')
      .then((r) => r.json())
      .then((d) => setConnected(Boolean(d[destination])))
      .catch(() => setConnected(false));

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination]);

  // Load the append picker once connected.
  useEffect(() => {
    if (connected && mode === 'append' && playlists === null) {
      fetch(`/api/playlists?platform=${destination}`)
        .then((r) => r.json())
        .then((d) => {
          setPlaylists(d.playlists ?? []);
          if (d.playlists?.[0]) setSelected(d.playlists[0].id);
        })
        .catch(() => setPlaylists([]));
    }
  }, [connected, mode, playlists, destination]);

  const connect = async () => {
    if (destination === 'spotify') return redirectConnect('spotify');
    if (destination === 'youtube') return redirectConnect('google');
    setBusy(true);
    try {
      await connectApple();
      await refreshStatus();
    } catch {
      setError({ message: "Couldn't connect Apple Music." });
    } finally {
      setBusy(false);
    }
  };

  // React to a finished stream: a clean failure re-enables the button; a
  // PARTIAL_WRITE surfaces the resume plan instead of a dead-end error.
  useEffect(() => {
    if (stream.phase !== 'error') return;
    setJobId(null);
    if (stream.record?.partial) {
      setResume(stream.record.partial);
    } else {
      setError({ code: stream.code, message: stream.message });
    }
  }, [stream]);

  // POST a write and hand off to the stream. `body` carries the mode-specific
  // fields; `key` is the idempotency key for this attempt.
  const post = async (body: Record<string, unknown>, key: string) => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destination, unmatchedCount, idempotencyKey: key, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ code: data?.error?.code, message: data?.error?.message ?? 'Write failed.' });
        return;
      }
      setResume(null);
      setJobId(data.jobId); // stream takes over from here
    } catch {
      setError({ message: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  };

  const write = () =>
    post(
      {
        mode,
        name: mode === 'create' ? name : undefined,
        playlistId: mode === 'append' ? selected : undefined,
        tracks,
      },
      idempotencyKey,
    );

  // Finish an interrupted write by appending only what didn't make it, to the
  // playlist that already exists. Append-dedup guards against re-adds.
  const resumeWrite = (p: WritePartial) =>
    post(
      { mode: 'append', playlistId: p.playlistId, tracks: p.remaining, unmatchedCount: p.unmatched },
      `${idempotencyKey}:resume`,
    );

  return (
    <section className="write-panel">
      <div className="wp-head">
        <span className="wp-title">Send to {label}</span>
        <span className="wp-count mono">{tracks.length} matched</span>
      </div>

      {result ? (
        <div className="wp-done">
          <p className="wp-done-line">
            ✓ <b>{result.added}</b> added to {label}
            {result.skippedDupes > 0 && <> · {result.skippedDupes} skipped as duplicates</>}
            {result.unmatched > 0 && <> · {result.unmatched} unmatched</>}
          </p>
          <a className="btn btn-primary" href={result.playlistUrl} target="_blank" rel="noreferrer">
            Open playlist ↗
          </a>
        </div>
      ) : writing ? (
        <WriteProgress done={stream.progress.done} total={stream.progress.total} label={label} />
      ) : resume ? (
        <div className="wp-resume">
          <p className="wp-resume-line">
            The write was interrupted after <b>{resume.added}</b> track
            {resume.added === 1 ? '' : 's'}. <b>{resume.remaining.length}</b> still to add —
            we won&apos;t re-add what already made it.
          </p>
          <div className="wp-resume-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void resumeWrite(resume)}
              disabled={busy}
            >
              {busy ? 'Resuming…' : `Resume — add ${resume.remaining.length} remaining →`}
            </button>
            <a className="btn btn-ghost" href={resume.playlistUrl} target="_blank" rel="noreferrer">
              Open playlist ↗
            </a>
          </div>
        </div>
      ) : connected === null ? null : !connected ? (
        <div className="wp-connect">
          <p>Connect {label} to write the playlist.</p>
          <button className="btn btn-primary" type="button" onClick={connect} disabled={busy}>
            {busy ? 'Connecting…' : `Connect ${label} →`}
          </button>
        </div>
      ) : (
        <div className="wp-form">
          <div className="seg wp-seg" role="group" aria-label="Write mode">
            <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
              New playlist
            </button>
            <button type="button" aria-pressed={mode === 'append'} onClick={() => setMode('append')}>
              Add to existing
            </button>
          </div>

          {mode === 'create' ? (
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="New playlist name"
              placeholder="Playlist name"
            />
          ) : playlists && playlists.length > 0 ? (
            <select
              className="input wp-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              aria-label="Choose a playlist"
            >
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.trackCount})
                </option>
              ))}
            </select>
          ) : (
            <p className="wp-note">
              {playlists === null ? 'Loading your playlists…' : 'No writable playlists found.'}
            </p>
          )}

          {error && (
            <ErrorState
              code={error.code}
              message={error.message}
              platform={destination}
              onRetry={write}
              compact
            />
          )}

          <button
            className="btn btn-primary"
            type="button"
            onClick={write}
            disabled={busy || writing || tracks.length === 0 || (mode === 'append' && !selected)}
          >
            {busy ? 'Writing…' : `Write ${tracks.length} tracks →`}
          </button>
        </div>
      )}
    </section>
  );
}

function WriteProgress({ done, total, label }: { done: number; total: number; label: string }) {
  const known = total > 0;
  const pct = known ? Math.round((done / total) * 100) : 0;
  return (
    <div className="wp-writing">
      <div className="wp-writing-line">
        <span className="mono">
          {known ? `${done} / ${total}` : 'Preparing…'}
        </span>
        <span className="wp-writing-label">adding to {label}</span>
      </div>
      <div className="matching-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`matching-fill ${known ? '' : 'indeterminate'}`}
          style={known ? { width: `${pct}%` } : undefined}
        />
      </div>
    </div>
  );
}
