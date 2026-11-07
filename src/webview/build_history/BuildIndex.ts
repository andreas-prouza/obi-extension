// Reads the build history folders, each compile-list.json at most once per change (cache by mtime and size).
// No vscode imports: this module is unit-tested in plain Node.

import * as fs from 'fs';
import * as path from 'path';
import { BuildEntry, newest_first, read_build } from './HistoryIndex';


interface CacheEntry {
  mtime_ms: number;
  size: number;
  entry: BuildEntry | undefined;
}

export interface Cancellation {
  readonly isCancellationRequested: boolean;
}


export class BuildIndex {

  /** Key: absolute path of the history folder */
  private static cache = new Map<string, CacheEntry>();
  private static listeners = new Set<() => void>();


  /** The build of one history folder; undefined if it has no readable compile-list.json or no timestamp name */
  public static read(dir_path: string): BuildEntry | undefined {
    const file = path.join(dir_path, 'compile-list.json');
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    }
    catch {
      BuildIndex.cache.delete(dir_path);
      return undefined;
    }

    const cached = BuildIndex.cache.get(dir_path);
    if (cached && cached.mtime_ms === stat.mtimeMs && cached.size === stat.size)
      return cached.entry;

    let entry: BuildEntry | undefined;
    try {
      entry = read_build(path.basename(dir_path), JSON.parse(fs.readFileSync(file, 'utf8')));
    }
    catch {
      entry = undefined;   // broken file: shown as nothing, the history tree shows a warning
    }
    BuildIndex.cache.set(dir_path, { mtime_ms: stat.mtimeMs, size: stat.size, entry });
    return entry;
  }


  /** All builds of the history folder, newest first. Stops early (with the builds read so far) when cancelled. */
  public static list(history_root: string, token?: Cancellation): BuildEntry[] {
    let dirs: fs.Dirent[];
    try {
      dirs = fs.readdirSync(history_root, { withFileTypes: true });
    }
    catch {
      return [];
    }

    const entries: BuildEntry[] = [];
    const seen = new Set<string>();
    for (const dir of dirs) {
      if (token?.isCancellationRequested)
        return newest_first(entries);
      if (!dir.isDirectory())
        continue;
      const dir_path = path.join(history_root, dir.name);
      seen.add(dir_path);
      const entry = BuildIndex.read(dir_path);
      if (entry)
        entries.push(entry);
    }

    // Deleted builds
    for (const key of BuildIndex.cache.keys()) {
      if (path.dirname(key) === history_root && !seen.has(key))
        BuildIndex.cache.delete(key);
    }
    return newest_first(entries);
  }


  /** The history changed (new build, deletion): tell the views. The cache checks the files itself. */
  public static changed(): void {
    for (const listener of BuildIndex.listeners) {
      try {
        listener();
      }
      catch {
        // one view must not stop the others
      }
    }
  }


  public static on_changed(listener: () => void): { dispose(): void } {
    BuildIndex.listeners.add(listener);
    return { dispose: () => BuildIndex.listeners.delete(listener) };
  }


  public static reset(): void {
    BuildIndex.cache.clear();
  }
}
