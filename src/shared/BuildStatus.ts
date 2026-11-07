// Result of one source in a compile list. Shared by the status bar and the Timeline, so both always agree.
// No vscode imports: this module is unit-tested in plain Node.


export type SourceStatus = 'success' | 'failed' | 'not-run' | 'ignored';

export interface StatusCmdLike { status?: unknown; ignore?: unknown }
export interface StatusSourceLike { ignore?: unknown; cmds?: unknown }


/** Commands of a source that count: not ignored, and objects at all */
function counted_cmds(source: StatusSourceLike): StatusCmdLike[] {
  return (Array.isArray(source.cmds) ? source.cmds : [])
    .filter((cmd): cmd is StatusCmdLike => typeof cmd === 'object' && cmd !== null && !(cmd as StatusCmdLike).ignore);
}


/**
 * `ignored`: the source is ignored; `success`: every command that counts succeeded (also without commands);
 * `not-run`: the commands that didn't succeed are all still `new` (the build stopped before them); `failed` otherwise.
 */
export function source_status(source: StatusSourceLike): SourceStatus {
  if (source.ignore)
    return 'ignored';
  const open = counted_cmds(source).filter(cmd => cmd.status !== 'success');
  if (open.length === 0)
    return 'success';
  return open.every(cmd => cmd.status === 'new') ? 'not-run' : 'failed';
}


/** Counts as a failed source in the status bar and the Timeline: it was meant to be built and wasn't */
export function is_failed(status: SourceStatus): boolean {
  return status === 'failed' || status === 'not-run';
}
