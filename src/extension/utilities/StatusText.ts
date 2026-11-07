// Text and tooltip of the OBI status bar item.
// No vscode imports: this module is unit-tested in plain Node.

import { format_elapsed } from './OutputLines';
import { is_failed, source_status } from '../../shared/BuildStatus';


export interface LastBuild {
  /** ISO timestamp */
  time: string;
  total: number;
  failed: number;
}

export interface StatusState {
  profile: string;
  /** user@host */
  connection?: string;
  remote_dir?: string;
  running?: { label: string; elapsed_ms: number };
  cancelled?: boolean;
  last_build?: LastBuild;
}


interface CompileListLike {
  compiles?: { sources?: { ignore?: boolean; cmds?: { status?: string; ignore?: boolean }[] }[] }[];
}


/** Sources of a compile list, and those with a command that didn't succeed (ignored ones don't count) */
export function summarize_build(compile_list: CompileListLike | undefined, time: Date = new Date()): LastBuild {
  let total = 0;
  let failed = 0;
  for (const level of compile_list?.compiles ?? []) {
    for (const source of level.sources ?? []) {
      const status = source_status(source);
      if (status === 'ignored')
        continue;
      total++;
      if (is_failed(status))
        failed++;
    }
  }
  return { time: time.toISOString(), total, failed };
}


const clock = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const sources = (n: number) => `${n} source${n === 1 ? '' : 's'}`;


/** Markdown tooltip; codicons as $(name) */
export function render_status(state: StatusState): { text: string; tooltip: string } {

  const lines = [`**OBI** · profile **${state.profile}**`];
  if (state.connection)
    lines.push(`${state.connection}${state.remote_dir ? ` · \`${state.remote_dir}\`` : ''}`);

  if (state.cancelled)
    return { text: '$(circle-slash) Cancelled', tooltip: lines.join('\n\n') };

  if (state.running) {
    lines.push(`$(sync~spin) ${state.running.label} · ${format_elapsed(state.running.elapsed_ms)}`);
    return { text: `$(sync~spin) ${state.running.label}…`, tooltip: lines.join('\n\n') };
  }

  let text = `$(server-environment) ${state.profile}`;
  const last = state.last_build;
  if (last && last.total > 0) {
    if (last.failed > 0) {
      text += `  $(error) ${last.failed} failed`;
      lines.push(`Last build ${clock(last.time)}: ${last.failed} of ${sources(last.total)} failed`);
    }
    else {
      text += `  $(check) ${clock(last.time)}`;
      lines.push(`Last build ${clock(last.time)}: ${sources(last.total)}, all successful`);
    }
  }
  return { text, tooltip: lines.join('\n\n') };
}
