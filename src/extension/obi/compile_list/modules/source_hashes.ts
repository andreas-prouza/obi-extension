// MD5 hashes of all sources, read at most once per run and not at all if unchanged (cache).
// No vscode imports: this module is unit-tested in plain Node.

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { UserCancelledError } from '../../../../shared/Errors';


export interface HashOptions {
  /** Files hashed in parallel (config general.max-threads) */
  concurrency: number;
  /** JSON file with size/mtime/md5 per source; no cache if undefined */
  cache_file?: string;
  /** false: hash every file (Reset compiled object list) */
  use_cache?: boolean;
  /** Checked between files; true → UserCancelledError */
  is_cancelled?: () => boolean;
}


interface CacheEntry {
  size: number;
  mtime_ms: number;
  md5: string;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}


/** MD5 (hex) of the file content; also for empty files (d41d8cd98f00b204e9800998ecf8427e), like the Python OBI */
export function md5_file(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}


/** True if the last suffix of `name` is one of `extensions` ("a.rpgle.pgm" matches "pgm", "a.notpgm" doesn't) */
export function has_extension(name: string, extensions: string[]): boolean {
  if (extensions.length === 0)
    return true;
  const suffix = name.includes('.') ? (name.split('.').pop() ?? '') : '';
  return extensions.includes(suffix);
}


/** All sources below `root` with one of the extensions, as '/'-separated paths relative to `root` */
export async function list_sources(root: string, extensions: string[]): Promise<string[]> {
  const result: string[] = [];

  async function walk(dir: string, rel: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    }
    catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return;   // no source folder (yet)
      throw e;
    }
    await Promise.all(entries.map(async entry => {
      const entry_rel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory())
        await walk(path.join(dir, entry.name), entry_rel);
      else if (entry.isFile() && has_extension(entry.name, extensions))
        result.push(entry_rel);
    }));
  }

  await walk(root, '');
  return result.sort();
}


function read_cache(file: string | undefined): Record<string, CacheEntry> {
  if (!file)
    return {};
  try {
    const content = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<CacheFile>;
    return content.version === 1 && content.entries && typeof content.entries === 'object' ? content.entries : {};
  }
  catch {
    return {};   // missing or broken cache: hash everything
  }
}


function write_cache(file: string, entries: Record<string, CacheEntry>): void {
  const data: CacheFile = { version: 1, entries };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}


/**
 * Hashes of all sources below `source_root` ('/'-separated relative path → md5 hex).
 * A source whose size and modification time match the cache isn't read. Known limit: a change that keeps
 * both (same millisecond, same size) isn't detected; "Reset compiled object list" hashes without cache.
 */
export async function compute_source_hashes(source_root: string, extensions: string[], options: HashOptions): Promise<Record<string, string>> {

  const sources = await list_sources(source_root, extensions);
  const cache = options.use_cache === false ? {} : read_cache(options.cache_file);
  const new_cache: Record<string, CacheEntry> = {};
  const hashes: Record<string, string> = {};

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < sources.length) {
      if (options.is_cancelled?.())
        throw new UserCancelledError('Operation cancelled by user');

      const source = sources[next++];
      const file = path.join(source_root, source);
      const stat = await fs.promises.stat(file);
      const cached = cache[source];

      const md5 = cached && cached.size === stat.size && cached.mtime_ms === stat.mtimeMs ? cached.md5 : await md5_file(file);
      hashes[source] = md5;
      new_cache[source] = { size: stat.size, mtime_ms: stat.mtimeMs, md5 };
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, sources.length)) }, worker));

  // Entries of deleted files are dropped
  if (options.cache_file)
    write_cache(options.cache_file, new_cache);

  // In source order, not in the order the parallel reads finished: the build order depends on it
  return Object.fromEntries(sources.map(source => [source, hashes[source]]));
}


/** Sources that are new or changed compared to the hashes of the last successful build (object-builds.json) */
export function compare_hashes(current: Record<string, string>, built: Record<string, unknown>): { 'new-objects': string[]; 'changed-sources': string[] } {
  const new_objects: string[] = [];
  const changed: string[] = [];

  for (const [source, hash] of Object.entries(current)) {
    if (!Object.prototype.hasOwnProperty.call(built, source))
      new_objects.push(source);
    else if (built[source] !== hash)
      changed.push(source);
  }
  return { 'new-objects': new_objects, 'changed-sources': changed };
}
