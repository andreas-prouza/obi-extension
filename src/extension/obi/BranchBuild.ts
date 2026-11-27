import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BranchBuildConfig } from '../config/BranchBuildConfig';
import { AppConfig } from '../config/AppConfig';
import { GitInfo } from '../utilities/GitInfo';
import { OBITools } from '../utilities/OBITools';
import { SSH_Tasks } from '../utilities/SSH_Tasks';
import { Workspace } from '../utilities/Workspace';
import { DirTool } from '../utilities/DirTool';
import { logger } from '../utilities/Logger';
import { commit_on_remote_branch, has_uncommitted_changes } from '../utilities/GitChanges';
import { BRANCH_BUILD_BACKEND_VERSION, GuardReason, backend_version_of, branch_args, branch_mismatch, build_context_of, deployment_guard } from '../../shared/BranchBuild';
import { remote_backend_constants } from '../../shared/ConnectionCheck';
import { UserCancelledError, get_error_message } from '../../shared/Errors';
import { BackendUpdate } from './BackendUpdate';
import { sh_quote } from '../../shared/ShellQuote';


/** A build that branch build doesn't allow; `new_build_list`: offer to create a new build list */
export class BranchBuildRefusal extends Error {
  constructor(message: string, public readonly new_build_list: boolean = false) {
    super(message);
    this.name = 'BranchBuildRefusal';
  }
}


/**
 * Branch build in the build commands (spec docs/features/obi-extension-branch-build-spec.md, 4.1).
 * Everything here does nothing while the feature is off.
 */
export class BranchBuild {

  public static is_active(): boolean {
    return BranchBuildConfig.is_active();
  }


  /** Current git branch (from .git); undefined on a detached HEAD or without git */
  public static current_branch(): string | undefined {
    return GitInfo.get_git_info(Workspace.get_workspace())?.branch;
  }


  /** OBI_BACKEND_VERSION of the local OBI; undefined if it can't be read */
  public static local_backend_version(): number | undefined {
    const dir = OBITools.get_local_obi_dir();
    if (!dir)
      return undefined;
    try {
      return backend_version_of(fs.readFileSync(path.join(dir, 'module', 'obi_constants.py'), 'utf8'));
    }
    catch {
      return undefined;
    }
  }


  /** OBI_BACKEND_VERSION of the OBI on IBM i (read-only, as Test connection); undefined if it can't be read */
  public static async remote_backend_version(): Promise<number | undefined> {
    const result = await SSH_Tasks.run_command(`cat -- ${sh_quote(remote_backend_constants(await SSH_Tasks.get_remote_obi_dir()))}`);
    return result.code === 0 ? backend_version_of(result.stdout) : undefined;
  }


  /**
   * B3, B4: before create and add_source. Branch builds need the local OBI (it sees .git and evaluates the ticket
   * pattern), in version 6 or newer; an older one ignores [branch-build] and would build into the main libraries.
   */
  public static check_local_backend(): void {
    if (!BranchBuild.is_active())
      return;
    if (OBITools.without_local_obi() || !AppConfig.get_app_config().general['local-obi-dir'])
      throw new BranchBuildRefusal(vscode.l10n.t('Branch builds need the local OBI (local-obi-dir). Without it, the build would go into the main libraries.'));
    const version = BranchBuild.local_backend_version();
    if (version !== undefined && version < BRANCH_BUILD_BACKEND_VERSION)
      throw new BranchBuildRefusal(BranchBuild.local_too_old_text());
  }


  public static local_too_old_text(): string {
    return vscode.l10n.t('The local OBI is too old for branch builds. Update it in {0} (e.g. git pull).', OBITools.get_local_obi_dir() ?? '');
  }


  /** B1: arguments for create and add_source (none while the feature is off) */
  public static args(): string[] {
    return BranchBuild.is_active() ? branch_args(BranchBuild.current_branch()) : [];
  }


  /**
   * B7, B5: before an existing build list is run. It must have been created with branch build (while the feature is
   * on) and on the current branch; a branch build needs the OBI on IBM i in version 6 or newer.
   */
  public static async check_run(compile_list: unknown, token?: vscode.CancellationToken): Promise<void> {
    const context = build_context_of(compile_list);
    if (!BranchBuild.is_active() && !context)
      return;
    if (!context)
      throw new BranchBuildRefusal(vscode.l10n.t('The build list was created without branch build. Create a new build list.'), true);

    const created_on = branch_mismatch(context, BranchBuild.current_branch());
    if (created_on !== undefined)
      throw new BranchBuildRefusal(vscode.l10n.t('The build list was created on branch {0}. Running it would build into the libraries of that branch. Create a new build list.', created_on), true);

    if (context.mode === 'branch')
      await BranchBuild.ensure_remote_backend(token);
  }


