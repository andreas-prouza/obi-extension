// Last build of each build package on this computer: status, time and the build summary in the build history
// (docs/features/build-packages.md). Local, like the build history: .obi/cache is not committed.
// No vscode imports: this module is unit-tested in plain Node.

import * as fs from 'fs';
import * as path from 'path';
import { source_status } from '../../shared/BuildStatus';
import { is_valid_package_name } from '../../shared/BuildPackage';
import { write_file_atomic } from '../utilities/AtomicFile';
import { parse_history_dir } from '../../shared/HistoryTimestamp';


export const PACKAGE_LAST_BUILDS_FILE = '.obi/cache/build-packages-last-build.json';

/** `success`: all sources built; `failed`: a source failed; `incomplete`: none failed, but some weren't built (cancelled) */
export type LastBuildStatus = 'success' | 'failed' | 'incomplete';

export interface PackageLastBuild {
  status: LastBuildStatus;
  /** Time of the build, ISO with zone */
  timestamp: string;
  /** Folder of the build in .obi/build-history (its build summary) */
  history: string;
  /** Sources of the build list that count (not ignored), failed ones, and not built ones */
  total: number;
  failed: number;
  not_run: number;
}


const is_object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);


/** Package and result of a build stored in the build history folder `history_dir`; undefined if it isn't a package build */
export function last_build_of(history_dir: string, compile_list: unknown): { name: string; build: PackageLastBuild } | undefined {
  if (!is_object(compile_list) || !is_object(compile_list.package))
    return undefined;
  const name = compile_list.package.name;
  if (typeof name !== 'string' || !is_valid_package_name(name))
    return undefined;

  let total = 0, failed = 0, not_run = 0;
  for (const level of Array.isArray(compile_list.compiles) ? compile_list.compiles : []) {
    for (const source of is_object(level) && Array.isArray(level.sources) ? level.sources : []) {
      if (!is_object(source))
        continue;
      const status = source_status(source);
      if (status === 'ignored')
        continue;
      total++;
      if (status === 'failed')
        failed++;
      else if (status === 'not-run')
        not_run++;
    }
  }

  const time = parse_history_dir(history_dir) ?? new Date();
  return {
    name,
    build: {
      status: failed > 0 ? 'failed' : not_run > 0 ? 'incomplete' : 'success',
      timestamp: time.toISOString(), history: history_dir, total, failed, not_run
    }
  };
}


function is_last_build(value: unknown): value is PackageLastBuild {
  return is_object(value) && ['success', 'failed', 'incomplete'].includes(value.status as string)
    && typeof value.timestamp === 'string' && typeof value.history === 'string'
    && typeof value.total === 'number' && typeof value.failed === 'number' && typeof value.not_run === 'number';
}


/** The file in .obi/cache; a missing or broken file counts as empty (it is only a cache of the build history) */
export class PackageLastBuilds {

  constructor(private readonly ws: string) { }


  public file(): string {
    return path.join(this.ws, PACKAGE_LAST_BUILDS_FILE);
  }


  public all(): Record<string, PackageLastBuild> {
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(this.file(), 'utf8'));
    }
    catch {
      return {};
    }
    if (!is_object(data))
      return {};
    return Object.fromEntries(Object.entries(data).filter(([name, build]) => is_valid_package_name(name) && is_last_build(build))) as Record<string, PackageLastBuild>;
  }


  public get(name: string): PackageLastBuild | undefined {
    return this.all()[name];
  }


  /** True if the build summary of the last build is still in the build history (retention may have deleted it) */
  public summary_exists(build: PackageLastBuild): boolean {
    return /^[^/\\]+$/.test(build.history) && build.history !== '..'
      && fs.existsSync(path.join(this.ws, '.obi', 'build-history', build.history, 'compile-list.json'));
  }


  /** Stores the build if `compile_list` belongs to a package; returns the package name */
  public record(history_dir: string, compile_list: unknown): string | undefined {
    const last = last_build_of(history_dir, compile_list);
    if (!last)
      return undefined;
    // An older build opened from the history and built again: the newest one stays the last build
    const current = this.get(last.name);
    if (current && current.timestamp > last.build.timestamp)
      return undefined;
    this.write({ ...this.all(), [last.name]: last.build });
    return last.name;
  }


  public rename(old_name: string, new_name: string): void {
    const all = this.all();
    if (!all[old_name] || old_name === new_name)
      return;
    all[new_name] = all[old_name];
    delete all[old_name];
    this.write(all);
  }


  public remove(name: string): void {
    const all = this.all();
    if (!all[name])
      return;
    delete all[name];
    this.write(all);
  }


  private write(all: Record<string, PackageLastBuild>): void {
    write_file_atomic(this.file(), `${JSON.stringify(all, null, 2)}\n`);
  }
}
