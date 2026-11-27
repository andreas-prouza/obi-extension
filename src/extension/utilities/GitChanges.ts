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


/**
 * Deployment guard D4: uncommitted changes (also untracked files) below `cwd`. undefined if `cwd` is not in a
 * git repository.
 */
export function has_uncommitted_changes(cwd: string, env?: NodeJS.ProcessEnv): boolean | undefined {
  const status = git_ok(cwd, ['status', '--porcelain', '--', '.'], env);
  return status === undefined ? undefined : status.length > 0;
}


/**
 * Deployment guard D1: `commit` is on origin/<branch>. Fetches the branch first (without it, the answer is the one
 * of the last fetch). A commit or branch that isn't valid is never on it.
 */
export function commit_on_remote_branch(cwd: string, commit: string, branch: string, env?: NodeJS.ProcessEnv): boolean {
  if (!/^[0-9a-f]{7,64}$/i.test(commit) || !is_valid_base_branch(branch))
    return false;
  try {
    // No prompt for credentials, and not longer than 30 seconds: the answer of the last fetch is used then
    execFileSync('git', ['fetch', '--quiet', 'origin', branch], { cwd, env: { ...(env ?? process.env), GIT_TERMINAL_PROMPT: '0' }, stdio: 'ignore', timeout: 30_000 });
  }
  catch {
    // offline: the last fetch decides
  }
  try {
    git(cwd, ['merge-base', '--is-ancestor', commit, `origin/${branch}`], env);
    return true;
  }
  catch {
    return false;
  }
}


export interface BranchList {
  local: string[];
  /** Branches of origin, as "origin/<name>" */
  remote: string[];
  /** Local branches whose upstream was deleted on origin ([gone]) */
  gone: string[];
}


/** Fetches origin with --prune (no prompt, at most 30 s) and lists the branches; undefined without a repository */
export function list_branches(cwd: string, env?: NodeJS.ProcessEnv): BranchList | undefined {
  try {
    execFileSync('git', ['fetch', '--quiet', '--prune', 'origin'], { cwd, env: { ...(env ?? process.env), GIT_TERMINAL_PROMPT: '0' }, stdio: 'ignore', timeout: 30_000 });
  }
  catch {
    // offline: the state of the last fetch
  }
  const local = git_ok(cwd, ['for-each-ref', '--format=%(refname:short)\t%(upstream:track)', 'refs/heads'], env);
  if (local === undefined)
    return undefined;
  const remote = git_ok(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], env) ?? '';
  const rows = local.split(/\r?\n/).filter(line => line.length > 0).map(line => line.split('\t'));
  return {
    local: rows.map(([name]) => name),
    gone: rows.filter(([, track]) => (track ?? '').includes('gone')).map(([name]) => name),
    remote: remote.split(/\r?\n/).filter(name => name.length > 0 && name !== 'origin/HEAD' && name !== 'origin'),
  };
}


/** True if the branch (local, else origin/<branch>) is contained in origin/<main> */
export function is_merged_into(cwd: string, branch: string, main: string, local: boolean, env?: NodeJS.ProcessEnv): boolean {
  if (!is_valid_base_branch(branch) || !is_valid_base_branch(main))
    return false;
  try {
    git(cwd, ['merge-base', '--is-ancestor', local ? `refs/heads/${branch}` : `refs/remotes/origin/${branch}`, `refs/remotes/origin/${main}`], env);
    return true;
  }
  catch {
    return false;
  }
}