  /**
   * B5: the OBI on IBM i creates the branch libraries, so it needs version 6. An older one is updated (git pull, also
   * without obi.backend.autoUpdateRemote); if the update fails (e.g. no connection to its git remote) or doesn't
   * bring version 6, this throws a BranchBuildRefusal.
   */
  public static async ensure_remote_backend(token?: vscode.CancellationToken): Promise<void> {
    const found = await BranchBuild.remote_backend_version();
    logger.info(`Branch build: OBI on IBM i has version ${found ?? 'unknown'}`);
    if (found !== undefined && found >= BRANCH_BUILD_BACKEND_VERSION)
      return;

    const dir = await SSH_Tasks.get_remote_obi_dir();
    const version_text = (version: number | undefined): string => version === undefined ? '?' : String(version);
    try {
      await BackendUpdate.update_remote_strict(token);
    }
    catch (e: unknown) {
      if (e instanceof UserCancelledError)
        throw e;
      throw new BranchBuildRefusal(vscode.l10n.t('The OBI on IBM i ({0}) is too old for branch builds (version {1}, needed: {2}) and could not be updated: {3}', dir, version_text(found), String(BRANCH_BUILD_BACKEND_VERSION), get_error_message(e)));
    }

    const updated = await BranchBuild.remote_backend_version();
    logger.info(`Branch build: OBI on IBM i has version ${updated ?? 'unknown'} after the update`);
    if (updated === undefined || updated < BRANCH_BUILD_BACKEND_VERSION)
      throw new BranchBuildRefusal(vscode.l10n.t('Update the OBI on IBM i ({0}) for branch builds: it has to create the branch libraries. Version found: {1}, needed: {2}.', dir, version_text(updated), String(BRANCH_BUILD_BACKEND_VERSION)));
  }


  /** D4: uncommitted changes in the source folder, recorded in `git.dirty` when a list is created (feature on only) */
  public static source_dir_dirty(): boolean | undefined {
    const source_dir = DirTool.get_local_source_dir();
    return has_uncommitted_changes(source_dir);
  }


  /**
   * Deployment guard (spec 4.4): why this compile list must not be deployed, as one message; undefined if it may.
   * `main_branch`: [i-releaser] main-branch of deployment.toml (rule D1, also with branch build off).
   */
  public static deployment_refusal(compile_list: Record<string, unknown>, main_branch: string): string | undefined {
    const feature_active = BranchBuild.is_active();
    main_branch = main_branch.trim();
    if (main_branch === '' && !feature_active)
      return undefined;

    const git = typeof compile_list['git'] === 'object' && compile_list['git'] !== null ? compile_list['git'] as { branch?: string; commit?: string; dirty?: boolean } : undefined;
    const context = build_context_of(compile_list);
    const commit_on_main = main_branch !== '' && git?.commit && git.branch === main_branch
      ? commit_on_remote_branch(Workspace.get_workspace(), git.commit, main_branch)
      : undefined;
    const reasons = deployment_guard({ main_branch, feature_active, git, context, is_package: !!compile_list['package'], commit_on_main });
    if (reasons.length === 0)
      return undefined;

    logger.info(`Deployment guard: ${JSON.stringify(reasons)}`);
    const head = main_branch !== ''
      ? vscode.l10n.t('Deployment only from package builds on {0}, after the merge.', main_branch)
      : vscode.l10n.t('Deployment only from package builds into the main libraries.');
    return [head, ...reasons.map(reason => BranchBuild.reason_text(reason, main_branch, !!context))].join(' ');
  }


  private static reason_text(reason: GuardReason, main_branch: string, has_context: boolean): string {
    switch (reason.kind) {
      case 'no-git': return vscode.l10n.t('The build list has no git information.');
      case 'branch': return vscode.l10n.t('Branch: {0}.', reason.value ?? '');
      case 'commit': return vscode.l10n.t('Commit {0} is not on origin/{1} yet: push or merge it first.', (reason.value ?? '').slice(0, 8), main_branch);
      case 'mode': return has_context ? vscode.l10n.t('It is a branch build ({0}).', reason.value ?? '') : vscode.l10n.t('The build list was created without branch build.');
      case 'package': return vscode.l10n.t('It is not a build package build.');
      case 'dirty': return vscode.l10n.t('The source folder had uncommitted changes when the build list was created.');
    }
  }
}
