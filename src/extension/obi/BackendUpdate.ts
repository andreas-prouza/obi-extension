import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from '../config/AppConfig';
import { BuildOutput } from '../utilities/BuildOutput';
import { ExtensionSettings } from '../utilities/ExtensionSettings';
import { logger } from '../utilities/Logger';
import { show_error } from '../utilities/Notify';
import { OperationLock } from '../utilities/OperationLock';
import { SSH_Tasks } from '../utilities/SSH_Tasks';
import { CancelToken, SystemCmdExecution } from '../utilities/SystemCmdExecution';
import { require_trust } from '../utilities/Trust';
import { UserCancelledError } from '../../shared/Errors';
import { GIT_ENV, PULL_ARGS, PullResult, parse_pull_output, pull_result, remote_pull_script } from '../../shared/GitPull';


/**
 * Keeps the OBI backend (a git checkout) up to date with `git pull --ff-only`:
 * * local (`local-obi-dir`): once when VS Code starts, with the setting obi.backend.autoUpdateLocal;
 * * on the IBM i (`remote-obi-dir`): once per session and system, before the backend runs there for the first time,
 *   with the setting obi.backend.autoUpdateRemote;
 * * both with the Update button that is shown after a run of an older backend.
 *
 * The local folder is passed in by the callers (OBITools.get_local_obi_dir), so this module doesn't import OBITools.
 */
export class BackendUpdate {

  private static local_started = false;
  /** user@host:port:dir of the IBM i systems updated in this session, also if it failed (shown once) */
  private static readonly remote_done = new Set<string>();


  /** Once per session, when the project starts */
  public static async update_local_on_start(dir: string | undefined): Promise<void> {
    if (BackendUpdate.local_started || !ExtensionSettings.backend_auto_update_local())
      return;
    BackendUpdate.local_started = true;

    if (!dir) {
      logger.info('obi.backend.autoUpdateLocal is on, but no local-obi-dir is configured');
      return;
    }
    if (!require_trust(vscode.l10n.t('Updating the OBI backend')))
      return;

    try {
      await OperationLock.run(vscode.l10n.t('Updating the OBI backend'), token => BackendUpdate.update_local(dir, token, false));
    }
    catch (e: unknown) {
      if (!(e instanceof UserCancelledError))
        throw e;
      logger.info('Update of the local OBI backend cancelled');
    }
  }


  /**
   * Before a remote OBI command: updates the backend on this IBM i, once per session.
   * A failed update is shown and the build goes on; a cancel stops the build.
   */
  public static async update_remote_once(token?: vscode.CancellationToken): Promise<void> {
    if (ExtensionSettings.backend_auto_update_remote())
      await BackendUpdate.update_remote(token, false);
  }


  /** Update button: the local backend (if configured) and the one on the IBM i, with a message for every result */
  public static async update_now(local_dir: string | undefined): Promise<void> {
    if (!require_trust(vscode.l10n.t('Updating the OBI backend')))
      return;

    try {
      await OperationLock.run(vscode.l10n.t('Updating the OBI backend'), async token => {
        if (local_dir)
          await BackendUpdate.update_local(local_dir, token, true);
        await BackendUpdate.update_remote(token, true);
      });
    }
    catch (e: unknown) {
      if (!(e instanceof UserCancelledError))
        throw e;
      vscode.window.showInformationMessage(vscode.l10n.t('Update of the OBI backend was cancelled.'));
    }
  }


  /** git pull in the local checkout `dir`. Throws SystemCmdError if git fails (no network, own commits, …). */
  public static async pull_local(dir: string, token?: CancelToken): Promise<PullResult> {
    if (!fs.existsSync(path.join(dir, '.git')))
      return { outcome: 'not-a-repository' };

    const git = async (args: string[]): Promise<string[]> => {
      const stdout: string[] = [];
      await SystemCmdExecution.run_system_cmd(dir, 'git', args, 'update_obi', {
        token,
        env: GIT_ENV,
        on_line: (line, stream) => { if (stream === 'stdout') stdout.push(line); }
      });
      return stdout;
    };
    const head = async (): Promise<string> => (await git(['rev-parse', 'HEAD']))[0]?.trim() ?? '';

    const from = await head();
    await git(PULL_ARGS);
    const to = await head();
    return pull_result(from, to, from === to ? [] : await git(['diff', '--name-only', from, to]));
  }


  private static async update_local(dir: string, token: CancelToken, interactive: boolean): Promise<void> {
    try {
      BackendUpdate.report(await BackendUpdate.pull_local(dir, token), dir, interactive);
    }
    catch (e: unknown) {
      if (e instanceof UserCancelledError)
        throw e;
      show_error(vscode.l10n.t('Updating the OBI backend in {0} failed', dir), e);
    }
  }


  /** `interactive`: also if it was already updated in this session, and a message if it is up to date */
  private static async update_remote(token: vscode.CancellationToken | undefined, interactive: boolean): Promise<void> {
    const config = AppConfig.get_app_config();
    let where = config.connection['remote-host'] ?? 'IBM i';

    try {
      const dir = await SSH_Tasks.get_remote_obi_dir();
      const key = `${await SSH_Tasks.get_ssh_user()}@${where}:${config.connection['ssh-port'] ?? ''}:${dir}`;
      where = `${where}:${dir}`;
      if (!interactive && BackendUpdate.remote_done.has(key))
        return;
      BackendUpdate.remote_done.add(key);

      BuildOutput.line(`Updating the OBI backend in ${where}`);
      const stdout: string[] = [];
      await SSH_Tasks.execute_streaming(remote_pull_script(dir), {
        token,
        on_line: (line, stream) => {
          BuildOutput.line(line);
          if (stream === 'stdout')
            stdout.push(line);
        }
      });

      const result = parse_pull_output(stdout);
      if (!result)
        throw new Error(`Unexpected output: ${stdout.join(' ').slice(0, 300)}`);
      BackendUpdate.report(result, where, interactive);
    }
    catch (e: unknown) {
      if (e instanceof UserCancelledError)
        throw e;
      show_error(vscode.l10n.t('Updating the OBI backend in {0} failed', where), e);
    }
  }


  private static report(result: PullResult, where: string, interactive: boolean): void {
    switch (result.outcome) {
      case 'not-a-repository':
        logger.warn(`OBI backend in ${where} is not a git repository`);
        vscode.window.showWarningMessage(vscode.l10n.t('The OBI backend in {0} was not updated: it is not a git repository.', where));
        return;

      case 'up-to-date':
        logger.info(`OBI backend in ${where} is up to date (${result.head})`);
        if (interactive)
          vscode.window.showInformationMessage(vscode.l10n.t('The OBI backend in {0} is up to date.', where));
        return;

      case 'updated':
        logger.info(`OBI backend in ${where} updated: ${result.from} → ${result.to}`);
        if (result.requirements_changed)
          vscode.window.showWarningMessage(vscode.l10n.t('The OBI backend in {0} was updated and needs new Python packages (requirements.txt changed). Run its setup script again.', where));
        else
          vscode.window.showInformationMessage(vscode.l10n.t('The OBI backend in {0} was updated.', where));
    }
  }
}
