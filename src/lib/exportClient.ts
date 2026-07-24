// lib/exportClient.ts
//
// Browser-side export download for the demo. The export builders are pure TS
// with no Node dependencies, so they run fine in the client bundle. In
// production this same model would be rendered by the server /api/export route
// and streamed; here we build the file in-page so the buttons work without a
// backend.

import {
  buildExportPlaylist,
  exportBaseName,
  renderExport,
  type ExportFormat,
} from './export';
import type { MatchResult, Platform } from './providers/types';

export interface ExportContext {
  name: string;
  sourcePlatform: Platform;
  sourceUrl?: string;
}

export function downloadExport(
  ctx: ExportContext,
  results: MatchResult[],
  format: ExportFormat,
): void {
  const playlist = buildExportPlaylist(
    { ...ctx, exportedAt: new Date().toISOString() },
    results,
  );
  const { body, contentType, extension } = renderExport(playlist, format);

  const blob = new Blob([body], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exportBaseName(playlist)}.${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
