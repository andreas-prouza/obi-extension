import * as path from 'path';
import { format_elapsed } from '../utilities/OutputLines';
import { is_valid_source_path } from '../../shared/ShellQuote';
// No vscode imports: this module is unit-tested in plain Node.


/** Paths relative to the project folder; the same locally and on the IBM i */
export interface DownloadPlan {
  /** Files of these folders, without subfolders */
  flat_dirs: string[];
  /** Folders with subfolders */
  dirs: string[];
  /** Folders and files of the built sources; they only exist if the OBI wrote them (checked first) */
  optional: { dirs: string[]; files: string[] };
}

interface CompileList {
  compiles?: { sources?: { source?: unknown; cmds?: { status?: unknown }[] }[] }[];
}


/** Folder of a source's command outputs, as the Python OBI writes it (results.py: lib/qrpglesrc/a.pgm → lib/a.pgm) */
export function source_output_dir(build_output_dir: string, source: string): string {
  const sub_folder = path.posix.basename(path.posix.dirname(source));
  return path.posix.join(build_output_dir, source.replace(`${sub_folder}/`, ''));
}


function relative_dir(dir: string | undefined, fallback: string): string {
  const normalized = path.posix.normalize((dir || fallback).replace(/\\/g, '/')).replace(/\/+$/, '');
  return normalized.startsWith('../') || path.posix.isAbsolute(normalized) ? fallback : normalized;
}


/**
 * What to download after a build: the files of this build instead of everything that collected on the IBM i.
 * .obi/log is cleared before each run, so it only contains this run.
 */
export function result_download_plan(compile_list: CompileList, general: { 'build-output-dir'?: string; 'evfevent-output-dir'?: string }): DownloadPlan {
  const build_output_dir = relative_dir(general['build-output-dir'], '.obi/build-output');
  const evfevent_dir = relative_dir(general['evfevent-output-dir'], '.obi/tmp/evfevent');
  const dirs = new Set<string>();
  const files = new Set<string>();

  for (const level of Array.isArray(compile_list.compiles) ? compile_list.compiles : []) {
    for (const entry of Array.isArray(level?.sources) ? level.sources : []) {
      // The compile list comes from the IBM i: nothing outside the project folder
      if (typeof entry?.source !== 'string' || !is_valid_source_path(entry.source))
        continue;
      files.add(path.posix.join(evfevent_dir, entry.source));
      // Outputs are written for commands that ran
      if (Array.isArray(entry.cmds) && entry.cmds.some(cmd => cmd?.status !== 'new'))
        dirs.add(source_output_dir(build_output_dir, entry.source));
    }
  }

  return {
    flat_dirs: ['.obi/build-output', '.obi/tmp'],
    dirs: ['.obi/log'],
    optional: { dirs: Array.from(dirs), files: Array.from(files) }
  };
}


/** Runs `task` for all items, at most `limit` at a time; results in the order of the items */
export async function run_limited<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}


/** ssh-concurrency: parallel SFTP transfers, 1–32, default 5 */
export function ssh_concurrency(value: unknown): number {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number))
    return 5;
  return Math.min(32, Math.max(1, Math.round(number)));
}


export class PhaseTimer {

  private readonly started: number;
  private readonly phases: { name: string; ms: number }[] = [];

  constructor(private readonly now: () => number = Date.now) {
    this.started = now();
  }

  public async run<T>(name: string, phase: () => Promise<T>): Promise<T> {
    const start = this.now();
    try {
      return await phase();
    }
    finally {
      this.phases.push({ name, ms: this.now() - start });
    }
  }

  public total_ms(): number {
    return this.now() - this.started;
  }

  /** e.g. "upload sources 0:02 · remote run 2:31 · total 2:41" */
  public summary(): string {
    return [...this.phases.map(phase => `${phase.name} ${format_elapsed(phase.ms)}`), `total ${format_elapsed(this.total_ms())}`].join(' · ');
  }
}
