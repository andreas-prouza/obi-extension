import * as vscode from 'vscode';

import { BuildSummary } from '../../webview/show_changes/BuildSummary';
import { OBIController } from '../../webview/controller/OBIController';
import { OBITools } from '../utilities/OBITools';
import { Workspace } from '../utilities/Workspace';

import * as source from '../../shared/Source';
import { SSH_Tasks } from '../utilities/SSH_Tasks';
import { AppConfig } from '../config/AppConfig';
import * as path from 'path';
import { DirTool } from '../utilities/DirTool';
import { Constants } from '../../shared/Constants';
import { logger } from '../utilities/Logger';
import { SystemCmdExecution } from '../utilities/SystemCmdExecution';
import { Uri } from 'vscode';
import { BuildHistoryProvider } from '../../webview/build_history/BuildHistoryProvider';
import { sh_quote, assert_valid_source_path } from '../../shared/ShellQuote';
import { UserCancelledError, get_error_message } from '../../shared/Errors';
import { OperationLock } from '../utilities/OperationLock';
import { ask, show_error } from '../utilities/Notify';
import { BuildOutput } from '../utilities/BuildOutput';
import { OBI_PID_PREFIX, format_elapsed, truncate } from '../utilities/OutputLines';
import { CompileDiagnostics } from '../source/CompileDiagnostics';
import { StatusBar } from '../StatusBar';
import { require_trust } from '../utilities/Trust';
import { config_without_secrets } from '../../shared/Redact';
import * as fs from 'fs';
import { PhaseTimer, result_download_plan } from './ResultDownload';
import { ExtensionSettings } from '../utilities/ExtensionSettings';
import { BackendUpdate } from './BackendUpdate';



export class OBICommands {

  // Concurrency: user-facing entry points run inside OperationLock.run(...); the do_* functions don't lock.


