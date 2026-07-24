import { describe, it, expect } from 'vitest';
import type { MatchResult, Track } from '../../src/lib/providers/types';
import {
  buildExportPlaylist,
  exportBaseName,
  toCSV,
  toJSON,
  toExportJson,
  toM3U8,
  renderExport,
} from '../../src/lib/export';
import { parseExportJson } from '../../src/lib/providers/jsonFile';

const src = (t: Partial<Track>): Track => ({
  title: '',
  artists: [],
  platformId: 'x',
  platform: 'spotify',
  ...t,
});

const results: MatchResult[] = [
  {
    source: src({
      title: 'Yellow',
      artists: ['Coldplay'],
      album: 'Parachutes',
      isrc: 'GBAYE0000940',
      durationMs: 269000,
      platformId: 'spotify:track:yellow',
      sourceUrl: 'https://open.spotify.com/track/yellow',
    }),
    destination: src({
      title: 'Yellow',
      artists: ['Coldplay'],
      isrc: 'GBAYE0000940',
      durationMs: 269000,
      platformId: 'apple:yellow',
      platform: 'apple',
    }),
    confidence: 'high',
    tier: 1,
  },
  {
    // Unmatched — must still appear in the export with original metadata.
    source: src({
      title: '봄날',
      artists: ['BTS'],
      isrc: 'KRA401601234',
      durationMs: 285000,
      platformId: 'spotify:track:springday',
    }),
    destination: null,
    confidence: 'none',
    tier: 3,
  },
];

const meta = {
  name: 'My Mix / Summer 2026',
  description: 'test',
  sourcePlatform: 'spotify' as const,
  sourceUrl: 'https://open.spotify.com/playlist/abc',
  exportedAt: '2026-07-24T00:00:00.000Z',
};

describe('export model', () => {
  it('includes unmatched tracks with original metadata', () => {
    const p = buildExportPlaylist(meta, results);
    expect(p.trackCount).toBe(2);
    expect(p.tracks[1].title).toBe('봄날');
    expect(p.tracks[1].confidence).toBe('none');
    // Only the source platform id is populated for the unmatched track.
    expect(p.tracks[1].platformIds.apple).toBeUndefined();
  });

  it('sanitizes the filename base and appends the date', () => {
    const p = buildExportPlaylist(meta, results);
    expect(exportBaseName(p)).toBe('my-mix-summer-2026-2026-07-24');
  });
});

describe('CSV export', () => {
  const p = buildExportPlaylist(meta, results);
  const csv = toCSV(p);

  it('starts with a UTF-8 BOM so Excel keeps non-Latin titles intact', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('has the documented header', () => {
    const firstLine = csv.slice(1).split('\r\n')[0];
    expect(firstLine).toBe(
      'position,title,artist,album,isrc,duration_ms,source_url,spotify_id,apple_id,youtube_id,match_confidence',
    );
  });

  it('leaves the destination id empty for an unmatched track', () => {
    const rows = csv.slice(1).trim().split('\r\n');
    // row for 봄날 has no apple id
    const springday = rows.find((r) => r.includes('봄날'))!;
    const cols = springday.split(',');
    // apple_id column (index 8) is empty
    expect(cols[8]).toBe('');
  });
});

describe('M3U8 export', () => {
  it('emits EXTM3U header and EXTINF lines with seconds', () => {
    const p = buildExportPlaylist(meta, results);
    const m3u = toM3U8(p);
    const lines = m3u.trim().split('\n');
    expect(lines[0]).toBe('#EXTM3U');
    expect(lines[1]).toBe('#EXTINF:269,Coldplay - Yellow');
  });
});

describe('JSON round-trip (export → re-import → identity)', () => {
  it('preserves track identity including ISRCs', () => {
    const p = buildExportPlaylist(meta, results);
    const json = toExportJson(p);

    // Serialize and re-parse to simulate a real file round-trip.
    const reparsed = JSON.parse(JSON.stringify(json));
    const imported = parseExportJson(reparsed);

    expect(imported.playlist.name).toBe('My Mix / Summer 2026');
    expect(imported.tracks).toHaveLength(2);

    expect(imported.tracks[0].title).toBe('Yellow');
    expect(imported.tracks[0].isrc).toBe('GBAYE0000940');
    expect(imported.tracks[0].platformId).toBe('spotify:track:yellow');

    expect(imported.tracks[1].title).toBe('봄날');
    expect(imported.tracks[1].isrc).toBe('KRA401601234');
  });

  it('renderExport returns the right content types', () => {
    const p = buildExportPlaylist(meta, results);
    expect(renderExport(p, 'csv').contentType).toContain('text/csv');
    expect(renderExport(p, 'json').contentType).toContain('application/json');
    expect(renderExport(p, 'm3u8').contentType).toContain('audio/x-mpegurl');
  });

  it('produces valid, stable JSON text', () => {
    const p = buildExportPlaylist(meta, results);
    const text = toJSON(p);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text.endsWith('\n')).toBe(true);
  });
});
