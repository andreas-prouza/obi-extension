import * as vscode from 'vscode';
import * as path from 'path';
//import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../extension/utilities/getUri";
import { DirTool } from '../../extension/utilities/DirTool';
import { BUILD_SUMMARY_REQUESTS } from '../../shared/messages/BuildSummaryMessages';
import { inside, is_plain_object, parse_message } from '../../shared/messages/MessageGuard';
import { Constants } from '../../shared/Constants';
import { OBITools } from '../../extension/utilities/OBITools';
import { AppConfig } from '../../extension/config/AppConfig';
import { Workspace } from '../../extension/utilities/Workspace';
import { logger } from '../../extension/utilities/Logger';
import { OBICommands } from '../../extension/obi/OBICommands';
import { LogOutputProvider } from './LogOutputProvider';
import { CompileDiagnostics } from '../../extension/source/CompileDiagnostics';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';
import { pick_sources } from '../tools/SourcePick';
import { DependencyList } from '../../extension/obi/Dependency';
import { mergeSourcesIntoCompileList, resetDependentStatuses } from '../../extension/obi/compile_list/modules/add_sources';
import { create_dependency_graph } from '../../extension/obi/compile_list/modules/dependency';
import { dependents_only_needed_by } from '../../extension/obi/compile_list/modules/ignore_sources';
import { SystemCmdExecution } from '../../extension/utilities/SystemCmdExecution';
import { OperationLock } from '../../extension/utilities/OperationLock';
import { render_template } from '../Templates';
import { DeploymentConfig } from '../deployment/DeploymentConfig';
import { CUSTOM_DATA_KEY, DeploymentRecord, IReleaserError, deployment_data, is_object, deployment_of, get_workflows, show_details_url, start_workflow, workflow_choices } from '../../shared/IReleaser';
import { StageActions, StatusKind, deployment_overview, is_waiting, status_kind } from '../../shared/IReleaserDeployments';
import { annotate_build_list } from '../../shared/BuildListView';
import { DeploymentWatcher } from '../deployment/DeploymentWatcher';
import { history_dir_name } from '../../shared/HistoryTimestamp';
import { UserCancelledError } from '../../shared/Errors';
import { require_trust } from '../../extension/utilities/Trust';
import { show_error } from '../../extension/utilities/Notify';
import { BranchBuild, BranchBuildRefusal } from '../../extension/obi/BranchBuild';
import { branch_mismatch, build_context_of, is_unknown_branch_argument } from '../../shared/BranchBuild';



export class BuildSummary {

  public static currentPanel: BuildSummary | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private static _extensionUri: vscode.Uri;
  private static _current_compile_output_folder: string | undefined;
  /** i-Releaser deployment of the displayed build list, followed by DeploymentWatcher */
  private static _shown_deployment: { base: string; id: string } | undefined;
  /** The page shows the deployment card (rendered with the last full page) */
  private static _card_shown = false;
  /** Log and run of a stage: the i-Releaser view (extension.ts) */
  private static stage_actions: StageActions | undefined;


  public static set_stage_actions(actions: StageActions | undefined): void {
    BuildSummary.stage_actions = actions;
  }


  /**
   * The ComponentGalleryPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    BuildSummary.currentPanel = this;

    // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
    // the panel or when the panel is closed programmatically)
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // New status of the displayed deployment: only its card is rendered again
    DeploymentWatcher.on_changed(changed => {
      const shown = BuildSummary._shown_deployment;
      if (shown && shown.base === changed.base && shown.id === changed.id)
        BuildSummary.update_deployment();
    }, null, this._disposables);
  }


  /** Lets DeploymentWatcher follow the deployment of the displayed build list (and no other for the summary) */
  private static follow_deployment(compile_list: unknown): void {
    const base = DeploymentConfig.i_releaser_url();
    const deployment = base ? deployment_of(compile_list) : undefined;
    BuildSummary._shown_deployment = base && deployment ? { base: base, id: String(deployment.id) } : undefined;
    DeploymentWatcher.show(BuildSummary._shown_deployment);
  }


  /**
   * Renders the current webview panel if it exists otherwise a new webview panel
   * will be created and displayed.
   *
   * @param extensionUri The URI of the directory containing the extension.
   */
  public static render(extensionUri: vscode.Uri, workspaceUri: vscode.Uri|undefined, summary_file_path?: string) {

    logger.info('Render BuildSummary');
    BuildSummary._extensionUri = extensionUri;
    BuildSummary._current_compile_output_folder = summary_file_path;
    // The Problems view shows the messages of the displayed build (current or from the history)
    CompileDiagnostics.load_for_compile_list(BuildSummary.get_compile_list(), CompileDiagnostics.evfevent_root(summary_file_path));

    if (!workspaceUri){
      vscode.window.showErrorMessage(vscode.l10n.t('No workspace is opened!'));
      return
    }

    // An open panel is reused: it stays in its editor group, and the page keeps its scroll position and open sections
    BuildSummary.follow_deployment(BuildSummary.get_compile_list());
    if (BuildSummary.currentPanel) {
      const existing = BuildSummary.currentPanel._panel;
      existing.webview.html = BuildSummary.generate_html(extensionUri, existing.webview);
      existing.reveal(undefined, false);
      return;
    }

    const panel = BuildSummary.createNewPanel(extensionUri);

    panel.webview.html = BuildSummary.generate_html(extensionUri, panel.webview);
    //panel.webview.html = index_html.html;

    panel.webview.onDidReceiveMessage((raw: unknown) => BuildSummary.on_message(raw));

    BuildSummary.currentPanel = new BuildSummary(panel, extensionUri);
  }



