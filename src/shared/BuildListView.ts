// What the build summary shows of a build list: the status of each source and the counts per level and in total.
// No vscode imports: unit-tested in plain Node.


export interface StatusCounts {
  total: number;
  success: number;
  failed: number;
  /** Not built yet, or still running */
  open: number;
}


/** Status of a source: that of its last command that ran (status other than 'new'), else that of its first command */
export function source_status(cmds: unknown): string {
  const list = Array.isArray(cmds) ? cmds : [];
  const status_of = (cmd: unknown): string | undefined => {
    const status = typeof cmd === 'object' && cmd !== null ? (cmd as { status?: unknown }).status : undefined;
    return typeof status === 'string' && status !== '' ? status : undefined;
  };
  let status = status_of(list[0]) ?? 'new';
  for (const cmd of list) {
    const value = status_of(cmd);
    if (value !== undefined && value !== 'new')
      status = value;
  }
  return status;
}


export function is_failed_status(status: string): boolean {
  return status === 'failed' || status === 'error';
}


function count(statuses: string[]): StatusCounts {
  const success = statuses.filter(status => status === 'success').length;
  const failed = statuses.filter(is_failed_status).length;
  return { total: statuses.length, success: success, failed: failed, open: statuses.length - success - failed };
}


/**
 * Adds `view_status` to every source and `view_counts` to every level of the build list (for the template),
 * and returns the counts of the whole list. Entries that aren't objects are left out of the counts.
 */
export function annotate_build_list(compile_list: unknown): StatusCounts & { levels: number } {
  const levels = typeof compile_list === 'object' && compile_list !== null && Array.isArray((compile_list as { compiles?: unknown }).compiles)
    ? (compile_list as { compiles: unknown[] }).compiles : [];
  const all: string[] = [];
  let level_count = 0;
  for (const level of levels) {
    if (typeof level !== 'object' || level === null)
      continue;
    level_count++;
    const sources = Array.isArray((level as { sources?: unknown }).sources) ? (level as { sources: unknown[] }).sources : [];
    const statuses: string[] = [];
    for (const source of sources) {
      if (typeof source !== 'object' || source === null)
        continue;
      const status = source_status((source as { cmds?: unknown }).cmds);
      (source as Record<string, unknown>)['view_status'] = status;
      statuses.push(status);
    }
    (level as Record<string, unknown>)['view_counts'] = count(statuses);
    all.push(...statuses);
  }
  return { ...count(all), levels: level_count };
}
