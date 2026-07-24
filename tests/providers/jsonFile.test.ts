import { describe, it, expect } from 'vitest';
import { parseImportText, parseExportJson, JsonFileProvider } from '../../src/lib/providers/jsonFile';
import { JobError } from '../../src/lib/job/types';
import type { ExportJson } from '../../src/lib/export/json';

const sample: ExportJson = {
  name: 'My Mix',
  description: 'desc',
  source_platform: 'spotify',
  source_url: 'https://open.spotify.com/playlist/PL',
  exported_at: '2026-07-24T00:00:00Z',
  track_count: 2,
  tracks: [
    {
      position: 1,
      title: 'Yellow',
      artists: ['Coldplay'],
      album: 'Parachutes',
      isrc: 'GBAYE0000940',
      duration_ms: 266000,
      platform_ids: { spotify: 'spotify:track:1', apple: 'a1', youtube: null },
      match_confidence: 'high',
    },
    {
      position: 2,
      title: 'No Ids Here',
      artists: ['Someone'],
      isrc: undefined,
      duration_ms: undefined,
      platform_ids: { spotify: null, apple: null, youtube: null },
      match_confidence: 'none',
    },
  ],
};

describe('parseImportText', () => {
  it('parses a valid export, keeping ISRCs and source ids', () => {
    const parsed = parseImportText(JSON.stringify(sample));
    expect(parsed.playlist.name).toBe('My Mix');
    expect(parsed.playlist.platform).toBe('spotify');
    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks[0].platformId).toBe('spotify:track:1');
    expect(parsed.tracks[0].isrc).toBe('GBAYE0000940');
  });

  it('synthesizes a stable id when the source platform has none', () => {
    const parsed = parseImportText(JSON.stringify(sample));
    expect(parsed.tracks[1].platformId).toBe('json:2'); // uses position
    expect(parsed.tracks[1].isrc).toBeUndefined();
  });

  it('rejects non-JSON with a coded error', () => {
    expect(() => parseImportText('not json')).toThrow(JobError);
    try {
      parseImportText('not json');
    } catch (e) {
      expect((e as JobError).code).toBe('INVALID_URL');
    }
  });

  it('rejects JSON that is not an export (no tracks[])', () => {
    expect(() => parseImportText('{"foo":1}')).toThrow(JobError);
  });

  it('rejects an unknown source platform', () => {
    const bad = { ...sample, source_platform: 'tidal' };
    expect(() => parseImportText(JSON.stringify(bad))).toThrow(/isn't a supported service/);
  });

  it('drops titleless tracks but keeps the rest', () => {
    const doc = {
      ...sample,
      tracks: [{ ...sample.tracks[0] }, { ...sample.tracks[1], title: '' }],
    };
    const parsed = parseImportText(JSON.stringify(doc));
    expect(parsed.tracks).toHaveLength(1);
  });

  it('throws when every track is unusable', () => {
    const doc = { ...sample, tracks: [{ ...sample.tracks[0], title: '' }] };
    expect(() => parseImportText(JSON.stringify(doc))).toThrow(/no usable tracks/);
  });
});

describe('JsonFileProvider', () => {
  it('reads playlist + tracks from the parsed doc, and refuses writes', async () => {
    const parsed = parseExportJson(sample);
    const p = new JsonFileProvider(parsed);
    expect(p.platform).toBe('spotify');
    expect(p.parseUrl()).toBeNull();
    expect(p.findByIsrc()).toBeNull();

    const meta = await p.getPlaylist();
    expect(meta.name).toBe('My Mix');
    expect(meta.trackCount).toBe(2);
    expect(await p.getTracks()).toHaveLength(2);

    await expect(p.createPlaylist()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    await expect(p.addTracks()).rejects.toBeInstanceOf(JobError);
  });
});