  /** Handles a message of the page. Messages that don't match BUILD_SUMMARY_REQUESTS are ignored. */
  public static on_message(raw: unknown): void {

    const message = parse_message('Build summary', raw, BUILD_SUMMARY_REQUESTS, text => logger.warn(text));
    if (!message)
      return;

    switch (message.command) {
      case "show_log":
        LogOutputProvider.showOutput(message.type, Number(message.level), message.source, message.cmd_index);
        return;

      case "run_build":
        OBICommands.rerun_build(message.ignore_sources, message.ignore_sources_cmd);
        return;

      case "ignore_source":
        BuildSummary.ignore_source(message.source, message.ignore);
        return;

      case "ignore_cmd":
        BuildSummary.ignore_cmd(message.level, message.source, message.cmd_index, message.ignore);
        return;

      case "open_file": {
        const file_path = inside(DirTool.get_local_source_dir(), message.source);
        if (!file_path) {
          logger.warn(`Build summary: ${message.source} is not inside the source folder`);
          return;
        }
        const root = CompileDiagnostics.evfevent_root(BuildSummary._current_compile_output_folder);
        if (root)
          CompileDiagnostics.load_source(message.source, root);
        vscode.workspace.openTextDocument(vscode.Uri.file(file_path)).then(doc => vscode.window.showTextDocument(doc));
        return;
      }

      case "save_custom_data": {
        const compile_list = BuildSummary.get_compile_list();
        if (!compile_list)
          return;
        if (!is_plain_object(compile_list['custom_data']))
          compile_list['custom_data'] = {};
        compile_list['custom_data'][message.type] = message.data;

        OBITools.write_compile_list(path.join(Workspace.get_workspace(), BuildSummary.get_current_compile_list_name()), compile_list);
        return;
      }

      case "add_source":
        BuildSummary.add_sources();
        return;

      case "add_to_build_package":
        // The displayed list (current build or a build of the history), not a path from the page
        vscode.commands.executeCommand('obi.build-package.add-build-sources', BuildSummary.get_current_compile_list_name());
        return;

      case "edit_cmd":
        BuildSummary.edit_cmd(message.level, message.source, message.cmd_index);
        return;

      case "start_deployment":
        BuildSummary.start_deployment();
        return;

      case "deployment_action":
        BuildSummary.deployment_action(message.action, message.stage_id);
        return;
    }
  }



  /**
   * Shows the log of the failed step, or runs a stage, of the deployment the summary shows. The page only names the stage:
   * deployment, state and what may be run come from DeploymentWatcher and deployment.toml, as in the i-Releaser view.
   */
  public static async deployment_action(action: 'show_log' | 'continue' | 'run_all', stage_id: string): Promise<void> {
    const shown = BuildSummary._shown_deployment;
    const state = shown ? DeploymentWatcher.info(shown.base, shown.id)?.state : undefined;
    const stage = state?.stages.find(item => String(item.id) === stage_id);
    if (!shown || !state || !stage) {
      logger.warn(`Build summary: ${action} for stage ${stage_id}, which the shown deployment doesn't have`);
      return;
    }
    // The view sends to the URL of deployment.toml: only for a deployment of that URL
    const view = BuildSummary.stage_actions;
    if (!view || shown.base !== DeploymentConfig.i_releaser_url()) {
      logger.warn(`Build summary: no i-Releaser view for ${shown.base}`);
      return;
    }
    if (action === 'show_log')
      await view.show_summary_log(state.id, stage);
    else
      await view.run_summary_stage({ id: state.id, workflow: state.workflow, version: state.deploy_version, status: state.status }, stage, action);
  }



  /**
   * Starts an i-Releaser workflow with the displayed build list (without joblogs) and stores the deployment
   * in it (custom_data['i-releaser']). URL from deployment.toml, token from the secret storage.
   */
  public static async start_deployment(): Promise<void> {
    logger.info('Start i-Releaser workflow: clicked');
    // The URL comes from the workspace, and the token is sent there
    if (!require_trust(vscode.l10n.t('Starting an i-Releaser workflow')))
      return;
    await OperationLock.run('Start i-Releaser workflow', token => BuildSummary.do_start_deployment(token));
  }



