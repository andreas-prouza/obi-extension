import * as vscode from 'vscode';
import * as path from 'path';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../extension/utilities/getUri";
import { DirTool } from '../../extension/utilities/DirTool';
import { Constants } from '../../shared/Constants';
import { OBITools } from '../../extension/utilities/OBITools';
import { AppConfig, ConfigCompileSettings, SourceConfigList } from '../../extension/config/AppConfig';
import { Workspace } from '../../extension/utilities/Workspace';
import { OBISourceConfiguration } from './OBISourceConfiguration';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';
import { ExtendedSourceProcessing, ExtendedSourceProcessingList, Step } from '../../extension/config/EspConfig';
import { CONFIGURATION_REQUESTS, ConfigurationRequest } from '../../shared/messages/ConfigurationMessages';
import { parse_message } from '../../shared/messages/MessageGuard';
import { logger } from '../../extension/utilities/Logger';
import { ProjectState } from '../../extension/ProjectState';
import { show_error } from '../../extension/utilities/Notify';
import { render_template } from '../Templates';




export class OBIConfiguration {

  public static currentPanel: OBIConfiguration | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private static _context: vscode.ExtensionContext;
  private static _extensionUri: Uri;



  /**
   * The ComponentGalleryPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: WebviewPanel, extensionUri: Uri) {
    this._panel = panel;

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
  public static async render(context: vscode.ExtensionContext, extensionUri: Uri) {

    OBIConfiguration._context = context;
    OBIConfiguration._extensionUri = extensionUri;

    if (OBIConfiguration.currentPanel) {
      // If the webview panel already exists reveal it
      OBIConfiguration.currentPanel._panel.reveal();
      return;
    }

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(extensionUri);

    panel.webview.html = await OBIConfiguration.generate_html(context, extensionUri, panel.webview);
    
    panel.webview.onDidReceiveMessage(this.onReceiveMessage);

    OBIConfiguration.currentPanel = new OBIConfiguration(panel, extensionUri);
  
  }





  private static async generate_html(context: vscode.ExtensionContext, extensionUri: Uri, webview: Webview): Promise<string> {
    const workspaceUri = Workspace.get_workspace_uri();
    const project_config = AppConfig.get_app_config(AppConfig.get_project_app_config(workspaceUri));
    const user_config = AppConfig.get_user_app_config(workspaceUri);

    const config = AppConfig.get_app_config();
    const host = config.connection['remote-host'];
    const user = config.connection['ssh-user'];
    const current_profile = Workspace.get_current_profile() || 'default';

    const error_text = OBITools.check_local_obi();

    const pwd = await context.secrets.get(`obi|${current_profile}|${host}|${user}`);

    const local_source_list: string[] = await LocalSourceList.get_source_list();
    const esp_config_project = new ExtendedSourceProcessingList();
    const esp_config_user = new ExtendedSourceProcessingList(true);
    
    const { panel, panel_tab } = OBIConfiguration.get_ui_state(context);

    const html = render_template('controller/configuration.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "webview", "config.js"]),
        icons: {debug_start: '$(preview)'},
        user_config: user_config,
        project_config: project_config,
        // Never pass the secret itself into the page: only whether one is stored
        ssh_password_stored: pwd !== undefined && pwd.length > 0,
        project_config_file: DirTool.get_encoded_file_URI(Constants.OBI_APP_CONFIG_FILE),
        user_config_file: DirTool.get_encoded_file_URI(AppConfig.get_current_profile_app_config_file()),
        source_config_file: DirTool.get_encoded_file_URI(Constants.OBI_SOURCE_CONFIG_FILE),
        panel: panel,
        panel_tab: panel_tab,
        config_source_list: AppConfig.get_source_configs(),
        error_text: error_text,
        source_list: local_source_list,
        extended_source_processing_list_project: esp_config_project.extended_source_processing || [],
        extended_source_processing_list_user: esp_config_user.extended_source_processing || []
        //filex: encodeURIComponent(JSON.stringify(fileUri)),
        //object_list: this.get_object_list(workspaceUri),
        //compile_list: this.get_compile_list(workspaceUri)
      }
    );

    return html;
  }




  public static async update(): Promise<void> {

    const panel = OBIConfiguration.currentPanel;
    
    if (!panel)
      return;

    panel._panel.webview.html = await OBIConfiguration.generate_html(OBIConfiguration._context, OBIConfiguration._extensionUri, panel._panel.webview);
    
  }



  private static onReceiveMessage(raw: unknown): void {
    try {
      const message = parse_message('Configuration', raw, CONFIGURATION_REQUESTS, text => logger.warn(text));
      if (message)
        OBIConfiguration.handle_message(message);
    }
    catch (e) {
      DirTool.show_save_error(e);
    }
  }



  /** Config of the page section the message comes from */
  private static config_of(target: 'user' | 'project', workspaceUri: Uri): AppConfig {
    return target == 'user' ? AppConfig.get_user_app_config(workspaceUri) : AppConfig.get_project_app_config(workspaceUri);
  }



