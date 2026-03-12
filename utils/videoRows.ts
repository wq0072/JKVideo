import type { VideoItem } from '../services/types';

export interface NormalRow {
  type: 'pair';
  left: VideoItem;
  right: VideoItem | null;
}

export interface BigRow {
  type: 'big';
  item: VideoItem;
}

export type ListRow = NormalRow | BigRow;

const PAGE = 21; // matches API page size

/**
 * Transform a flat VideoItem array into display rows.
 * Videos are chunked by page size (20). The last item of each chunk
 * becomes a full-width BigRow so BigVideoCards stay at stable positions
 * even as more pages are loaded.
 */

export function toListRows(videos: VideoItem[]): ListRow[] {
  if (videos.length === 0) return [];
  const rows: ListRow[] = [];
  for (let start = 0; start < videos.length; start += PAGE) {
    const chunk = videos.slice(start, start + PAGE);
    // Pick the video with the highest view count as the BigRow
    let bigIdx = 0;
    let maxView = chunk[0].stat?.view ?? 0;
    for (let i = 1; i < chunk.length; i++) {
      const v = chunk[i].stat?.view ?? 0;
      if (v > maxView) { maxView = v; bigIdx = i; }
    }
    const bigItem = chunk[bigIdx];
    const rest = chunk.filter((_, i) => i !== bigIdx);
    for (let i = 0; i < rest.length; i += 2) {
      rows.push({ type: 'pair', left: rest[i], right: rest[i + 1] ?? null });
    }
    rows.push({ type: 'big', item: bigItem });
  }

  return rows;
}
