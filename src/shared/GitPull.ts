// Updating a git checkout of the OBI backend with `git pull --ff-only` (local and on the IBM i).
// No vscode imports: unit-tested in plain Node.

import { sh_quote } from './ShellQuote';


export type PullResult =
  | { outcome: 'not-a-repository' }
  | { outcome: 'up-to-date'; head: string }
  | { outcome: 'updated'; from: string; to: string; requirements_changed: boolean };


/** Python packages of the OBI backend; its setup script installs them into the venv */
export const REQUIREMENTS_FILE = 'requirements.txt';

/**
 * Never creates a merge commit and never rebases: a checkout with own commits or conflicting changes fails instead.
 * --no-rebase: git before 2.34 (e.g. on the IBM i) rebases with pull.rebase = true in spite of --ff-only.
 */
export const PULL_ARGS = ['pull', '--ff-only', '--no-rebase'];

/** git never waits for input (there is no terminal) */
export const GIT_ENV: Record<string, string> = { GIT_TERMINAL_PROMPT: '0' };

const MARKER = 'OBI-PULL';
const NO_REPOSITORY = 'no-repository';
const COMMIT = /^[0-9a-f]{7,64}$/;


export function pull_result(from: string, to: string, changed_files: string[]): PullResult {
  if (from === to)
    return { outcome: 'up-to-date', head: to };
  return { outcome: 'updated', from, to, requirements_changed: changed_files.some(file => file.trim() === REQUIREMENTS_FILE) };
}


/**
 * Script that updates the checkout in `obi_dir` on the IBM i; parse_pull_output reads the result from its output.
 * `obi_dir` must be resolved (no ~ or variables), it is quoted. git is in /QOpenSys/pkgs/bin, also without .bashrc.
 */
export function remote_pull_script(obi_dir: string): string {
  return [
    `export PATH="/QOpenSys/pkgs/bin:$PATH" ${Object.entries(GIT_ENV).map(([key, value]) => `${key}=${value}`).join(' ')}`,
    `cd ${sh_quote(obi_dir)} || exit 1`,
    `if [ ! -e .git ]; then echo "${MARKER} ${NO_REPOSITORY}"; exit 0; fi`,
    'old=$(git rev-parse HEAD) || exit 1',
    `git ${PULL_ARGS.join(' ')} || exit 1`,
    'new=$(git rev-parse HEAD) || exit 1',
    `echo "${MARKER} $old $new"`,
    'if [ "$old" != "$new" ]; then git diff --name-only "$old" "$new"; fi',
  ].join('\n');
}


/** Result in the output lines (stdout) of remote_pull_script; undefined if there is none */
export function parse_pull_output(lines: string[]): PullResult | undefined {
  const index = lines.findIndex(line => line.startsWith(`${MARKER} `));
  if (index < 0)
    return undefined;

  const parts = lines[index].trim().split(/\s+/);
  if (parts.length === 2 && parts[1] === NO_REPOSITORY)
    return { outcome: 'not-a-repository' };
  if (parts.length !== 3 || !COMMIT.test(parts[1]) || !COMMIT.test(parts[2]))
    return undefined;
  return pull_result(parts[1], parts[2], lines.slice(index + 1));
}
