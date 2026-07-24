'use client';

import { useMemo, useState } from 'react';
import type { MatchResult, Confidence, Track } from '@/lib/providers/types';
import type { SampleJob } from '@/lib/demo/sampleJob';
import { downloadExport } from '@/lib/exportClient';
import type { ExportFormat } from '@/lib/export';
import { PLATFORM_LABEL, msToClock, deepSearchUrl } from '@/lib/format';

const CONNECTOR_CLASS: Record<Confidence, string> = {
  high: 'c-high',
  medium: 'c-medium',
  low: 'c-low',
  none: 'c-none',
};

const BADGE: Record<Confidence, string> = {
  high: 'ISRC',
  medium: 'Auto',
  low: 'Review',
  none: 'No match',
};

export function ReviewScreen({ job }: { job: SampleJob }) {
  // Per-row destination choice — defaults to the engine's pick, overridable
  // from the alternatives list. Keyed by source platformId.
  const [chosen, setChosen] = useState<Record<string, string>>({});

  const buckets = useMemo(() => {
    const auto: MatchResult[] = [];
    const review: MatchResult[] = [];
    const unmatched: MatchResult[] = [];
    for (const r of job.results) {
      if (r.confidence === 'high' || r.confidence === 'medium') auto.push(r);
      else if (r.confidence === 'low') review.push(r);
      else unmatched.push(r);
    }
    return { auto, review, unmatched };
  }, [job.results]);

  const counts = {
    high: job.results.filter((r) => r.confidence === 'high').length,
    medium: job.results.filter((r) => r.confidence === 'medium').length,
    low: job.results.filter((r) => r.confidence === 'low').length,
    none: job.results.filter((r) => r.confidence === 'none').length,
  };
  const matched = counts.high + counts.medium + counts.low;
  const rate = Math.round((matched / Math.max(1, job.results.length)) * 100);

  // Build the export payload from the CURRENT choices, so a re-picked
  // alternative flows into the exported file too.
  const resolvedResults: MatchResult[] = job.results.map((r) => {
    const pickedId = chosen[r.source.platformId];
    if (!pickedId) return r;
    const alt = r.alternatives?.find((a) => a.platformId === pickedId);
    return alt ? { ...r, destination: alt } : r;
  });

  const doExport = (format: ExportFormat) =>
    downloadExport(
      {
        name: job.name,
        sourcePlatform: job.sourcePlatform,
        sourceUrl: job.sourceUrl,
      },
      resolvedResults,
      format,
    );

  const skippedTotal =
    job.skipped.local + job.skipped.episodes + job.skipped.unavailable;

  return (
    <main className="review wrap">
      <div className="review-head">
        <div>
          <h1>{job.name}</h1>
          <p className="sub">
            <span className="mono">{PLATFORM_LABEL[job.sourcePlatform]}</span> →{' '}
            <span className="mono">{PLATFORM_LABEL[job.destinationPlatform]}</span>{' '}
            · {job.results.length} tracks read · {rate}% matched
          </p>
        </div>
        <div className="exports">
          <span className="lead">Export</span>
          <button className="btn btn-ghost" onClick={() => doExport('csv')}>
            CSV
          </button>
          <button className="btn btn-ghost" onClick={() => doExport('json')}>
            JSON
          </button>
          <button className="btn btn-ghost" onClick={() => doExport('m3u8')}>
            M3U8
          </button>
        </div>
      </div>

      <div className="meters" role="list" aria-label="Match summary">
        <Meter cls="high" n={counts.high} k="Authoritative" />
        <Meter cls="medium" n={counts.medium} k="Auto-matched" />
        <Meter cls="low" n={counts.low} k="Needs review" />
        <Meter cls="none" n={counts.none} k="Unmatched" />
      </div>

      {skippedTotal > 0 && (
        <p className="skip-note">
          Skipped on read:{' '}
          <span className="mono">{job.skipped.local}</span> local file
          {job.skipped.local === 1 ? '' : 's'},{' '}
          <span className="mono">{job.skipped.episodes}</span> podcast episode
          {job.skipped.episodes === 1 ? '' : 's'}. These can&apos;t be
          transferred and aren&apos;t counted against the match rate.
        </p>
      )}

      <Group
        title="Auto-matched"
        count={buckets.auto.length}
        hint="collapsed — high confidence"
        open={false}
      >
        {buckets.auto.map((r) => (
          <Row key={r.source.platformId} r={r} destPlatformLabel={PLATFORM_LABEL[job.destinationPlatform]} />
        ))}
      </Group>

      {buckets.review.length > 0 && (
        <Group
          title="Needs review"
          count={buckets.review.length}
          hint="pick the right take"
          open
        >
          {buckets.review.map((r) => (
            <Row
              key={r.source.platformId}
              r={r}
              destPlatformLabel={PLATFORM_LABEL[job.destinationPlatform]}
              chosenId={chosen[r.source.platformId] ?? r.destination?.platformId}
              onPick={(id) =>
                setChosen((prev) => ({ ...prev, [r.source.platformId]: id }))
              }
            />
          ))}
        </Group>
      )}

      {buckets.unmatched.length > 0 && (
        <Group
          title="Unmatched"
          count={buckets.unmatched.length}
          hint="search the destination yourself"
          open
        >
          {buckets.unmatched.map((r) => (
            <Row
              key={r.source.platformId}
              r={r}
              destPlatform={job.destinationPlatform}
              destPlatformLabel={PLATFORM_LABEL[job.destinationPlatform]}
            />
          ))}
        </Group>
      )}
    </main>
  );
}