  private static async do_start_deployment(lock_token: vscode.CancellationToken): Promise<void> {

    const configure = vscode.l10n.t('Open deployment config');
    const open_config = (choice: string | undefined) => {
      if (choice === configure && OBITools.ext_context)
        DeploymentConfig.render(OBITools.ext_context);
    };
    // Every stop also goes to the log: a notification is easily missed
    const report = (level: 'error' | 'warning', text: string, actions: string[] = []) => {
      logger.warn(`Start i-Releaser workflow: ${text}`);
      (level === 'error' ? vscode.window.showErrorMessage(text, ...actions) : vscode.window.showWarningMessage(text, ...actions)).then(open_config);
    };

    const base = DeploymentConfig.i_releaser_url();
    logger.info(`Start i-Releaser workflow: ${base ?? 'no URL'}`);
    if (!base) {
      report('error', vscode.l10n.t('No i-Releaser URL in {0}.', Constants.DEPLOYMENT_CONFIG_FILE), [configure]);
      return;
    }
    const auth_token = await DeploymentConfig.get_auth_token(base);
    if (!auth_token) {
      report('error', vscode.l10n.t('No i-Releaser token is stored for {0}.', base), [configure]);
      return;
    }

    const compile_list_file = path.join(Workspace.get_workspace(), BuildSummary.get_current_compile_list_name());
    const compile_list = BuildSummary.get_compile_list();
    if (!compile_list) {
      report('error', vscode.l10n.t('No build summary found. Run "Preview build" first.'));
      return;
    }

    // Deployment guard (spec 4.4): before anything is sent to i-releaser
    const refusal = BranchBuild.deployment_refusal(compile_list, DeploymentConfig.get_deployment_config()['i-releaser']['main-branch'] ?? '');
    if (refusal) {
      report('error', refusal);
      return;
    }

    try {
      const workflows = await BuildSummary.with_progress(vscode.l10n.t('Loading the workflows of i-Releaser…'), lock_token,
        signal => get_workflows(base, auth_token, signal));
      logger.info(`Start i-Releaser workflow: i-Releaser has ${JSON.stringify(workflows)}`);
      if (workflows.length === 0) {
        report('warning', vscode.l10n.t('i-Releaser has no workflows for this token.'));
        return;
      }

      // The default workflow first; the pick also confirms the start
      const ir_config = DeploymentConfig.get_deployment_config()['i-releaser'];
      const { choices, unknown } = workflow_choices(workflows, ir_config.workflows, ir_config['default-workflow']);
      if (unknown.length > 0)
        report('warning', vscode.l10n.t("i-Releaser doesn't know these workflows of {0}: {1}", Constants.DEPLOYMENT_CONFIG_FILE, unknown.join(', ')), [configure]);
      if (choices.length === 0)
        return;
      const default_workflow = ir_config['default-workflow']?.trim();
      const items: vscode.QuickPickItem[] = choices
        .map(name => ({ label: name, description: name === default_workflow ? vscode.l10n.t('Default workflow') : undefined }));
      const picked = await vscode.window.showQuickPick(items, {
        title: vscode.l10n.t('Start i-Releaser workflow ({0})', base),
        placeHolder: vscode.l10n.t('Workflow for this build list'),
        ignoreFocusOut: true
      });
      if (!picked)
        return;

      const record = await BuildSummary.with_progress(vscode.l10n.t('Starting i-Releaser workflow {0}…', picked.label), lock_token,
        signal => start_workflow(base, auth_token, picked.label, deployment_data(compile_list), signal));

      BuildSummary.store_deployment(compile_list_file, compile_list, record);
      DeploymentWatcher.watch(base, record.id, 'started');
      await BuildSummary.update();

      const open = vscode.l10n.t('Open');
      vscode.window.showInformationMessage(vscode.l10n.t('i-Releaser workflow {0} started: deployment {1}.', picked.label, String(record.id)), open)
        .then(choice => {
          if (choice === open)
            vscode.env.openExternal(vscode.Uri.parse(show_details_url(base, record.id)));
        });
    }
    catch (e: unknown) {
      show_error(vscode.l10n.t('Starting the i-Releaser workflow failed'), e);
    }
  }



  /**
   * Stores the deployment in the displayed build list and in the other copy of the same build
   * (live list ↔ its history folder), so the history and the Timeline know it too.
   * Written as it is: the git info stays the one of the build, not the current commit.
   */
  private static store_deployment(compile_list_file: string, compile_list: Record<string, unknown>, record: DeploymentRecord): void {

    const with_record = (list: Record<string, unknown>) => {
      if (!is_plain_object(list['custom_data']))
        list['custom_data'] = {};
      (list['custom_data'] as Record<string, unknown>)[CUSTOM_DATA_KEY] = record;
      return list;
    };
    DirTool.write_json(compile_list_file, with_record(compile_list));

    const timestamp = compile_list['timestamp'];
    if (typeof timestamp !== 'string' || timestamp === '')
      return;
    const ws = Workspace.get_workspace();
    const live_file = path.join(ws, AppConfig.get_app_config().general['compile-list']);
    const history_file = path.join(ws, Constants.BUILD_HISTORY_DIR, history_dir_name(timestamp), 'compile-list.json');
    for (const file of [live_file, history_file]) {
      if (path.resolve(file) === path.resolve(compile_list_file) || !DirTool.file_exists(file))
        continue;
      const copy = OBITools.get_compile_list(Workspace.get_workspace_uri(), path.relative(ws, file));
      if (is_plain_object(copy) && copy['timestamp'] === timestamp)
        DirTool.write_json(file, with_record(copy));
    }
  }



