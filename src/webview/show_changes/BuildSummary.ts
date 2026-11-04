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
import { DependencyList } from '../../extension/obi/Dependency';
import { mergeSourcesIntoCompileList, resetDependentStatuses } from '../../extension/obi/compile_list/modules/add_sources';
import { ISourceInfos } from '../../shared/Source';
import { SystemCmdExecution } from '../../extension/utilities/SystemCmdExecution';
import { OperationLock } from '../../extension/utilities/OperationLock';
import { render_template } from '../Templates';
import { DeploymentConfig } from '../deployment/DeploymentConfig';
import { CUSTOM_DATA_KEY, IReleaserError, deployment_data, deployment_of, get_workflows, show_details_url, start_workflow } from '../../shared/IReleaser';
import { UserCancelledError } from '../../shared/Errors';
import { require_trust } from '../../extension/utilities/Trust';
import { show_error } from '../../extension/utilities/Notify';



export class BuildSummary {

  public static currentPanel: BuildSummary | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private static _extensionUri: vscode.Uri;
  private static _current_compile_output_folder: string | undefined;


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

      case "edit_cmd":
        BuildSummary.edit_cmd(message.level, message.source, message.cmd_index);
        return;

      case "start_deployment":
        BuildSummary.start_deployment();
        return;
    }
  }



  /**
   * Starts an i-Releaser workflow with the displayed build list (without joblogs) and stores the deployment
   * in it (custom_data['i-releaser']). URL from deployment.toml, token from the secret storage.
   */
  public static async start_deployment(): Promise<void> {
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

    const base = DeploymentConfig.i_releaser_url();
    if (!base) {
      vscode.window.showErrorMessage(vscode.l10n.t('No i-Releaser URL in {0}.', Constants.DEPLOYMENT_CONFIG_FILE), configure).then(open_config);
      return;
    }
    const auth_token = await DeploymentConfig.get_auth_token(base);
    if (!auth_token) {
      vscode.window.showErrorMessage(vscode.l10n.t('No i-Releaser token is stored for {0}.', base), configure).then(open_config);
      return;
    }

    const compile_list_file = path.join(Workspace.get_workspace(), BuildSummary.get_current_compile_list_name());
    const compile_list = BuildSummary.get_compile_list();
    if (!compile_list) {
      vscode.window.showErrorMessage(vscode.l10n.t('No build summary found. Run "Show changes" first.'));
      return;
    }

    try {
      const workflows = await BuildSummary.with_progress(vscode.l10n.t('Loading the workflows of i-Releaser…'), lock_token,
        signal => get_workflows(base, auth_token, signal));
      if (workflows.length === 0) {
        vscode.window.showWarningMessage(vscode.l10n.t('i-Releaser has no workflows for this token.'));
        return;
      }

      // The default workflow first; the pick also confirms the start
      const default_workflow = DeploymentConfig.get_deployment_config()['i-releaser']['default-workflow'];
      const items: vscode.QuickPickItem[] = workflows
        .sort((a, b) => Number(b === default_workflow) - Number(a === default_workflow))
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

      if (!is_plain_object(compile_list['custom_data']))
        compile_list['custom_data'] = {};
      compile_list['custom_data'][CUSTOM_DATA_KEY] = record;
      OBITools.write_compile_list(compile_list_file, compile_list);
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
    // The compile-list must not change while a build runs
    await OperationLock.run('Edit build summary', () => BuildSummary.do_add_sources(extensionUri, workspaceUri));
  }



  private static async do_add_sources(extensionUri?: vscode.Uri, workspaceUri?: vscode.Uri): Promise<void> {

    const ws_uri = workspaceUri || Workspace.get_workspace_uri();
    const ext_uri = extensionUri || BuildSummary._extensionUri;

    const compile_list: any = BuildSummary.get_compile_list();
    if (!compile_list) {
      vscode.window.showErrorMessage(vscode.l10n.t('No build summary found. Run "Show changes" first.'));
      return;
    }

    const existing_sources = new Set<string>();
    for (const level_item of compile_list['compiles']) {
      for (const source_item of level_item['sources']) {
        existing_sources.add(source_item['source']);
      }
    }

    const source_info_list: ISourceInfos = await LocalSourceList.get_source_info_list();
    const candidates = Object.entries(source_info_list).filter(([source]) => !existing_sources.has(source));

    if (candidates.length === 0) {
      vscode.window.showInformationMessage(vscode.l10n.t('All sources are already part of the build summary.'));
      return;
    }

    const quick_pick = vscode.window.createQuickPick();
    quick_pick.placeholder = 'Select sources to add to the build summary...';
    quick_pick.canSelectMany = true;
    quick_pick.matchOnDescription = true;
    quick_pick.items = candidates.map(([source, info]) => ({ label: source, description: (info || {}).description || '' }));

    const selected_sources: string[] = await new Promise((resolve) => {
      quick_pick.onDidAccept(() => {
        resolve(quick_pick.selectedItems.map(item => item.label));
        quick_pick.hide();
      });
      quick_pick.onDidHide(() => {
        resolve([]);
        quick_pick.dispose();
      });
      quick_pick.show();
    });

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
        const args = OBICommands.local_obi_args(app_config, 'add_source', source, [`--compile-list-dir=${compile_list_dir}`]);
        await SystemCmdExecution.run_system_cmd(Workspace.get_workspace(), OBICommands.local_obi_python(), args, 'add_sources');
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



  private static generate_html(extensionUri: vscode.Uri, webview: vscode.Webview): string {

    const ws: vscode.Uri = Workspace.get_workspace_uri();
    const config = AppConfig.get_app_config();

    // The custom template of the workspace is code (Nunjucks can run JavaScript): only in a trusted workspace
    const custom_dir = vscode.workspace.isTrusted ? path.join(ws.fsPath, path.dirname(Constants.VSCODE_CUSTOM_BUILD_LIST_TEMPLATE)) : undefined;

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
    const i_releaser = i_releaser_url ? {
      deployment: deployment ? { id: String(deployment.id), link: show_details_url(i_releaser_url, deployment.id) } : undefined
    } : undefined;

    let created_timestamp = 'Unsupported timestamp';
    if (compile_list && compile_list['timestamp']) {
      created_timestamp = new Date(compile_list['timestamp']).toLocaleString();
    }

    const html = render_template('show_changes/index.html', 
      {
      global_stuff: OBITools.get_global_stuff(webview, extensionUri),
      main_java_script: getUri(webview, extensionUri, ["out", "webview", "show_changes.js"]),
      //filex: encodeURIComponent(JSON.stringify(fileUri)),
      object_list: BuildSummary.get_object_list(ws),
      compile_list: compile_list,
      created_timestamp: created_timestamp,
      compile_file_uri: DirTool.get_encoded_file_URI(path.join(BuildSummary._current_compile_output_folder ?? Constants.BUILD_OUTPUT_DIR, 'compile-list.json')),
      compile_file: path.resolve(ws.fsPath, BuildSummary._current_compile_output_folder ?? Constants.BUILD_OUTPUT_DIR, 'compile-list.json').replace(/\\/g, '/'),
      log_file_uri: DirTool.get_encoded_file_URI(Constants.OBI_LOG_FILE),
      is_compile_list_completed: OBITools.is_compile_list_completed(compile_list),
      compile_app_config: BuildSummary.build_config() ?? config,
      app_config: config,
      custom_build_list_template: custom_dir ? path.basename(Constants.VSCODE_CUSTOM_BUILD_LIST_TEMPLATE) : undefined,
      i_releaser: i_releaser
      },
      custom_dir
    );

    return html;

  }




  public static async update(): Promise<void> {

    const panel = BuildSummary.currentPanel;
    
    if (!panel)
      return;

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



  private static get_object_list(workspaceUri: vscode.Uri): any|undefined {



    const ws: string = Workspace.get_workspace();
    
    let changed_object_list = path.join(ws, Constants.CHANGED_OBJECT_LIST);
    if (BuildSummary._current_compile_output_folder) {
      changed_object_list = path.join(ws, BuildSummary._current_compile_output_folder, Constants.CHANGED_OBJECT_LIST_FILE_NAME);
    }
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