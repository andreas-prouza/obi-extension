import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import * as path from 'path';
import { Constants } from '../../Constants';
import { OBITools } from '../../utilities/OBITools';
import { AppConfig, ConfigCompileSettings, SourceConfigList } from './AppConfig';
import { Workspace } from '../../utilities/Workspace';
import { logger } from '../../utilities/Logger';
import { OBISourceConfiguration } from './OBISourceConfiguration';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');




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
      OBIConfiguration.currentPanel._panel.reveal(ViewColumn.One);
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

    const error_text = AppConfig.self_check();

    const pwd = await context.secrets.get(`obi|${host}|${user}`);

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    
    const html = nunjucks.render('controller/configuration.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "config.js"]),
        icons: {debug_start: '$(preview)'},
        user_config: user_config,
        project_config: project_config,
        SSH_PASSWORD: pwd,
        project_config_file: DirTool.get_encoded_file_URI(Constants.OBI_APP_CONFIG_FILE),
        user_config_file: DirTool.get_encoded_file_URI(AppConfig.get_current_profile_app_config_file()),
        source_config_file: DirTool.get_encoded_file_URI(Constants.OBI_SOURCE_CONFIG_FILE),
        panel: await context.secrets.get('obi|config|panel'),
        panel_tab: await context.secrets.get('obi|config|panel_tab'),
        config_source_list: AppConfig.get_source_configs(),
        error_text: error_text
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

    panel._panel.webview.html = await OBIConfiguration.generate_html(OBIConfiguration._context, OBIConfiguration._extensionUri, OBIConfiguration.currentPanel?._panel.webview);
    
  }



  private static onReceiveMessage(message: any): void {

    const is_user = true;
    const is_project = false;
    let config: AppConfig;
    let lang: string;
    let attr: string;

    const workspaceUri =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri
    : undefined;

    if (!workspaceUri)
      return;

    if (message.panel)
      OBIConfiguration._context.secrets.store('obi|config|panel', message.panel);
    if (message.panel_tab)
      OBIConfiguration._context.secrets.store('obi|config|panel_tab', message.panel_tab);

    const command = message.command;

    switch (command) {

      case "user_save":
        OBIConfiguration.save_config(is_user, workspaceUri, message.data);
        break;

      case "project_save":
        OBIConfiguration.save_config(is_project, workspaceUri, message.data);
        break;

      case "save_ssh_password":
        config = AppConfig.get_app_config();
        const host = config['connection']['remote-host'];
        const user = config['connection']['ssh-user'];
        OBIConfiguration._context.secrets.delete(`obi|${host}|${user}`);
        if (message.password.length > 0)
          OBIConfiguration._context.secrets.store(`obi|${host}|${user}`, message.password);
        break;

      case "add_language_attribute":
        lang = message.language;
        attr = message.attribute;

        if(message.user_project == 'user')
          config = AppConfig.get_user_app_config(workspaceUri);
        else
          config = AppConfig.get_project_app_config(workspaceUri);

        if (config.global.settings && config.global.settings.language)
          config.global.settings.language[lang][attr] = '';

        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;

      case "add_language_settings":
        lang = message.language;
        attr = message.attribute;

        if(message.user_project == 'user')
          config = AppConfig.get_user_app_config(workspaceUri);
        else
          config = AppConfig.get_project_app_config(workspaceUri);

        if (config.global.settings && config.global.settings.language)
          config.global.settings.language[lang] = new ConfigCompileSettings();

        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;

      case "add_global_cmd":
      case "save_global_cmd":

        if(message.user_project == 'user')
          config = AppConfig.get_user_app_config(workspaceUri);
        else
          config = AppConfig.get_project_app_config(workspaceUri);
        config.global.cmds[message.key]=message.value;
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;

      case "add_compile_cmd":
      case "save_compile_cmd":

        if(message.user_project == 'user')
          config = AppConfig.get_user_app_config(workspaceUri);
        else
          config = AppConfig.get_project_app_config(workspaceUri);
        config.global['compile-cmds'][message.key]=message.value;
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;

      case "add_global_step":
      case "save_global_step":

        if(message.user_project == 'user')
          config = AppConfig.get_user_app_config(workspaceUri);
        else
          config = AppConfig.get_project_app_config(workspaceUri);
        config.global.steps[message.key]=message.value.split('\n');
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;

      case "delete_global_cmd":

        if(message.user_project == 'user')
          config = AppConfig.get_user_app_config(workspaceUri);
        else
          config = AppConfig.get_project_app_config(workspaceUri);
        delete config.global.cmds[message.key];
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;

      case "delete_compile_cmd":

        if(message.user_project == 'user')
          config = AppConfig.get_user_app_config(workspaceUri);
        else
          config = AppConfig.get_project_app_config(workspaceUri);
        delete config.global['compile-cmds'][message.key];
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;

      case "delete_global_step":

        if(message.user_project == 'user')
          config = AppConfig.get_user_app_config(workspaceUri);
        else
          config = AppConfig.get_project_app_config(workspaceUri);
        delete config.global.steps[message.key];
        OBIConfiguration.save_config(message.user_project == 'user', workspaceUri, config);
        break;

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

    }
    return;
  }



  private static add_source_config(source: string) {
    let source_configs: SourceConfigList = AppConfig.get_source_configs() || {};
    source_configs[source] = {"compile-cmds": [], settings: {}, steps: []};
    DirTool.write_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE), source_configs);
  }




  private static delete_source_config(source: string) {
    let source_configs: SourceConfigList = AppConfig.get_source_configs() || {};
    delete source_configs[source];
    DirTool.write_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE), source_configs);
  }




  private static save_config(isUser: boolean, workspaceUri: Uri, data: {}) {

    vscode.window.showInformationMessage('Configuration saved');
    const app_config: AppConfig = AppConfig.get_app_config();
    const missing_configs = app_config.attributes_missing();
    let new_config: AppConfig;

    if (isUser) {
      new_config = AppConfig.get_user_app_config(Workspace.get_workspace_uri());
    }
    else {
      new_config = AppConfig.get_project_app_config(Workspace.get_workspace_uri());
    }

    new_config.connection = data['connection'];
    new_config.general = data['general'];
    if (data['global'] && data['global']['settings'])
      new_config.global.settings = data['global']['settings'];
    if (data['global'] && data['global']['cmds'])
      new_config.global.cmds = data['global']['cmds'];
    if (data['global'] && data['global']['steps'])
      new_config.global.steps = data['global']['steps'];
    if (data['global'] && data['global']['compile-cmds'])
      new_config.global['compile-cmds'] = data['global']['compile-cmds'];

    // App config
    let toml_file = path.join(workspaceUri.fsPath, Constants.OBI_APP_CONFIG_FILE);
    if (isUser)
      toml_file = path.join(workspaceUri.fsPath, AppConfig.get_current_profile_app_config_file());
    
    DirTool.write_toml(toml_file, new_config);
    AppConfig.reset();

    if (missing_configs && !AppConfig.get_app_config().attributes_missing())
      vscode.commands.executeCommand('workbench.action.reloadWindow');

    AppConfig.self_check();
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