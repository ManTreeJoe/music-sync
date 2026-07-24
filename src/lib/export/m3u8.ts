// lib/export/m3u8.ts
//
// M3U8 export — plain text, universally understood by local players and other
// import tools. Metadata only, no URIs (there are no local files to point at).

import type { ExportPlaylist } from './model';

export function toM3U8(playlist: ExportPlaylist): string {
  const lines: string[] = ['#EXTM3U'];

  for (const t of playlist.tracks) {
    // -1 is the conventional "unknown duration" sentinel in EXTINF.
    const seconds = t.durationMs != null ? Math.round(t.durationMs / 1000) : -1;
    const artist = t.artists.join(', ');
    lines.push(`#EXTINF:${seconds},${artist} - ${t.title}`);
  }

  return lines.join('\n') + '\n';
}