  /** Runs an i-Releaser request with a cancellable notification; aborts after 60 s */
  private static async with_progress<T>(title: string, lock_token: vscode.CancellationToken, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: title, cancellable: true }, async (_progress, progress_token) => {
      const controller = new AbortController();
      let timed_out = false;
      const timer = setTimeout(() => { timed_out = true; controller.abort(); }, 60_000);
      const subscriptions = [progress_token, lock_token].map(token => token.onCancellationRequested(() => controller.abort()));
      try {
        return await fn(controller.signal);
      }
      catch (e: unknown) {
        if (timed_out)
          throw new IReleaserError(vscode.l10n.t('No answer within 60 seconds'));
        if (controller.signal.aborted)
          throw new UserCancelledError();
        throw e;
      }
      finally {
        clearTimeout(timer);
        subscriptions.forEach(subscription => subscription.dispose());
      }
    });
  }



  /**
   * Lets the user pick sources not yet part of the current compile list and merges them
   * (together with their computed dependents) into it, preserving already existing entries.
   */
  public static async add_sources(extensionUri?: vscode.Uri, workspaceUri?: vscode.Uri): Promise<void> {
    try {
      // The compile-list must not change while a build runs
      await OperationLock.run('Edit build summary', () => BuildSummary.do_add_sources(extensionUri, workspaceUri));
    }
    catch (e: unknown) {
      show_error(vscode.l10n.t('Adding sources failed'), e, OBICommands.new_build_list_actions(e, BuildSummary.get_current_compile_list_name()));
    }
  }



  private static async do_add_sources(extensionUri?: vscode.Uri, workspaceUri?: vscode.Uri): Promise<void> {

    const ws_uri = workspaceUri || Workspace.get_workspace_uri();
    const ext_uri = extensionUri || BuildSummary._extensionUri;

    const compile_list: any = BuildSummary.get_compile_list();
    if (!compile_list) {
      vscode.window.showErrorMessage(vscode.l10n.t('No build summary found. Run "Preview build" first.'));
      return;
    }

    // Branch build: only with a local OBI of version 6 or newer; the fallback below would build into the main libraries (spec B4)
    BranchBuild.check_local_backend();

    const existing_sources = new Set<string>();
    for (const level_item of compile_list['compiles']) {
      for (const source_item of level_item['sources']) {
        existing_sources.add(source_item['source']);
      }
    }

    const source_list: string[] = await LocalSourceList.get_source_list();
    if (source_list.every(source => existing_sources.has(source))) {
      vscode.window.showInformationMessage(vscode.l10n.t('All sources are already part of the build summary.'));
      return;
    }

    const selected_sources = await pick_sources({ placeholder: 'Select sources to add to the build summary...', exclude: existing_sources });

    if (selected_sources.length === 0) {
      return;
    }

    const dependency_dict = await DependencyList.get_dependencies();
    const app_config = AppConfig.get_app_config();

    const { compileList: merged_compile_list, added, reset } = (!OBITools.without_local_obi() && app_config.general['local-obi-dir'])
      ? await BuildSummary.add_sources_via_local_obi(selected_sources, dependency_dict, app_config)
      : mergeSourcesIntoCompileList(compile_list, selected_sources, dependency_dict, app_config);

    OBITools.write_compile_list(path.join(Workspace.get_workspace(), BuildSummary.get_current_compile_list_name()), merged_compile_list);

    if (BuildSummary.currentPanel) {
      await BuildSummary.update();
    } else if (ext_uri) {
      BuildSummary.render(ext_uri, ws_uri, BuildSummary._current_compile_output_folder);
    }

    let message = vscode.l10n.t('Added {0} source(s) to the build summary.', added.length);
    if (reset.length > 0) {
      message += ' ' + vscode.l10n.t('{0} source(s) had their status reset due to dependency changes.', reset.length);
    }
    vscode.window.showInformationMessage(message);
  }


  /**
   * Adds sources by calling the local OBI (python) project's dedicated add-source action,
   * one source at a time, pointed at the directory of the currently-displayed compile-list.json
   * (works whether that's the live build-output list or one opened from build-history), then
   * reloads the resulting (incrementally updated) list from that same location.
   */
  private static async add_sources_via_local_obi(
    selected_sources: string[],
    dependency_dict: Record<string, string[]>,
    app_config: any
  ): Promise<{ compileList: any; added: string[]; reset: string[] }> {

    const compile_list_name = BuildSummary.get_current_compile_list_name();
    const compile_list_dir = path.dirname(compile_list_name);

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Adding sources with the local OBI…'),
      cancellable: false
    }, async (progress) => {
      for (const source of selected_sources) {
        progress.report({ message: source });
        const args = OBICommands.local_obi_args(app_config, 'add_source', source, [`--compile-list-dir=${compile_list_dir}`, ...BranchBuild.args()]);
        let unknown_branch_argument = false;
        try {
          await SystemCmdExecution.run_system_cmd(Workspace.get_workspace(), OBICommands.local_obi_python(), args, 'add_sources', {
            on_line: line => { if (is_unknown_branch_argument(line)) unknown_branch_argument = true; }
          });
        }
        catch (e: unknown) {
          throw unknown_branch_argument ? new BranchBuildRefusal(BranchBuild.local_too_old_text()) : e;
        }
        // The backend ends with exit code 0 also after an error, e.g. a list of another ticket (spec B6)
        const status = DirTool.get_json(path.join(Workspace.get_workspace(), Constants.OBI_STATUS_FILE), false);
        if (status?.['status'] === 'error') {
          const message = String(status['message'] ?? '');
          throw /Create a new build list/i.test(message) ? new BranchBuildRefusal(message, true) : new Error(message);
        }
      }
    });

    const live_compile_list = OBITools.get_compile_list(Workspace.get_workspace_uri(), compile_list_name);
    if (!live_compile_list) {
      throw new Error('Local OBI did not produce a valid compile-list.');
    }

    const added = selected_sources.filter(source =>
      (live_compile_list['compiles'] || []).some((level_item: any) =>
        level_item['sources'].some((source_item: any) => source_item['source'] === source)
      )
    );
    const reset = resetDependentStatuses(live_compile_list, selected_sources, dependency_dict);

    return { compileList: live_compile_list, added, reset };
  }



  /**
   * Checkbox of a source, written to the displayed compile-list.json at once (any status). Unchecking asks whether
   * the sources that are only in the build list because of this one should be unchecked too.
   */
  public static async ignore_source(source: string, ignore: boolean): Promise<void> {
    await BuildSummary.edit_checkboxes(() => BuildSummary.do_ignore_source(source, ignore));
  }


  /** Checkbox of a command, written to the displayed compile-list.json at once */
  public static async ignore_cmd(level: string, source: string, cmd_index: number, ignore: boolean): Promise<void> {
    await BuildSummary.edit_checkboxes(async () => {
      const compile_list: unknown = BuildSummary.get_compile_list();
      const cmd_entry = BuildSummary.entries_of(compile_list, source, level)
        .map(entry => Array.isArray(entry['cmds']) ? entry['cmds'][cmd_index] : undefined)
        .find(is_object);
      if (!cmd_entry || !is_object(compile_list)) {
        logger.warn(`Build summary: command ${cmd_index} of ${source} (level ${level}) not found`);
        return false;
      }
      cmd_entry['ignore'] = ignore;
      OBITools.write_compile_list(path.join(Workspace.get_workspace(), BuildSummary.get_current_compile_list_name()), compile_list);
      return true;
    });
  }


  /**
   * Runs a checkbox change under the lock. `edit` returns whether the page already shows the result;
   * otherwise (busy, cancelled, error, more checkboxes changed) the page is rendered again from the file.
   */
  private static async edit_checkboxes(edit: () => Promise<boolean>): Promise<void> {
    let in_sync: boolean | undefined;
    try {
      // The compile-list must not change while a build runs
      in_sync = await OperationLock.run('Edit build summary', edit);
    }
    catch (e: unknown) {
      show_error(vscode.l10n.t('Saving the build summary failed'), e);
    }
    if (in_sync !== true)
      await BuildSummary.update();
  }


  private static async do_ignore_source(source: string, ignore: boolean): Promise<boolean> {

    const compile_list: unknown = BuildSummary.get_compile_list();
    const entries = BuildSummary.entries_of(compile_list, source);
    if (entries.length === 0 || !is_object(compile_list)) {
      logger.warn(`Build summary: ${source} is not in the build list`);
      return false;
    }

    let dependents: string[] = [];
    // Without the changed sources of this build, changed and dependent sources can't be told apart: no question
    const changed = ignore ? BuildSummary.changed_sources() : undefined;
    if (changed) {
      const graph = create_dependency_graph(await DependencyList.get_dependencies());
      dependents = dependents_only_needed_by(compile_list, source, changed, graph);
    }

    if (dependents.length > 0) {
      const max_shown = 20;
      const detail = dependents.slice(0, max_shown).join('\n')
        + (dependents.length > max_shown ? '\n' + vscode.l10n.t('… and {0} more', dependents.length - max_shown) : '');
      const uncheck_all = vscode.l10n.t('Uncheck dependents too');
      const only_this = vscode.l10n.t('Only this source');
      const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t('{0} source(s) are only in the build list because of {1}. Uncheck them too?', dependents.length, source),
        { modal: true, detail: detail },
        uncheck_all, only_this);
      if (choice === undefined)
        return false;
      if (choice !== uncheck_all)
        dependents = [];
    }

    for (const name of [source, ...dependents])
      BuildSummary.entries_of(compile_list, name).forEach(entry => entry['ignore'] = ignore);
    OBITools.write_compile_list(path.join(Workspace.get_workspace(), BuildSummary.get_current_compile_list_name()), compile_list);
    if (dependents.length > 0)
      logger.info(`Build summary: unchecked ${source} and its dependents ${dependents.join(', ')}`);

    return dependents.length === 0;
  }


  /** Entries of a source in the build list (of one level, if given) */
  private static entries_of(compile_list: unknown, source: string, level?: string): Record<string, unknown>[] {
    const levels = is_object(compile_list) && Array.isArray(compile_list['compiles']) ? compile_list['compiles'] : [];
    return levels
      .filter((level_item): level_item is Record<string, unknown> => is_object(level_item) && (level === undefined || String(level_item['level']) === level))
      .flatMap(level_item => Array.isArray(level_item['sources']) ? level_item['sources'] : [])
      .filter((entry): entry is Record<string, unknown> => is_object(entry) && entry['source'] === source);
  }



  /**
   * Lets the user modify a build command's text, recording the previous value in the cmd's change-history.
   */
  public static async edit_cmd(level: string, source: string, cmd_index: number): Promise<void> {
    // The compile-list must not change while a build runs
    await OperationLock.run('Edit build summary', () => BuildSummary.do_edit_cmd(level, source, cmd_index));
  }



  private static async do_edit_cmd(level: string, source: string, cmd_index: number): Promise<void> {

    const compile_list: any = BuildSummary.get_compile_list();
    if (!compile_list) {
      return;
    }

    const level_item = compile_list['compiles'].find((item: any) => String(item['level']) === String(level));
    const source_item = level_item?.['sources'].find((item: any) => item['source'] === source);
    const cmd_entry = source_item?.['cmds']?.[cmd_index];

    if (!cmd_entry) {
      vscode.window.showErrorMessage(vscode.l10n.t('Command not found.'));
      return;
    }

    const new_cmd = await vscode.window.showInputBox({
      title: vscode.l10n.t('Edit build command of {0}', source),
      value: cmd_entry['cmd'],
      ignoreFocusOut: true
    });

    if (new_cmd === undefined || new_cmd === cmd_entry['cmd']) {
      return;
    }

    if (!cmd_entry['change-history']) {
      cmd_entry['change-history'] = [];
    }
    cmd_entry['change-history'].push({
      type: 'cmd-change',
      user: AppConfig.get_app_config().connection['ssh-user'] || 'unknown',
      original: cmd_entry['cmd'],
      timestamp: new Date().toISOString()
    });
    cmd_entry['cmd'] = new_cmd;
    if (cmd_entry['status'] === 'success') {
      cmd_entry['status'] = 'new';
    }

    const dependency_dict = await DependencyList.get_dependencies();
    const reset = resetDependentStatuses(compile_list, [source], dependency_dict);

    OBITools.write_compile_list(path.join(Workspace.get_workspace(), BuildSummary.get_current_compile_list_name()), compile_list);

    await BuildSummary.update();

    if (reset.length > 0) {
      vscode.window.showInformationMessage(vscode.l10n.t('{0} source(s) had their status reset due to the command change.', reset.length));
    }
  }



  public static get_current_compile_list_name(): string {
    
    let compileListFileName: string|undefined = AppConfig.get_app_config().general['compile-list'];

    if (BuildSummary._current_compile_output_folder && compileListFileName) {
      compileListFileName = path.basename(compileListFileName);
      compileListFileName = path.join(BuildSummary._current_compile_output_folder, compileListFileName);
    }
    return compileListFileName;
  }


  public static get_compile_list(): any {
    let compile_list: any|undefined;

    compile_list = OBITools.get_compile_list(Workspace.get_workspace_uri(), BuildSummary.get_current_compile_list_name());
    return compile_list;
  }



  /** Config of the displayed history entry: config.json, or the config embedded by older versions */
  private static build_config(): Record<string, unknown> | undefined {
    const folder = BuildSummary._current_compile_output_folder;
    if (!folder)
      return undefined;
    const snapshot_file = path.resolve(Workspace.get_workspace(), folder, Constants.BUILD_HISTORY_CONFIG_FILE);
    const snapshot = DirTool.file_exists(snapshot_file) ? DirTool.get_json(snapshot_file, false) : undefined;
    if (snapshot && typeof snapshot === 'object')
      return snapshot;
    return BuildSummary.get_compile_list()?.['config'];
  }



  /**
   * User profile that goes with the shown config: the active one for the current build list,
   * the one stored with a history entry (none for older entries)
   */
  private static build_profile(compile_list: unknown): string | undefined {
    const profile = BuildSummary._current_compile_output_folder
      ? (is_object(compile_list) ? compile_list['profile'] : undefined)
      : (Workspace.get_current_profile() ?? '');
    if (typeof profile !== 'string')
      return undefined;
    return profile === '' ? 'default' : profile;
  }



  /** The deployment for the page: link, and its status as far as DeploymentWatcher knows it (`watched`: the card is shown) */
  private static deployment_model(base: string, id: number | string) {
    return { id: String(id), link: show_details_url(base, id), ...BuildSummary.deployment_status(base, id) };
  }



  /**
   * A new status of the shown deployment: only the card is rendered and sent to the page (deployment_card), not the
   * whole page with the build list. If the card appears or disappears, the whole page is rendered.
   */
  public static async update_deployment(): Promise<void> {
    const panel = BuildSummary.currentPanel;
    const shown = BuildSummary._shown_deployment;
    if (!panel)
      return;
    const deployment = shown ? BuildSummary.deployment_model(shown.base, shown.id) : undefined;
    if ((deployment?.watched === true) !== BuildSummary._card_shown) {
      await BuildSummary.update();
      return;
    }
    if (!deployment?.watched)
      return;
    const webview = panel._panel.webview;
    const html = render_template('show_changes/deployment_card.html', {
      global_stuff: OBITools.get_global_stuff(webview, BuildSummary._extensionUri),
      i_releaser: { deployment }
    });
    await webview.postMessage({ command: 'deployment_card', html });
  }



  /** Status of a deployment for the page, as far as DeploymentWatcher knows it */
  private static deployment_status(base: string, id: number | string) {
    const info = DeploymentWatcher.info(base, id);
    if (!info)
      return { watched: false };
    const state = info.state;
    if (!state)
      return { watched: true, error: info.error, checked: info.checked?.toLocaleTimeString() };

    const overview = deployment_overview(state, DeploymentConfig.get_deployment_config()['i-releaser']['run-stages']);
    const attention = overview.attention;
    const kind = status_kind(state.status);
    let attention_text: string | undefined;
    if (attention?.kind === 'failed')
      attention_text = attention.step
        ? vscode.l10n.t('Stage {0} failed in step {1}.', attention.stage.name, attention.step.label)
        : vscode.l10n.t('Stage {0} failed.', attention.stage.name);
    else if (attention)
      attention_text = vscode.l10n.t('Stage {0} is ready to run.', attention.stage.name);

    return {
      watched: true,
      error: info.error,
      checked: info.checked?.toLocaleTimeString(),
      state: {
        status: state.status,
        kind: kind,
        icon: BuildSummary.STATUS_ICON[kind],
        version: state.deploy_version !== undefined ? String(state.deploy_version) : undefined,
        workflow: state.workflow,
        done: overview.done,
        total: overview.total,
        percent: overview.total > 0 ? Math.round(overview.done / overview.total * 100) : 0,
        stages: state.stages.map((stage, index) => {
          const stage_kind = status_kind(stage.status);
          // A stage which waits for parallel stages says for which (else its status)
          const state_text = is_waiting(stage) ? vscode.l10n.t('waits for {0}', (stage.waiting_for ?? []).join(', ')) : stage.status;
          return { id: String(stage.id), name: stage.name, status: stage.status, state_text: state_text, kind: stage_kind, step_icon: BuildSummary.STEP_ICON[stage_kind], number: index + 1 };
        }),
        attention: attention && attention_text ? {
          stage_id: String(attention.stage.id),
          kind: attention.kind,
          text: attention_text,
          show_log: attention.has_log,
          continue: attention.options.includes('continue'),
          run_all: attention.options.includes('run_all'),
          hint: attention.not_in_run_stages ? vscode.l10n.t('Not in run-stages of {0}: run it in i-Releaser.', Constants.DEPLOYMENT_CONFIG_FILE) : undefined,
        } : undefined
      }
    };
  }


  /**
   * Branch build of the shown list (spec C4, C5): mode, ticket, libraries with an ADDLIBLE to copy for testing,
   * warning and error of the backend. Only for lists the backend created with branch build (build_context).
   */
  private static branch_build_model(compile_list: unknown) {
    const context = build_context_of(compile_list);
    if (!context)
      return undefined;
    // Only the current list is run; a list of the history was simply built on its branch
    const other_branch = !BuildSummary._current_compile_output_folder && BranchBuild.is_active() ? branch_mismatch(context, BranchBuild.current_branch()) : undefined;
    return {
      mode: context.mode,
      title: context.mode === 'branch'
        ? vscode.l10n.t('Branch build of ticket {0} (branch {1})', context.ticket ?? '?', context.branch ?? '?')
        : vscode.l10n.t('Builds into the main libraries (branch {0})', context.branch ?? '?'),
      libs: context.libs.map(lib => ({ name: lib.toUpperCase(), addlible: `ADDLIBLE LIB(${lib.toUpperCase()}) POSITION(*FIRST)` })),
      warning: context.warning,
      error: context.error ? vscode.l10n.t('Branch library {0} could not be created: {1}', String(context.error.lib ?? '').toUpperCase(), String(context.error.stderr ?? '')) : undefined,
      other_branch: other_branch !== undefined ? vscode.l10n.t('The build list was created on branch {0}. Running it would build into the libraries of that branch. Create a new build list.', other_branch) : undefined,
    };
  }



  /** Codicon (and colour) of the status of a build command */
  private static readonly CMD_ICON: Record<string, string> = {
    'success': 'pass obi-passed', 'failed': 'error obi-failed', 'error': 'error obi-failed',
    'in process': 'sync codicon-modifier-spin obi-running', 'new': 'circle-large-outline obi-muted',
  };


  /** Codicon of a status in its pill */
  private static readonly STATUS_ICON: Record<StatusKind, string> = {
    finished: 'pass', failed: 'error', running: 'sync codicon-modifier-spin', ready: 'play-circle', canceled: 'circle-slash', new: 'circle-large-outline',
  };

  /** Codicon in the circle of a stage; none: its number */
  private static readonly STEP_ICON: Record<StatusKind, string | undefined> = {
    finished: 'check', failed: 'close', running: 'sync codicon-modifier-spin', ready: 'play', canceled: 'circle-slash', new: undefined,
  };



  /**
   * The custom template of the workspace, if there is one. It is code (Nunjucks can run JavaScript): only in a
   * trusted workspace. `uses_toolkit`: it contains components of the deprecated webview toolkit (<vscode-…>).
   */
  public static custom_template(workspace: string): { uses_toolkit: boolean } | undefined {
    if (!vscode.workspace.isTrusted)
      return undefined;
    const file = path.join(workspace, Constants.VSCODE_CUSTOM_BUILD_LIST_TEMPLATE);
    const content = DirTool.file_exists(file) ? DirTool.get_file_content(file) : undefined;
    if (content === undefined)
      return undefined;
    const uses_toolkit = /<vscode-[a-z]/i.test(content);
    if (uses_toolkit)
      logger.debug(`${Constants.VSCODE_CUSTOM_BUILD_LIST_TEMPLATE} uses components of the deprecated webview toolkit (<vscode-…>)`);
    return { uses_toolkit };
  }



  private static generate_html(extensionUri: vscode.Uri, webview: vscode.Webview): string {

    const ws: vscode.Uri = Workspace.get_workspace_uri();
    const config = AppConfig.get_app_config();

    const custom = BuildSummary.custom_template(ws.fsPath);
    const custom_dir = custom ? path.join(ws.fsPath, path.dirname(Constants.VSCODE_CUSTOM_BUILD_LIST_TEMPLATE)) : undefined;

    const compile_list = BuildSummary.get_compile_list();

    if (compile_list && Array.isArray(compile_list['compiles'])) {
      for (const level_item of compile_list['compiles']) {
        for (const source of Array.isArray(level_item?.['sources']) ? level_item['sources'] : []) {
          if (typeof source?.['source'] === 'string')
            source['file'] = DirTool.get_encoded_source_URI(source['source']);
        }
      }
    }

    // i-Releaser of deployment.toml: button to start a workflow, link to the deployment started for this build list
    const i_releaser_url = DeploymentConfig.i_releaser_url();
    const deployment = i_releaser_url ? deployment_of(compile_list) : undefined;
    const i_releaser = i_releaser_url ? { deployment: deployment ? BuildSummary.deployment_model(i_releaser_url, deployment.id) : undefined } : undefined;
    BuildSummary._card_shown = i_releaser?.deployment?.watched === true;

    let created_timestamp = 'Unsupported timestamp';
    if (compile_list && compile_list['timestamp']) {
      created_timestamp = new Date(compile_list['timestamp']).toLocaleString();
    }
    const branch_build = BuildSummary.branch_build_model(compile_list);

    // Status of every source and the counts per level, for the header and the build list
    const build_counts = annotate_build_list(compile_list);

    const html = render_template('show_changes/index.html', 
      {
      global_stuff: OBITools.get_global_stuff(webview, extensionUri),
      main_java_script: getUri(webview, extensionUri, ["out", "webview", "show_changes.js"]),
      // Deprecated toolkit components (<vscode-button>, …): only for a custom template that uses them
      toolkit_java_script: custom?.uses_toolkit ? getUri(webview, extensionUri, ["out", "webview", "custom_toolkit.js"]) : undefined,
      //filex: encodeURIComponent(JSON.stringify(fileUri)),
      object_list: BuildSummary.get_object_list(ws),
      compile_list: compile_list,
      created_timestamp: created_timestamp,
      build_counts: build_counts,
      cmd_icons: BuildSummary.CMD_ICON,
      compile_file_uri: DirTool.get_encoded_file_URI(path.join(BuildSummary._current_compile_output_folder ?? Constants.BUILD_OUTPUT_DIR, 'compile-list.json')),
      compile_file: path.resolve(ws.fsPath, BuildSummary._current_compile_output_folder ?? Constants.BUILD_OUTPUT_DIR, 'compile-list.json').replace(/\\/g, '/'),
      log_file_uri: DirTool.get_encoded_file_URI(Constants.OBI_LOG_FILE),
      is_compile_list_completed: OBITools.is_compile_list_completed(compile_list),
      compile_app_config: BuildSummary.build_config() ?? config,
      profile: BuildSummary.build_profile(compile_list),
      app_config: config,
      custom_build_list_template: custom_dir ? path.basename(Constants.VSCODE_CUSTOM_BUILD_LIST_TEMPLATE) : undefined,
      i_releaser: i_releaser,
      branch_build: branch_build
      },
      custom_dir
    );

    return html;

  }




  public static async update(): Promise<void> {

    const panel = BuildSummary.currentPanel;
    
    if (!panel)
      return;

    BuildSummary.follow_deployment(BuildSummary.get_compile_list());
    panel._panel.webview.html = BuildSummary.generate_html(BuildSummary._extensionUri, panel._panel.webview);
  }


  /**
   * Switches the webview back to the live (non-history) compile-list, so the freshly built results
   * are shown even if a build-history entry was open when the build was triggered.
   */
  public static async show_current_results(extensionUri?: vscode.Uri, workspaceUri?: vscode.Uri): Promise<void> {

    BuildSummary._current_compile_output_folder = undefined;

    if (BuildSummary.currentPanel) {
      await BuildSummary.update();
      return;
    }

    const ext_uri = extensionUri || BuildSummary._extensionUri;
    const ws_uri = workspaceUri || Workspace.get_workspace_uri();
    if (ext_uri) {
      BuildSummary.render(ext_uri, ws_uri);
    }
  }



  /** changed-object-list.json of the displayed build list (live or of the history entry) */
  private static changed_object_list_file(): string {
    const ws: string = Workspace.get_workspace();
    const folder = BuildSummary._current_compile_output_folder;
    return folder ? path.join(ws, folder, Constants.CHANGED_OBJECT_LIST_FILE_NAME) : path.join(ws, Constants.CHANGED_OBJECT_LIST);
  }


  /** New and changed sources of the displayed build list; undefined without a readable changed-object-list.json */
  private static changed_sources(): string[] | undefined {
    const file = BuildSummary.changed_object_list_file();
    const changed: unknown = DirTool.file_exists(file) ? DirTool.get_json(file, false) : undefined;
    if (!is_object(changed))
      return undefined;
    return ['new-objects', 'changed-sources']
      .flatMap(key => Array.isArray(changed[key]) ? changed[key] as unknown[] : [])
      .filter((source): source is string => typeof source === 'string');
  }



  private static get_object_list(workspaceUri: vscode.Uri): any|undefined {



    const ws: string = Workspace.get_workspace();

    const changed_object_list = BuildSummary.changed_object_list_file();
    let dependend_object_list = path.join(ws, Constants.DEPENDEND_OBJECT_LIST);
    if (BuildSummary._current_compile_output_folder) {
      dependend_object_list = path.join(ws, BuildSummary._current_compile_output_folder, Constants.DEPENDEND_OBJECT_LIST_FILE_NAME);
    }

    if (!DirTool.file_exists(changed_object_list) || !DirTool.file_exists(dependend_object_list)) {
      logger.info(`${changed_object_list}: ${DirTool.file_exists(changed_object_list)}`);
      logger.info(`${dependend_object_list}: ${DirTool.file_exists(dependend_object_list)}`);
      return undefined;
    }

    // Unreadable files give empty lists instead of breaking the whole page
    const changed = DirTool.get_json(changed_object_list, false);
    const dependend = DirTool.get_json(dependend_object_list, false);
    const string_list = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    const with_file = (sources: string[]) => sources.map(source => ({ source: source, file: DirTool.get_encoded_source_URI(source) }));

    const new_sources = with_file(string_list(changed?.['new-objects']));
    const changed_sources = with_file(string_list(changed?.['changed-sources']));

    logger.info(`compile_list['new-objects']: ${new_sources.length}`);
    logger.info(`compile_list['changed-sources']: ${changed_sources.length}`);

    return {
      new_sources : new_sources,
      changed_sources: changed_sources,
      dependend_sources: with_file(string_list(dependend))
    }
  }




  private static createNewPanel(extensionUri : vscode.Uri) {
    const wsUri = Workspace.get_workspace_uri();
    const templatePath = vscode.Uri.file(path.join(wsUri.fsPath, Constants.VSCODE_CUSTOM_BUILD_LIST_TEMPLATE));
    const templateDir = vscode.Uri.file(path.dirname(templatePath.fsPath));

    return vscode.window.createWebviewPanel(
      'show_changes', // Identifies the type of the webview. Used internally
      vscode.l10n.t('Build summary'), // Title of the panel displayed to the user
      // The editor column the panel should be displayed in
      vscode.ViewColumn.One,
      // Extra panel configurations
      {
        // Enable JavaScript in the webview
        enableScripts: true,
        enableCommandUris: true,
        enableFindWidget: true,
        // Restrict the webview to only load resources from the `out` directory
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "asserts"),
          templateDir
        ],
        retainContextWhenHidden: true
      }
    );
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    BuildSummary.currentPanel = undefined;
    BuildSummary._shown_deployment = undefined;
    BuildSummary._card_shown = false;
    DeploymentWatcher.show(undefined);

    // Dispose of the current webview panel
    this._panel.dispose();

    // Dispose of all disposables (i.e. commands) associated with the current webview panel
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

}