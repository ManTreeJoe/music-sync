// lib/export/csv.ts
//
// CSV export — the default format. UTF-8 with a BOM so Excel doesn't mangle
// non-Latin titles. One row per track; empty destination-id cells mean
// "unmatched", not zero.

import type { ExportPlaylist } from './model';

const BOM = '﻿';

const HEADER = [
  'position',
  'title',
  'artist',
  'album',
  'isrc',
  'duration_ms',
  'source_url',
  'spotify_id',
  'apple_id',
  'youtube_id',
  'match_confidence',
] as const;

/** RFC-4180 field escaping: quote if the value contains a comma, quote, or newline. */
function escapeField(value: string | number | undefined | null): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV(playlist: ExportPlaylist): string {
  const rows: string[] = [HEADER.join(',')];

  for (const t of playlist.tracks) {
    const row = [
      t.position,
      t.title,
      t.artists.join(', '),
      t.album ?? '',
      t.isrc ?? '',
      t.durationMs ?? '',
      t.sourceUrl ?? '',
      t.platformIds.spotify ?? '',
      t.platformIds.apple ?? '',
      t.platformIds.youtube ?? '',
      t.confidence,
    ].map(escapeField);
    rows.push(row.join(','));
  }

  // CRLF line endings are the safest cross-tool choice for CSV.
  return BOM + rows.join('\r\n') + '\r\n';
}
