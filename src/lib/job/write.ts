// lib/job/write.ts
//
// Write the matched tracks onto the destination: create a new playlist or
// append to an existing one, deduping against what's already there. YouTube gets
// a quota preflight so a job never dies half-written. Provider + auth are
// injectable so this is testable without network.

import { getProvider as registryGetProvider } from '../providers';
import { JobError } from './types';
import { toJobError } from './errors';
import type { Auth, MusicProvider, Platform } from '../providers/types';

export interface WriteTrackRef {
  platformId: string;
  isrc?: string;
}

export interface WriteInput {
  destination: Platform;
  mode: 'create' | 'append';
  playlistId?: string; // append target
  name?: string; // create
  description?: string;
  tracks: WriteTrackRef[];
  unmatchedCount?: number;
}

export interface WriteResult {
  playlistId: string;
  playlistUrl: string;
  added: number;
  skippedDupes: number;
  unmatched: number;
}

export interface RunWriteDeps {
  auth: Auth;
  getProvider?: (platform: Platform) => MusicProvider;
  /** YouTube quota preflight/accounting (omit for other platforms). */
  canAfford?: (units: number) => Promise<boolean> | boolean;
  charge?: (units: number) => Promise<void> | void;
  quotaResetHint?: string;
}

function playlistUrlFor(platform: Platform, id: string): string {
  switch (platform) {
    case 'spotify':
      return `https://open.spotify.com/playlist/${id}`;
    case 'apple':
      return `https://music.apple.com/library/playlist/${id}`;
    case 'youtube':
      return `https://music.youtube.com/playlist?list=${id}`;
  }
}

export async function runWrite(input: WriteInput, deps: RunWriteDeps): Promise<WriteResult> {
  const provider = (deps.getProvider ?? registryGetProvider)(input.destination);

  // Dedup within the incoming set (a source can list the same track twice).
  const seen = new Set<string>();
  let incoming = input.tracks.filter(
    (t) => t.platformId && !seen.has(t.platformId) && seen.add(t.platformId),
  );
  let skippedDupes = input.tracks.length - incoming.length;

  try {
    let targetId = input.playlistId;
    let playlistUrl = '';

    // Append: skip anything already in the destination (platform id, then ISRC).
    if (input.mode === 'append') {
      if (!targetId) {
        throw new JobError('DEST_NOT_WRITABLE', 'Choose a playlist to add to.');
      }
      const existing = await provider.getTracks(targetId, deps.auth);
      const existIds = new Set(existing.map((t) => t.platformId));
      const existIsrcs = new Set(existing.map((t) => t.isrc).filter(Boolean) as string[]);
      const before = incoming.length;
      incoming = incoming.filter(
        (t) => !existIds.has(t.platformId) && !(t.isrc && existIsrcs.has(t.isrc)),
      );
      skippedDupes += before - incoming.length;
    }

    // YouTube quota: refuse up front, never fail mid-write.
    if (input.destination === 'youtube' && deps.canAfford) {
      const cost = provider.estimateWriteCost(incoming.length);
      if (!(await deps.canAfford(cost))) {
        throw new JobError(
          'QUOTA_EXCEEDED',
          `YouTube's daily limit is used up${deps.quotaResetHint ? `. Resets ${deps.quotaResetHint}` : ''}.`,
        );
      }
    }

    if (input.mode === 'create') {
      const created = await provider.createPlaylist(
        input.name?.trim() || 'Playlist Bridge',
        input.description ?? 'Created by Playlist Bridge',
        deps.auth,
      );
      targetId = created.id;
      playlistUrl = created.url;
    }

    if (incoming.length > 0) {
      await provider.addTracks(targetId!, incoming.map((t) => t.platformId), deps.auth);
    }

    if (input.destination === 'youtube' && deps.charge) {
      await deps.charge(provider.estimateWriteCost(incoming.length));
    }

    return {
      playlistId: targetId!,
      playlistUrl: playlistUrl || playlistUrlFor(input.destination, targetId!),
      added: incoming.length,
      skippedDupes,
      unmatched: input.unmatchedCount ?? 0,
    };
  } catch (e) {
    throw toJobError(e);
  }
}