  public static async run_build_process(sources?: string[], generate_compile_list?: boolean): Promise<string | undefined> {

    const ws = Workspace.get_workspace();
    const config = AppConfig.get_app_config();
    const remote_base_dir: string | undefined = config.general['remote-base-dir'];
    const remote_obi_dir: string | undefined = config.general['remote-obi-dir'];

    if (!remote_base_dir || !remote_obi_dir)
      throw Error(`Missing 'remote_base_dir' or 'remote_obi_dir'`);

    const remote_obi: string | undefined = await OBITools.get_remote_obi_python_path();
    if (!remote_obi)
      throw Error(vscode.l10n.t('OBI path is not correct'));

    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Run build'),
      cancellable: true
    },
      async (progress, progress_token): Promise<string | undefined> => {

        // The cancel button of the notification and of the OBI Build view cancel the same operation
        const cancel_subscription = progress_token.onCancellationRequested(() => OperationLock.cancel());
        const token = OperationLock.token;
        const check_cancelled = () => {
          if (token.isCancellationRequested)
            throw new UserCancelledError(vscode.l10n.t('Build cancelled'));
        };
        // Duration of each phase in the log, to see what takes the time
        let timer: PhaseTimer | undefined;

        try {

          progress.report({
            message: vscode.l10n.t('Get changed source list')
          });

          let source_list: string[] = sources || [];
          if (!sources)
            source_list = await OBITools.generate_source_change_lists();

          if (source_list.length == 0) {
            vscode.window.showWarningMessage(vscode.l10n.t('No changed sources to build'));
            return undefined;
          }

          // Ask before building
          const host = AppConfig.get_app_config().connection['remote-host'] ?? 'IBM i';
          const build = vscode.l10n.t('Build');
          const question = source_list.length === 1 ? vscode.l10n.t('Build 1 source on {0}?', host) : vscode.l10n.t('Build {0} sources on {1}?', source_list.length, host);
          if (ExtensionSettings.build_confirm_run() && await ask(question, [build]) !== build)
            return undefined;

          BuildOutput.start(`Run build · ${source_list.length} source${source_list.length > 1 ? 's' : ''} on ${host}`);
          timer = new PhaseTimer();
          const phases = timer;

          if (! await OBITools.check_remote_pase()) {
            vscode.window.showErrorMessage(vscode.l10n.t('Remote PASE is not configured correctly. Please check your configuration.'));
            return undefined;
          }

          progress.report({
            message: vscode.l10n.t('Check remote project folder')
          });

          let check: boolean = await OBITools.check_remote();

          if (!check) {
            return undefined;
          }
          check_cancelled();

          progress.report({
            message: vscode.l10n.t('Transfer {0} sources', source_list.length)
          });
          await phases.run('upload sources', () => SSH_Tasks.transferSources(source_list));
          check_cancelled();

          await phases.run('build list', () => generate_compile_list === false
            ? OBICommands.transfer_build_list(progress)
            : OBICommands.generate_build_script(progress, source_list, token));
          check_cancelled();

          progress.report({
            message: vscode.l10n.t('Run build on IBM i')
          });

          await phases.run('remote run', () => OBICommands.execute_remote_build(progress, token));

          progress.report({
            message: vscode.l10n.t('Get all outputs back to you')
          });

          const history = await phases.run('download results', () => OBICommands.get_remote_build_output());
          const duration = format_elapsed(phases.total_ms());
          BuildOutput.finished('succeeded', vscode.l10n.t('in {0} min', duration));
          vscode.window.showInformationMessage(vscode.l10n.t('Build finished in {0} min', duration));
          return history;

        }
        catch (e: unknown) {
          if (e instanceof UserCancelledError) {
            BuildOutput.finished('cancelled');
            StatusBar.show_cancelled();
          }
          else
            BuildOutput.finished('failed', get_error_message(e));
          throw e;
        }
        finally {
          cancel_subscription.dispose();
          if (timer)
            logger.info(`Build timings: ${timer.summary()}`);
        }
      });
  }



  /**
   * Remote command that runs the Python OBI with `action` in the remote project folder.
   * All paths are resolved locally and quoted, so the remote shell expands nothing.
   */
  private static async get_remote_obi_cmd(action: string, source?: string, report_pid: boolean = false): Promise<string> {
    const remote_base_dir = await SSH_Tasks.get_remote_base_dir();
    const remote_obi_dir = await SSH_Tasks.get_remote_obi_dir();

    // report_pid: the shell prints its pid and exec keeps it for Python, so a cancel can stop the build
    let cmd = `cd ${sh_quote(remote_base_dir)} || exit 1; rm log/* .obi/log/* 2> /dev/null || true; `
      + (report_pid ? `echo "${OBI_PID_PREFIX}$$"; exec ` : '')
      + `${sh_quote(`${remote_obi_dir}/${Constants.REMOTE_OBI_PYTHON_PATH}`)} -X utf8 ${sh_quote(`${remote_obi_dir}/main.py`)} -a ${action} -p .`;

    if (source) {
      assert_valid_source_path(source);
      cmd = `${cmd} --source=${sh_quote(source)}`;
    }
    return cmd;
  }



  /** Cancel button (OBI Build view, status bar menu): the running operation and all local OBI processes */
  public static cancel_running(): void {
    OperationLock.cancel();
    SystemCmdExecution.abort_all();
    OBITools.cancel_source_hashing();
  }



  /** Python of the local OBI (venv) */
  public static local_obi_python(): string {
    // local-obi-dir comes from the (committed) project configuration: a program from the workspace
    if (!require_trust(vscode.l10n.t('Running the local OBI')))
      throw new UserCancelledError('Workspace not trusted');
    const python = OBITools.get_local_obi_python_path();
    if (!python)
      throw new Error('Local OBI not found (local-obi-dir with venv)');
    return python;
  }


  /** Arguments for the local OBI's main.py. Passed without a shell; the source is still validated. */
  public static local_obi_args(config: AppConfig, action: string, source?: string, extra: string[] = []): string[] {
    const local_obi_dir = config.general['local-obi-dir'] ? DirTool.resolve_env_in_path(config.general['local-obi-dir']) : '';
    const args = ['-X', 'utf8', path.join(local_obi_dir, 'main.py'), '-a', action, '-p', '.'];
    if (source) {
      assert_valid_source_path(source);
      args.push(`--source=${source}`);
    }
    return [...args, ...extra];
  }



  public static async generate_build_script(progress: vscode.Progress<{
    message?: string;
    increment?: number;
  }>, source_list: string[], token?: vscode.CancellationToken) {

    const config = AppConfig.get_app_config();

    if (!OBITools.without_local_obi() && config.general['local-obi-dir']) {

      progress.report({
        message: vscode.l10n.t('Generate build script with the local OBI')
      });

      const args = OBICommands.local_obi_args(config, 'create', source_list.length == 1 ? source_list[0] : undefined);

      // A cancel (UserCancelledError) ends the build without an error message
      await SystemCmdExecution.run_system_cmd(Workspace.get_workspace(), OBICommands.local_obi_python(), args, 'generate_build_script', { token, on_line: line => BuildOutput.line(line) });

      await OBICommands.transfer_build_list(progress);
    }
    else {

      progress.report({
        message: vscode.l10n.t('Generate build script on the IBM i. If it takes too long, use OBI locally (see documentation).')
      });
      await BackendUpdate.update_remote_once(token);
      const ssh_cmd = await OBICommands.get_remote_obi_cmd('create', source_list.length == 1 ? source_list[0] : undefined, true);
      await SSH_Tasks.execute_streaming(ssh_cmd, { report_pid: true, token, on_line: line => BuildOutput.line(line) });

    }
  }



  public static async transfer_build_list(progress: vscode.Progress<{
    message?: string;
    increment?: number;
  }>) {

    const config = AppConfig.get_app_config();

    progress.report({
      message: vscode.l10n.t('Transfer build list to the IBM i')
    });
    await SSH_Tasks.transfer_files([config.general['compile-list']]);
    // The OBI needs the lists of changed and dependent objects, not the compile messages of earlier builds (.obi/tmp/evfevent)
    const tmp_dir = path.join(Workspace.get_workspace(), Constants.OBI_TMP_DIR);
    const tmp_files = DirTool.dir_exists(tmp_dir)
      ? fs.readdirSync(tmp_dir, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => `${Constants.OBI_TMP_DIR}/${entry.name}`)
      : [];
    await SSH_Tasks.upload_project_files(tmp_files);

  }





  /** Runs the build on the IBM i; output goes to "OBI Build", the progress shows the elapsed time and the latest line */
  public static async execute_remote_build(progress?: vscode.Progress<{ message?: string }>, token?: vscode.CancellationToken) {

    await BackendUpdate.update_remote_once(token);
    const ssh_cmd = await OBICommands.get_remote_obi_cmd('run', undefined, true);
    const started = Date.now();
    let last_report = 0;

    await SSH_Tasks.execute_streaming(ssh_cmd, {
      report_pid: true,
      token,
      on_line: line => {
        BuildOutput.line(line);
        const now = Date.now();
        if (progress && now - last_report >= 500 && line.trim().length > 0) {
          last_report = now;
          progress.report({ message: vscode.l10n.t('Run build on IBM i ({0}): {1}', format_elapsed(now - started), truncate(line.trim(), 80)) });
        }
      }
    });
  }



  /** Stores the build in the build history: compile list, config without secret* variables (bugs.md #1) and .obi/tmp */
  public static write_build_history(ws: string, compile_list: { timestamp?: string }, config: AppConfig): string {
    const timestamp: string = compile_list.timestamp || new Date().toISOString();

    // Windows compatibility for directory name
    const historyDirName = BuildHistoryProvider.date2escaped_date(timestamp);
    const historyDir = path.join(ws, Constants.BUILD_HISTORY_DIR, historyDirName);
    OBITools.write_compile_list(path.join(historyDir, 'compile-list.json'), compile_list);
    DirTool.write_json(path.join(historyDir, Constants.BUILD_HISTORY_CONFIG_FILE), config_without_secrets(config));
    DirTool.copy_dir(path.join(ws, Constants.OBI_TMP_DIR), historyDir);
    return historyDirName;
  }



  public static async get_remote_build_output(): Promise<string | undefined> {

    const config = AppConfig.get_app_config();
    const remote_base_dir: string | undefined = config.general['remote-base-dir'];
    const ws: string = Workspace.get_workspace();
    const ws_uri: Uri = Workspace.get_workspace_uri();

    // compile-list.json first and on its own: if it is missing, the local (old) one must not be used
    // for the build history and object-builds.json
    const compile_list_file: string = config.general['compile-list'];
    try {
      await SSH_Tasks.getRemoteFile(path.join(ws, compile_list_file), `${remote_base_dir}/${compile_list_file}`);
    }
    catch (e: unknown) {
      throw new Error(vscode.l10n.t('Build results could not be downloaded ({0}): {1}', compile_list_file, get_error_message(e)));
    }

    // Only the results of this build: earlier builds' outputs and compile messages collect on the IBM i
    const downloaded_compile_list = OBITools.get_compile_list(ws_uri) || {};
    const results = await SSH_Tasks.download_build_results(result_download_plan(downloaded_compile_list, config.general));
    logger.info(`Downloaded ${results.reduce((sum, result) => sum + result.transferred, 0)} result files`);

    const failed = results.flatMap(result => result.failed);
    if (failed.length > 0)
      vscode.window.showWarningMessage(vscode.l10n.t('Build finished, but {0} result file(s) could not be downloaded (joblogs or compile messages may be missing). See the OBI log.', failed.length));

    if (DirTool.file_exists(path.join(ws, config.general['compile-list']))) {

      const compile_list: any = OBITools.get_compile_list(ws_uri) || {};
      const historyDirName = OBICommands.write_build_history(ws, compile_list, config);
      // In the background: it may ask once before the first deletion
      BuildHistoryProvider.apply_retention(historyDirName).catch((e: unknown) => logger.warn(`Build history retention failed: ${e}`));

      const sources: source.SourceCompileList[] = OBITools.get_sources_info_from_compile_list();
      const source_hashes: source.ISource = OBITools.get_source_hash_list(Workspace.get_workspace()) || {};

      for (const source of sources) {
        if (source.status == 'success') {
          source_hashes[source.source] = source.hash;
        }
      }
      // If the file couldn't be parsed, source_hashes would only contain this build: don't overwrite it
      DirTool.update_json(path.join(ws, config.general['compiled-object-list']), source_hashes);

      // Compile messages of all built sources (and their copybooks) into the Problems view
      CompileDiagnostics.load_for_compile_list(compile_list, CompileDiagnostics.evfevent_root());
      StatusBar.build_finished(compile_list);

      return historyDirName;
    }

    return undefined;
  }



  public static get_current_active_source(): string | undefined {

    if (!vscode.window.activeTextEditor) {
      vscode.window.showWarningMessage(vscode.l10n.t('No active source'));
      return undefined;
    }

    const config = AppConfig.get_app_config();

    const file_name = vscode.window.activeTextEditor.document.fileName;
    const source = DirTool.to_obi_source(file_name);
    if (!source) {
      vscode.window.showWarningMessage(DirTool.not_in_source_dir_message(file_name));
      return undefined;
    }

    if (!config.general['supported-object-types'].includes(source.split('.').pop() ?? '')) {
      vscode.window.showWarningMessage(vscode.l10n.t('{0} is not a supported source type', source));
      return undefined;
    }

    if (!DirTool.file_exists(file_name)) {
      vscode.window.showWarningMessage(vscode.l10n.t('{0} does not exist in the source folder ({1})', source, DirTool.get_local_source_dir()));
      return undefined;
    }

    logger.info(`Source: ${source}`);

    return source
  }



  public static async run_single_build(context: vscode.ExtensionContext) {

    const source = OBICommands.get_current_active_source();

    if (!source)
      return OBIController.run_finished('run_build');

    OBICommands.run_build(context, source);
  }




  public static async run_build(context: vscode.ExtensionContext, source?: string) {

    await OperationLock.run('Run build', async () => {
      if (await OBICommands.do_show_changes(context, source))
        await OBICommands.do_rerun_build([], {});
    });

    OBIController.run_finished('run_build');
  }




  /** Build of the current build summary (button in the build summary). */
  public static async rerun_build(ignore_sources: string[], ignore_sources_cmd: Record<string, string[]>) {

    await OperationLock.run('Run build', () => OBICommands.do_rerun_build(ignore_sources, ignore_sources_cmd));
    OBIController.run_finished('run_build');
  }




  private static async do_rerun_build(ignore_sources: string[], ignore_sources_cmd: Record<string, string[]>) {

    try {

      OBITools.update_compile_list(ignore_sources, ignore_sources_cmd, BuildSummary.get_current_compile_list_name());

      const sources: string[] = OBITools.get_sources_2_build_from_compile_list(true);
      let history_dir_name: string | undefined;
      if (sources.length > 0) {
        history_dir_name = await OBICommands.run_build_process(sources, false);
      }
      else {
        vscode.window.showInformationMessage(vscode.l10n.t('No sources to build'));
      }

      await BuildSummary.show_current_results();
      if (history_dir_name) {
        await BuildHistoryProvider.reveal_build(history_dir_name);
      }
      OBIController.update_build_summary_timestamp();
    }
    catch (e: unknown) {
      show_error(vscode.l10n.t('Build failed'), e);
    }
  }



  public static async show_single_changes(context: vscode.ExtensionContext): Promise<boolean> {
    const source = OBICommands.get_current_active_source();

    if (!source) {
      OBIController.run_finished('show_changes');
      return false;
    }

    return await OBICommands.show_changes(context, source);
  }




  public static async show_changes(context: vscode.ExtensionContext, source?: string): Promise<boolean> {

    const is_success = await OperationLock.run('Show changes', () => OBICommands.do_show_changes(context, source));

    OBIController.run_finished('show_changes');
    OBIController.update_build_summary_timestamp();

    return is_success ?? false;
  }




  private static async do_show_changes(context: vscode.ExtensionContext, source?: string): Promise<boolean> {

    let is_success: boolean = false;
    OBITools.self_check();

    const config = AppConfig.get_app_config();

    if (config.attributes_missing()) {
      vscode.window.showErrorMessage(vscode.l10n.t('Missing config settings. Please check your configuration.'));
      vscode.commands.executeCommand('obi.controller.config');
      return false;
    }

    try {
      if (OBITools.without_local_obi() || !config.general['local-obi-dir'])
        await OBITools.generate_source_change_lists(source);
      else {
        logger.info(`WS: ${Workspace.get_workspace()}`);
        const args = OBICommands.local_obi_args(config, 'create', source);
        BuildOutput.start('Show changes (local OBI)');
        await SystemCmdExecution.run_system_cmd(Workspace.get_workspace(), OBICommands.local_obi_python(), args, 'show_changes', { token: OperationLock.token, on_line: line => BuildOutput.line(line) });

        // Python OBI doesn't know about git info; refresh the compile-list it just wrote.
        const created_compile_list = OBITools.get_compile_list(Workspace.get_workspace_uri());
        if (created_compile_list) {
          OBITools.write_compile_list(path.join(Workspace.get_workspace(), config.general['compile-list']), created_compile_list);
        }
      }

      BuildSummary.render(context.extensionUri, Workspace.get_workspace_uri());
      is_success = true;
    }
    catch (error: unknown) {
      show_error(vscode.l10n.t('Show changes failed'), error);
    }

    return is_success;
  }




  public static async reset_compiled_object_list() {
    await OperationLock.run('Reset compiled object list', () => OBICommands.do_reset_compiled_object_list());
  }



  private static async do_reset_compiled_object_list() {

    const config = AppConfig.get_app_config();

    try {
      if (!config.general['compiled-object-list'])
        throw Error(`Invalid config for config.general['compiled-object-list']: ${config.general['compiled-object-list']}`);

      const object_list_file: string = config.general['compiled-object-list'];
      // Without cache: the reset is the way out if a change wasn't detected
      const source_hashes = await OBITools.retrieve_current_source_hashes(false);
      DirTool.write_json(path.join(Workspace.get_workspace(), object_list_file), source_hashes);
      vscode.window.showInformationMessage(vscode.l10n.t('Object list created'));

      //await SSH_Tasks.transfer_files([object_list_file]);
      //vscode.window.showInformationMessage(`Object list transferred to IBM i`);
    }
    catch (e: unknown) {
      show_error(vscode.l10n.t('Resetting the compiled object list failed'), e);
    }
  }



  public static async get_remote_build_results() {
    await OperationLock.run('Get build results', () => OBICommands.do_get_remote_build_results());
  }



  private static async do_get_remote_build_results() {

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Run build'),
    },
      async progress => {
        
        progress.report({
          message: vscode.l10n.t('Get all outputs back to you')
        });
        await OBICommands.get_remote_build_output();

        progress.report({
          message: vscode.l10n.t('Update views')
        });

        BuildSummary.update();
        OBIController.update_build_summary_timestamp();
      });

    vscode.window.showInformationMessage(vscode.l10n.t('Build results retrieved'));
  }

}