  private static handle_message(message: ConfigurationRequest): void {

    const workspaceUri =
    Workspace.find_workspace_uri();

    if (!workspaceUri)
      return;

    OBIConfiguration.save_ui_state(OBIConfiguration._context, message.panel, message.panel_tab);

    switch (message.command) {

      case "save_config":
        OBIConfiguration.save_config(message.target == 'user', workspaceUri, message.data);
        break;

      case "save_ssh_password":
        // An empty field means "unchanged"; removing is an explicit action (delete_ssh_password)
        if (message.password.length == 0)
          break;
        OBIConfiguration._context.secrets.store(OBIConfiguration.get_password_key(), message.password);
        break;

      case "delete_ssh_password":
        OBIConfiguration._context.secrets.delete(OBIConfiguration.get_password_key()).then(() => OBIConfiguration.update());
        break;

      case "add_language_attribute": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        if (config.global.settings && config.global.settings.language)
          config.global.settings.language[message.language][message.attribute] = '';

        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "add_language_settings": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        if (config.global.settings && config.global.settings.language)
          config.global.settings.language[message.language] = new ConfigCompileSettings();

        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "add_global_variable": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        if (!config.global.variables)
          config.global.variables = {};
        config.global.variables[message.key] = message.type == 'list' ? message.value.split(/\r?\n/) : message.value;
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "delete_global_variable": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        if (config.global.variables)
          delete config.global.variables[message.key];
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "add_global_cmd": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        config.global.cmds = { ...config.global.cmds, [message.key]: message.value };
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "add_compile_cmd": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        config.global['compile-cmds'] = { ...config.global['compile-cmds'], [message.key]: message.value };
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "add_global_step": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        config.global.steps = { ...config.global.steps, [message.key]: message.value.split('\n') };
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "delete_global_cmd": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        if (config.global.cmds)
          delete config.global.cmds[message.key];
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "delete_compile_cmd": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        if (config.global['compile-cmds'])
          delete config.global['compile-cmds'][message.key];
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "delete_global_step": {
        const config = OBIConfiguration.config_of(message.user_project, workspaceUri);
        if (config.global.steps)
          delete config.global.steps[message.key];
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;
      }

      case "edit_source_config":
        OBISourceConfiguration.render(OBIConfiguration._context, OBIConfiguration._extensionUri, message.source);
        break;

      case "delete_source_config":
        OBIConfiguration.delete_source_config(message.source);
        OBIConfiguration.update();
        break;

      case "add_source_config":
        OBIConfiguration.add_source_config(message.source);
        OBIConfiguration.update();
        break;

      case "reload":
        OBIConfiguration.update();
        break;

      case "add_esp_block": {
        const esp_block = new ExtendedSourceProcessing();
        esp_block.conditions = {"SOURCE_FILE_NAME": ["*"], "TARGET_LIB": ["*"]};
        esp_block.steps = [{add_default_steps: true, properties: {"TARGET_LIB": "PROUZALIB", "JOB_CCSID": "1141"}}];
        const esp_config = new ExtendedSourceProcessingList(message.user_project == 'user');
        esp_config.add_new_esp_block(esp_block);
        OBIConfiguration.update();
        break;
      }

      case "delete_esp_block": {
        const esp_config = new ExtendedSourceProcessingList(message.user_project == 'user');
        esp_config.extended_source_processing.splice(message.index, 1);
        esp_config.save_to_file();
        OBIConfiguration.update();
        break;
      }

      case "delete_esp_step": {
        const esp_config = new ExtendedSourceProcessingList(message.user_project == 'user');
        esp_config.extended_source_processing[message.esp_index]?.steps.splice(message.step_index, 1);
        esp_config.save_to_file();
        OBIConfiguration.update();
        break;
      }

      case "add_esp_step": {
        const esp_config = new ExtendedSourceProcessingList(message.user_project == 'user');
        esp_config.extended_source_processing[message.index]?.steps.push(new Step());
        esp_config.save_to_file();
        OBIConfiguration.update();
        break;
      }

      case "save_esp": {
        const esp_config = new ExtendedSourceProcessingList(message.user_project == 'user', message.data);
        esp_config.save_to_file();
        break;
      }
    }
  }



  /** Last selected tab of the config page. Validated, because the values are rendered into the page. */
  private static get_ui_state(context: vscode.ExtensionContext): { panel: string; panel_tab: string } {
    const panel = context.workspaceState.get<string>('obi.config.panel');
    const panel_tab = context.workspaceState.get<string>('obi.config.panel_tab');
    return {
      panel: panel && /^[a-z_]+$/.test(panel) ? panel : 'project_cfg',
      panel_tab: panel_tab && /^tab-\d+$/.test(panel_tab) ? panel_tab : 'tab-1'
    };
  }


