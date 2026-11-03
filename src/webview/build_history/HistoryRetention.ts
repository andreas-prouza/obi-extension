import * as fs from 'fs';
import * as path from 'path';


export interface HistoryEntry {
  dir: string;
  /** undefined if the folder name is no timestamp: such folders are never deleted */
  date: Date | undefined;
}

export interface RetentionSettings {
  /** Keep at most this many builds; 0 = unlimited */
  max_builds: number;
  /** Delete builds older than this many days; 0 = unlimited */
  max_age_days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;


/** Folders to delete: beyond the newest `max_builds` or older than `max_age_days`; never `keep` */
export function select_expired(entries: HistoryEntry[], settings: RetentionSettings, now: Date, keep?: string): string[] {
  const max_builds = Number.isFinite(settings.max_builds) && settings.max_builds > 0 ? Math.floor(settings.max_builds) : 0;
  const max_age_days = Number.isFinite(settings.max_age_days) && settings.max_age_days > 0 ? settings.max_age_days : 0;

  const dated = entries
    .filter((entry): entry is { dir: string; date: Date } => entry.date instanceof Date && !isNaN(entry.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return dated
    .filter((entry, index) =>
      entry.dir !== keep && (
        (max_builds > 0 && index >= max_builds) ||
        (max_age_days > 0 && now.getTime() - entry.date.getTime() > max_age_days * DAY_MS)))
    .map(entry => entry.dir);
}


export function format_size(bytes: number): string {
  if (bytes < 1024 * 1024)
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}


/** Total size of the files below `dir` (0 if it doesn't exist) */
export async function folder_size(dir: string): Promise<number> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  }
  catch {
    return 0;
  }
  let bytes = 0;
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory())
      bytes += await folder_size(file);
    else if (entry.isFile())
      bytes += await fs.promises.stat(file).then(stat => stat.size, () => 0);
  }
  return bytes;
}
