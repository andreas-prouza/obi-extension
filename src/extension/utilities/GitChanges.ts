// Files changed on the current git branch: for "Add sources changed on this branch" of build packages
// (docs/features/build-packages.md). git is called without a shell; branch names are checked first.
// No vscode imports: this module is unit-tested in plain Node.

import { execFileSync } from 'child_process';


export interface BranchChanges {
  /** The branch the current one is compared with */
  base: string;
  /** Commit where the current branch started (git merge-base) */
  merge_base: string;
  /** Changed, added and untracked files below `cwd` (relative to it, '/'-separated), not the deleted ones */
  files: string[];
}


/** A branch or ref name that can be passed to git: no option (leading '-'), no '..', only usual characters */
export function is_valid_base_branch(name: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(name) && !name.startsWith('-') && !name.includes('..') && !name.endsWith('/');
}


function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  // core.quotepath=off: file names are not quoted (names with other characters are no valid sources anyway)
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}


function git_ok(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string | undefined {
  try {
    return git(cwd, args, env).trim();
  }
  catch {
    return undefined;
  }
}


/** Base branch: the default branch of origin (origin/HEAD), otherwise main or master (local or origin), or undefined */
export function detect_base_branch(cwd: string, env?: NodeJS.ProcessEnv): string | undefined {
  const origin_head = git_ok(cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], env);
  if (origin_head && is_valid_base_branch(origin_head))
    return origin_head;
  return ['main', 'master', 'origin/main', 'origin/master']
    .find(candidate => git_ok(cwd, ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], env) !== undefined);
}


/**
 * Files changed since the current branch left `base`: committed, staged, not staged and untracked (not ignored).
 * Only files below `cwd`. Throws if `cwd` is not in a git repository or `base` is unknown.
 */
export function files_changed_since(cwd: string, base: string, env?: NodeJS.ProcessEnv): BranchChanges {
  if (!is_valid_base_branch(base))
    throw new Error(`Invalid branch name '${base}'`);

  let merge_base: string;
  try {
    merge_base = git(cwd, ['merge-base', 'HEAD', base], env).trim();
  }
  catch (e: unknown) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '').trim();
    throw new Error(`No common commit of the current branch and '${base}'${stderr ? `: ${stderr}` : ''}`, { cause: e });
  }

  const lines = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  // Working tree against the merge base: committed and not committed changes; d = without deleted files
  const changed = lines(git(cwd, ['diff', '--name-only', '--relative', '--diff-filter=d', merge_base, '--'], env));
  const untracked = lines(git(cwd, ['ls-files', '--others', '--exclude-standard', '--'], env));

  return { base, merge_base, files: [...new Set([...changed, ...untracked])].sort() };
}