function Meter({ cls, n, k }: { cls: string; n: number; k: string }) {
  return (
    <div className={`meter ${cls}`} role="listitem">
      <div className="n mono">{n}</div>
      <div className="k">{k}</div>
    </div>
  );
}

function Group({
  title,
  count,
  hint,
  open,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group" open={open}>
      <summary>
        <span className="g-title">{title}</span>
        <span className="g-count">
          {count} track{count === 1 ? '' : 's'}
        </span>
        <span className="g-hint">{hint}</span>
      </summary>
      <div className="rows">{children}</div>
    </details>
  );
}

function Row({
  r,
  destPlatform,
  destPlatformLabel,
  chosenId,
  onPick,
}: {
  r: MatchResult;
  destPlatform?: Track['platform'];
  destPlatformLabel: string;
  chosenId?: string;
  onPick?: (id: string) => void;
}) {
  const activeDest =
    r.alternatives?.find((a) => a.platformId === chosenId) ?? r.destination;

  return (
    <div className="row">
      <div className="cell source">
        <div className="title">{r.source.title}</div>
        <div className="artist">{r.source.artists.join(', ')}</div>
        <div className="meta">
          <span className="mono">{msToClock(r.source.durationMs)}</span>
          {r.source.isrc && <span className="mono isrc">{r.source.isrc}</span>}
        </div>
      </div>

      <div className={`connector ${CONNECTOR_CLASS[r.confidence]}`}>
        <span className="line" aria-hidden />
        <span className="badge">{BADGE[r.confidence]}</span>
        {r.score != null && (
          <span className="mono" style={{ fontSize: '0.62rem', color: 'var(--bone-faint)' }}>
            {r.score.toFixed(2)}
          </span>
        )}
      </div>

      {activeDest ? (
        <div className="cell dest">
          <div className="title">{activeDest.title}</div>
          <div className="artist">{activeDest.artists.join(', ')}</div>
          <div className="meta">
            <span className="mono">{msToClock(activeDest.durationMs)}</span>
            {activeDest.isrc && (
              <span className="mono isrc">{activeDest.isrc}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="cell dest empty">
          <div className="title">Not found on {destPlatformLabel}</div>
          <div className="meta">
            <a
              className="deep-link"
              href={destPlatform ? deepSearchUrl(destPlatform, r.source) : '#'}
              target="_blank"
              rel="noreferrer"
            >
              Search {destPlatformLabel} ↗
            </a>
          </div>
        </div>
      )}

      {onPick && r.alternatives && r.alternatives.length > 0 && (
        <div className="alts">
          <div className="alts-head">
            Candidates — choose the correct take
          </div>
          {[r.destination, ...r.alternatives]
            .filter((t): t is Track => Boolean(t))
            .map((alt) => {
              const isChosen = (chosenId ?? r.destination?.platformId) === alt.platformId;
              return (
                <div className="alt" key={alt.platformId}>
                  <div className="alt-main">
                    <div className="title">{alt.title}</div>
                    <div className="artist">
                      {alt.artists.join(', ')} · {msToClock(alt.durationMs)}
                    </div>
                  </div>
                  <button
                    className="pick"
                    aria-pressed={isChosen}
                    onClick={() => onPick(alt.platformId)}
                  >
                    {isChosen ? 'Selected' : 'Use this'}
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
