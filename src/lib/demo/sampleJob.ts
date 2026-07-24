// lib/demo/sampleJob.ts
//
// A realistic sample transfer, run through the REAL matching engine so the
// review screen renders genuine tier/confidence output rather than mock data.
// This stands in for a live Inngest job until the provider adapters land.

import { matchTrack } from '../matching';
import type { Track } from '../providers/types';
import type { ReviewJob } from '../job/types';

const src = (t: Partial<Track>): Track => ({
  title: '',
  artists: [],
  platformId: '',
  platform: 'spotify',
  ...t,
});

const apple = (t: Partial<Track>): Track => src({ ...t, platform: 'apple' });

/** The sample renders the same shape a real job does. */
export type SampleJob = ReviewJob;

interface Case {
  source: Track;
  isrcCandidates?: Track[];
  searchCandidates?: Track[];
}

const CASES: Case[] = [
  // Tier 1 — authoritative ISRC hit → high.
  {
    source: src({
      title: 'Redbone',
      artists: ['Childish Gambino'],
      album: 'Awaken, My Love!',
      isrc: 'USUM71614306',
      durationMs: 326933,
      platformId: 'spotify:track:0wXuerDYiBnERgIpbb3JBR',
      sourceUrl: 'https://open.spotify.com/track/0wXuerDYiBnERgIpbb3JBR',
    }),
    isrcCandidates: [
      apple({
        title: 'Redbone',
        artists: ['Childish Gambino'],
        isrc: 'USUM71614306',
        durationMs: 327000,
        platformId: 'apple:1451967220',
      }),
    ],
  },
  // Tier 2 — clean fuzzy match → medium.
  {
    source: src({
      title: 'Yellow',
      artists: ['Coldplay'],
      album: 'Parachutes',
      durationMs: 266000,
      platformId: 'spotify:track:yellow',
    }),
    searchCandidates: [
      apple({
        title: 'Yellow',
        artists: ['Coldplay'],
        durationMs: 266600,
        platformId: 'apple:yellow',
      }),
    ],
  },
  // Tier 2 across remaster noise → medium (noise stripped).
  {
    source: src({
      title: 'Bohemian Rhapsody - Remastered 2011',
      artists: ['Queen'],
      album: 'A Night at the Opera',
      durationMs: 354000,
      platformId: 'spotify:track:bohemian',
    }),
    searchCandidates: [
      apple({
        title: 'Bohemian Rhapsody',
        artists: ['Queen'],
        durationMs: 354320,
        platformId: 'apple:bohemian',
      }),
    ],
  },
  // Needs review — best candidate lands between 0.70 and 0.90 → low, with alts.
  {
    source: src({
      title: 'Sunset Lover',
      artists: ['Petit Biscuit'],
      album: 'Petit Biscuit',
      durationMs: 236000,
      platformId: 'spotify:track:sunsetlover',
    }),
    searchCandidates: [
      apple({
        title: 'Sunset Lover',
        artists: ['Petit Biscuits'], // near-miss artist
        durationMs: 243500, // ~7s off
        platformId: 'apple:sunsetlover-a',
      }),
      apple({
        title: 'Sunset',
        artists: ['Petit Biscuit'],
        durationMs: 201000,
        platformId: 'apple:sunset-b',
      }),
      apple({
        title: 'Sunset Lover',
        artists: ['Kaidi Tatham'],
        durationMs: 250000,
        platformId: 'apple:sunsetlover-c',
      }),
    ],
  },
  // Tier 3 — genuinely absent from the destination catalog → unmatched.
  {
    source: src({
      title: 'Iridescence (Bedroom Demo)',
      artists: ['Unsigned Local Act'],
      durationMs: 178000,
      platformId: 'spotify:track:iridescence',
    }),
    searchCandidates: [],
  },
];

export function buildSampleJob(): SampleJob {
  const results = CASES.map((c) =>
    matchTrack({
      source: c.source,
      isrcCandidates: c.isrcCandidates,
      searchCandidates: c.searchCandidates,
      destinationPlatform: 'apple',
    }),
  );

  return {
    name: 'Late Night Drive',
    sourcePlatform: 'spotify',
    destinationPlatform: 'apple',
    sourceUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd',
    results,
    // Two local files and a podcast episode were skipped during the read.
    skipped: { local: 2, episodes: 1, unavailable: 0 },
  };
}
