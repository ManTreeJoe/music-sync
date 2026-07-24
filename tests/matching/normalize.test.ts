import { describe, it, expect } from 'vitest';
import { normalizeTitle, normalizeArtist } from '../../src/lib/matching';

describe('normalizeTitle', () => {
  it('strips remaster noise', () => {
    expect(normalizeTitle('Bohemian Rhapsody - Remastered 2011').title).toBe(
      'bohemian rhapsody',
    );
    expect(normalizeTitle('Bohemian Rhapsody (2011 Remaster)').title).toBe(
      'bohemian rhapsody',
    );
  });

  it('strips deluxe/anniversary/video/hd noise', () => {
    expect(normalizeTitle('Thriller (Deluxe Edition)').title).toBe('thriller');
    expect(normalizeTitle('Song (Official Music Video)').title).toBe('song');
    expect(normalizeTitle('Song (Official Video) [HD]').title).toBe('song');
  });

  it('extracts featured artists before stripping and records them', () => {
    const n = normalizeTitle('Pray for Me (feat. Kendrick Lamar)');
    expect(n.title).toBe('pray for me');
    expect(n.featured).toContain('kendrick lamar');
  });

  it('splits multiple featured artists', () => {
    const n = normalizeTitle('Track (feat. A, B & C)');
    expect(n.featured).toEqual(['a', 'b', 'c']);
  });

  it('preserves non-Latin script (no ASCII stripping)', () => {
    expect(normalizeTitle('봄날').title).toBe('봄날');
    expect(normalizeTitle('Полёт').title.length).toBeGreaterThan(0);
  });

  it('strips diacritics', () => {
    expect(normalizeTitle('Crème Brûlée').title).toBe('creme brulee');
  });

  it('flags whether noise was present', () => {
    expect(normalizeTitle('Song (2011 Remaster)').hadNoise).toBe(true);
    expect(normalizeTitle('Song').hadNoise).toBe(false);
  });
});

describe('normalizeArtist', () => {
  it('drops a leading "the"', () => {
    expect(normalizeArtist('The Beatles')).toBe('beatles');
  });

  it('drops the YouTube "- Topic" suffix', () => {
    expect(normalizeArtist('Daft Punk - Topic')).toBe('daft punk');
  });

  it('lowercases and strips diacritics', () => {
    expect(normalizeArtist('Beyoncé')).toBe('beyonce');
  });
});