  private static save_ui_state(context: vscode.ExtensionContext, panel: unknown, panel_tab: unknown): void {
    if (typeof panel === 'string' && panel.length > 0 && panel !== context.workspaceState.get('obi.config.panel'))
      context.workspaceState.update('obi.config.panel', panel);
    if (typeof panel_tab === 'string' && panel_tab.length > 0 && panel_tab !== context.workspaceState.get('obi.config.panel_tab'))
      context.workspaceState.update('obi.config.panel_tab', panel_tab);
  }


  /** SecretStorage key of the SSH password of the current profile, host and user (same key as in SSH_Tasks.connect). */
  private static get_password_key(): string {
    const config = AppConfig.get_app_config();
    const current_profile = Workspace.get_current_profile() || 'default';
    return `obi|${current_profile}|${config.connection['remote-host']}|${config.connection['ssh-user']}`;
  }



  private static add_source_config(source: string) {
    const file = path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE);
    const source_configs: SourceConfigList = DirTool.read_toml_strict<SourceConfigList>(file) ?? {};
    source_configs[source] = {"source-cmds": {}, settings: {}, steps: []};
    DirTool.update_toml(file, source_configs);
  }




  private static delete_source_config(source: string) {
    const file = path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE);
    const source_configs: SourceConfigList = DirTool.read_toml_strict<SourceConfigList>(file) ?? {};
    delete source_configs[source];
    DirTool.update_toml(file, source_configs);
  }




  public static save_config(isUser: boolean, workspaceUri: Uri, data: any) {

    // App config
    let toml_file = path.join(workspaceUri.fsPath, Constants.OBI_APP_CONFIG_FILE);
    if (isUser)
      toml_file = path.join(workspaceUri.fsPath, AppConfig.get_current_profile_app_config_file());

    // The config below is read with the lenient reader: make sure it wasn't a file that couldn't be parsed
    DirTool.read_toml_strict(toml_file);

    let new_config: AppConfig;

    if (isUser) {
      new_config = AppConfig.get_user_app_config(Workspace.get_workspace_uri());
    }
    else {
      new_config = AppConfig.get_project_app_config(Workspace.get_workspace_uri());
    }

    // Webview data is validated in onReceiveMessage; internal callers pass AppConfig instances
    if (typeof data['connection'] === 'object' && data['connection'] !== null && !Array.isArray(data['connection'])) {
      Object.assign(new_config.connection, data['connection']);
    }
    const mergeRecursive = (target: any, source: any) => {
      for (const key in source) {
      // TOML tables from smol-toml have no prototype, so call hasOwnProperty via Object.prototype
      if (Object.prototype.hasOwnProperty.call(source, key) && !['__proto__', 'constructor', 'prototype'].includes(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) {
          Object.assign(target, { [key]: {} });
        }
        mergeRecursive(target[key], source[key]);
        } else {
        Object.assign(target, { [key]: source[key] });
        }
      }
      }
    };

    if ('general' in data && typeof data.general === 'object' && data.general !== null) {
      mergeRecursive(new_config.general, data.general);
      //new_config['general'] = data['general'];
    }
    if ('global' in data && typeof data.global === 'object' && data.global !== null) {
      delete new_config.global.variables;
      mergeRecursive(new_config.global, data.global);
      //new_config['global'] = data['global'];
    }
    if (data['global'] && data['global']['variables'])
      new_config.global.variables = data['global']['variables'];
    if (data['global'] && data['global']['cmds'])
      new_config.global.cmds = data['global']['cmds'];
    if (data['global'] && data['global']['steps'])
      new_config.global.steps = data['global']['steps'];
    if (data['global'] && data['global']['compile-cmds'])
      new_config.global['compile-cmds'] = data['global']['compile-cmds'];

    DirTool.update_toml(toml_file, new_config);
    AppConfig.reset();
    vscode.window.showInformationMessage(vscode.l10n.t('Configuration saved'));

    // A configuration that became valid shows the OBI views, without reloading the window
    ProjectState.update().catch((e: unknown) => show_error(vscode.l10n.t('OBI could not be started'), e));

    OBITools.check_local_obi();
}
  

  private static createNewPanel(extensionUri : Uri) {
    return window.createWebviewPanel(
      'obi_config', // Identifies the type of the webview. Used internally
      'OBI config', // Title of the panel displayed to the user
      // The editor column the panel should be displayed in
      ViewColumn.One,
      // Extra panel configurations
      {
        // Enable JavaScript in the webview
        enableScripts: true,
        enableCommandUris: true,
        enableFindWidget: true,
        // Restrict the webview to only load resources from the `out` directory
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "asserts")
        ],
        retainContextWhenHidden: true
      }
    );
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    OBIConfiguration.currentPanel = undefined;

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