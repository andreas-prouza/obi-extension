// Git repositories for the tests of the OBI backend update (no vscode imports: used by unit and integration tests)
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';


/** Environment for git in the tests: own identity, no system config, a global config of the test */
export function git_env(global_config: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'OBI test', GIT_AUTHOR_EMAIL: 'obi@test.invalid',
    GIT_COMMITTER_NAME: 'OBI test', GIT_COMMITTER_EMAIL: 'obi@test.invalid',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: global_config,
  };
}


export function has_git(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  }
  catch {
    return false;
  }
}


export interface BackendCheckout {
  root: string;
  /** "GitHub": where the checkout pulls from */
  upstream: string;
  /** The installed OBI backend */
  checkout: string;
  /** Global git config used by every git command of the test (also by the code under test, via git_env) */
  global_config: string;
  git(cwd: string, ...args: string[]): string;
  /** Commits the files in `cwd` (default: upstream) and returns the commit */
  commit(files: Record<string, string>, cwd?: string): string;
}


/** An upstream repository with one commit (main.py, requirements.txt) and a clone of it */
export function backend_checkout(global_config_text: string = ''): BackendCheckout {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obi-backend-'));
  const upstream = path.join(root, 'upstream');
  const checkout = path.join(root, 'obi');
  const global_config = path.join(root, 'gitconfig');
  fs.writeFileSync(global_config, global_config_text);
  fs.mkdirSync(upstream);

  const env = git_env(global_config);
  const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
  const commit = (files: Record<string, string>, cwd: string = upstream): string => {
    for (const [file, content] of Object.entries(files))
      fs.writeFileSync(path.join(cwd, file), content);
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '-m', `change ${Object.keys(files).join(', ')}`);
    return git(cwd, 'rev-parse', 'HEAD');
  };

  git(upstream, 'init', '-q', '-b', 'main');
  commit({ 'main.py': 'print("obi")\n', 'requirements.txt': 'smol-toml\n' });
  git(root, 'clone', '-q', upstream, checkout);

  return { root, upstream, checkout, global_config, git, commit };
}
