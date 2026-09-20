import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { logger } from './Logger';


export interface GitInfoResult {
  branch?: string;
  commit?: string;
}


export class GitInfo {

  /**
   * Resolves current branch/commit for a workspace, or undefined if it's not a git project.
   * Tries a direct .git/HEAD read first, falls back to the `git` binary (no shell interpolation).
   */
  public static get_git_info(workspaceRoot: string): GitInfoResult | undefined {

    const gitPath = path.join(workspaceRoot, '.git');
    if (!fs.existsSync(gitPath)) {
      return undefined;
    }

    const direct = GitInfo.read_from_dot_git(workspaceRoot);
    if (direct) {
      return direct;
    }

    return GitInfo.read_from_git_binary(workspaceRoot);
  }


  private static read_from_dot_git(workspaceRoot: string): GitInfoResult | undefined {

    try {
      const headPath = path.join(workspaceRoot, '.git', 'HEAD');
      if (!fs.statSync(headPath).isFile()) {
        // Worktrees/submodules use a `.git` file with a `gitdir: ...` pointer - not handled here.
        return undefined;
      }

      const head = fs.readFileSync(headPath, 'utf8').trim();
      const refMatch = head.match(/^ref:\s*(refs\/heads\/(.+))$/);

      if (!refMatch) {
        // Detached HEAD: HEAD contains the commit hash directly.
        return /^[0-9a-f]{7,64}$/i.test(head) ? { commit: head } : undefined;
      }

      const [, refPath, branch] = refMatch;
      const commit = GitInfo.resolve_ref_commit(workspaceRoot, refPath);
      return commit ? { branch, commit } : { branch };
    }
    catch (e) {
      logger.debug(`GitInfo: direct .git read failed: ${e}`);
      return undefined;
    }
  }


  private static resolve_ref_commit(workspaceRoot: string, refPath: string): string | undefined {

    const loosePath = path.join(workspaceRoot, '.git', refPath);
    if (fs.existsSync(loosePath)) {
      return fs.readFileSync(loosePath, 'utf8').trim();
    }

    const packedRefsPath = path.join(workspaceRoot, '.git', 'packed-refs');
    if (!fs.existsSync(packedRefsPath)) {
      return undefined;
    }

    const line = fs.readFileSync(packedRefsPath, 'utf8')
      .split('\n')
      .find(l => l.endsWith(` ${refPath}`));

    return line ? line.split(' ')[0] : undefined;
  }


  private static read_from_git_binary(workspaceRoot: string): GitInfoResult | undefined {

    try {
      const branchOutput = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
      const commitOutput = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();

      const result: GitInfoResult = {};
      if (branchOutput && branchOutput !== 'HEAD') {
        result.branch = branchOutput;
      }
      if (commitOutput) {
        result.commit = commitOutput;
      }
      return (result.branch || result.commit) ? result : undefined;
    }
    catch (e) {
      logger.debug(`GitInfo: git binary fallback failed: ${e}`);
      return undefined;
    }
  }


  /** Adds/refreshes the `git` key on a compile-list object, or removes it if not a git project. */
  public static attach_git_info(compileList: Record<string, unknown>, workspaceRoot: string): void {

    const info = GitInfo.get_git_info(workspaceRoot);
    if (!info) {
      delete compileList.git;
      return;
    }

    const git: GitInfoResult = {};
    if (info.branch) {
      git.branch = info.branch;
    }
    if (info.commit) {
      git.commit = info.commit;
    }
    compileList.git = git;
  }
}
