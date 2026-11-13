// What the build history contains, per build and per source: for the Timeline and the history tree.
// No vscode imports: this module is unit-tested in plain Node.

import { SourceStatus, is_failed, source_status } from '../../shared/BuildStatus';
import { deployment_of } from '../../shared/IReleaser';
import { parse_history_dir } from './HistoryTimestamp';


export interface CmdResult {
  cmd: string;
  status: string;
}

export interface SourceResult {
  status: SourceStatus;
  /** MD5 of the source content that was built */
  hash?: string;
  /** Commands that count (not ignored) */
  cmds: CmdResult[];
}

export interface BuildEntry {
  /** History folder name */
  dir: string;
  time: Date;
  /** Key: source as in compile-list.json, e.g. 'prouzalib/qrpglesrc/x.rpgle' */
  sources: Map<string, SourceResult>;
  /** Sources that aren't ignored, and those of them that failed or weren't built (like the status bar) */
  total: number;
  failed: number;
  /** Id of the i-Releaser deployment started for this build */
  deployment?: string;
}

export interface FolderBuild {
  entry: BuildEntry;
  /** Sources of the folder in this build (not ignored), and those that failed */
  total: number;
  failed: number;
}


const is_object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);


/** One history folder; undefined if its name is no timestamp or its compile-list.json has no `compiles` list */
export function read_build(dir: string, compile_list: unknown): BuildEntry | undefined {
  const time = parse_history_dir(dir);
  if (!time || !is_object(compile_list) || !Array.isArray(compile_list.compiles))
    return undefined;

  const sources = new Map<string, SourceResult>();
  let total = 0;
  let failed = 0;
  for (const level of compile_list.compiles) {
    if (!is_object(level) || !Array.isArray(level.sources))
      continue;
    for (const source of level.sources) {
      if (!is_object(source) || typeof source.source !== 'string' || source.source === '')
        continue;
      const status = source_status(source);
      const cmds = (Array.isArray(source.cmds) ? source.cmds : [])
        .filter(is_object)
        .filter(cmd => !cmd.ignore)
        .map(cmd => ({ cmd: typeof cmd.cmd === 'string' ? cmd.cmd : '', status: typeof cmd.status === 'string' ? cmd.status : '' }));
      sources.set(source.source, { status, hash: typeof source.hash === 'string' ? source.hash : undefined, cmds });
      if (status !== 'ignored') {
        total++;
        if (is_failed(status))
          failed++;
      }
    }
  }
  const deployment = deployment_of(compile_list);
  return deployment ? { dir, time, sources, total, failed, deployment: String(deployment.id) } : { dir, time, sources, total, failed };
}


/** Newest first; same time: by folder name, so the order is stable */
export function newest_first(entries: Iterable<BuildEntry>): BuildEntry[] {
  return [...entries].sort((a, b) => b.time.getTime() - a.time.getTime() || b.dir.localeCompare(a.dir));
}


/** Builds that contain `source`, newest first */
export function builds_for_source(index: readonly BuildEntry[], source: string): BuildEntry[] {
  return newest_first(index.filter(entry => entry.sources.has(source)));
}


/** Builds with at least one source below `folder` (relative to the source dir, '/'-separated; '' = all), newest first */
export function builds_below_folder(index: readonly BuildEntry[], folder: string): FolderBuild[] {
  const prefix = folder.replace(/\/+$/, '');
  const below = (source: string) => prefix === '' || source.startsWith(`${prefix}/`);

  const result: FolderBuild[] = [];
  for (const entry of newest_first(index)) {
    let found = false;
    let total = 0;
    let failed = 0;
    for (const [source, result_of_source] of entry.sources) {
      if (!below(source))
        continue;
      found = true;
      if (result_of_source.status === 'ignored')
        continue;
      total++;
      if (is_failed(result_of_source.status))
        failed++;
    }
    if (found)
      result.push({ entry, total, failed });
  }
  return result;
}


/** Paging for the Timeline: the cursor is the index of the next item. No limit = all; an invalid cursor starts at the top. */
export function page<T>(items: readonly T[], cursor: string | undefined, limit: number | undefined): { items: T[]; cursor?: string } {
  const parsed = cursor !== undefined && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const start = parsed <= items.length ? parsed : 0;
  const end = limit !== undefined && Number.isFinite(limit) && limit > 0 ? Math.min(items.length, start + Math.floor(limit)) : items.length;
  return end < items.length ? { items: items.slice(start, end), cursor: String(end) } : { items: items.slice(start, end) };
}


/** Timeline item id of a build or of a source in a build. History folder names contain no ':' (see HistoryTimestamp). */
export function item_id(dir: string, path_in_build?: string): string {
  return path_in_build === undefined ? dir : `${dir}:${path_in_build}`;
}

export function parse_item_id(id: string): { dir: string; path?: string } {
  const at = id.indexOf(':');
  return at < 0 ? { dir: id } : { dir: id.slice(0, at), path: id.slice(at + 1) };
}
