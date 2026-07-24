// lib/export/index.ts

export { buildExportPlaylist, exportBaseName } from './model';
export type { ExportPlaylist, ExportTrack, ExportMeta } from './model';
export { toCSV } from './csv';
export { toJSON, toExportJson } from './json';
export type { ExportJson } from './json';
export { toM3U8 } from './m3u8';

import type { ExportPlaylist } from './model';
import { toCSV } from './csv';
import { toJSON } from './json';
import { toM3U8 } from './m3u8';

export type ExportFormat = 'csv' | 'json' | 'm3u8';

export interface RenderedExport {
  body: string;
  contentType: string;
  extension: ExportFormat;
}

/** Render an export in the requested format, with the right content type. */
export function renderExport(
  playlist: ExportPlaylist,
  format: ExportFormat,
): RenderedExport {
  switch (format) {
    case 'csv':
      return {
        body: toCSV(playlist),
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      };
    case 'json':
      return {
        body: toJSON(playlist),
        contentType: 'application/json; charset=utf-8',
        extension: 'json',
      };
    case 'm3u8':
      return {
        body: toM3U8(playlist),
        contentType: 'audio/x-mpegurl; charset=utf-8',
        extension: 'm3u8',
      };
  }
}
