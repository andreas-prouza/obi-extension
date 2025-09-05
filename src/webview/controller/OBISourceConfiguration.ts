import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import * as path from 'path';
import { Constants } from '../../Constants';
import { OBITools } from '../../utilities/OBITools';
import { AppConfig, ConfigCompileSettings, SourceConfig, SourceConfigList } from './AppConfig';
import { Workspace } from '../../utilities/Workspace';
import { logger } from '../../utilities/Logger';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');
// configure() returns an Environment
const env = nunjucks.configure(Constants.HTML_TEMPLATE_DIR);

// Register "typename" filter on the environment
env.addFilter("typename", (obj: any) => {
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";

  // If it's a class instance or built-in
  if (obj.constructor && obj.constructor.name) {
    return obj.constructor.name;
  }

  // Fallback
  return typeof obj;
});



export class OBISourceConfiguration {

  public static currentPanel: OBISourceConfiguration | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private static _context: vscode.ExtensionContext;
  private static _extensionUri: Uri;
  public static source_config: string;



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
  public static async render(context: vscode.ExtensionContext, extensionUri: Uri, source_config: string) {

    OBISourceConfiguration._context = context;
    OBISourceConfiguration._extensionUri = extensionUri;
    OBISourceConfiguration.source_config = source_config;

    if (OBISourceConfiguration.currentPanel) {
      OBISourceConfiguration.currentPanel.dispose();
    }
    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(extensionUri);

    panel.webview.html = await OBISourceConfiguration.generate_html(extensionUri, panel.webview);
    
    panel.webview.onDidReceiveMessage(this.onReceiveMessage);

    OBISourceConfiguration.currentPanel = new OBISourceConfiguration(panel, extensionUri);
  
  }





  private static async generate_html(extensionUri: Uri, webview: Webview): Promise<string> {

    const source_configs: SourceConfigList|undefined = AppConfig.get_source_configs();
    const config: AppConfig = AppConfig.get_app_confg();

    let source_config: SourceConfig|undefined;
    
    if (source_configs)
      source_config = source_configs[OBISourceConfiguration.source_config];
    
    const html = env.render('controller/config_source_details.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "source_config.js"]),
        icons: {debug_start: '$(preview)'},
        source: OBISourceConfiguration.source_config,
        source_file: DirTool.get_encoded_file_URI(path.join(config.general['source-dir']||'src', OBISourceConfiguration.source_config)),
        source_config_file: DirTool.get_encoded_file_URI(Constants.OBI_SOURCE_CONFIG_FILE),
        source_config: source_config
      }
    );

    return html;
  }




  public static async update(): Promise<void> {

    const panel = OBISourceConfiguration.currentPanel;
    
    if (!panel)
      return;

    panel._panel.webview.html = await OBISourceConfiguration.generate_html(OBISourceConfiguration._extensionUri, OBISourceConfiguration.currentPanel?._panel.webview);
    
  }



  private static onReceiveMessage(message: any): void {

    const workspaceUri =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri
    : undefined;

    if (!workspaceUri)
      return;

    const command = message.command;

    switch (command) {

      case "add_source_cmd":
        OBISourceConfiguration.add_source_cmd(message.key, message.value);
        break;

      case "delete_source_cmd":
        OBISourceConfiguration.delete_source_cmd(message.key);
        break;

      case "add_source_setting":

        switch(message.type) {
          case "list":
            message.value = message.value.split(/\r?\n/);
            break;
        }
        OBISourceConfiguration.add_source_setting(message.key, message.value);
        break;

      case "delete_source_setting":
        OBISourceConfiguration.delete_source_setting(message.key);
        break;

      case "save_config":
        OBISourceConfiguration.save_config(message.settings, message.source_cmds, message.steps);
        break;

      case "reload":
        OBISourceConfiguration.update();
        break;
    }
    return;
  }



  private static delete_source_setting(key:string) {
    let source_configs: SourceConfigList|undefined = AppConfig.get_source_configs();
    const source_name:string = OBISourceConfiguration.source_config;

    if (source_configs && source_configs[source_name] && source_configs[source_name].settings){
      delete source_configs[source_name].settings[key];
    }

    DirTool.write_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE), source_configs || {});
  }



  private static delete_source_cmd(key:string) {
    let source_configs: SourceConfigList|undefined = AppConfig.get_source_configs();
    const source_name:string = OBISourceConfiguration.source_config;

    if (source_configs && source_configs[source_name] && source_configs[source_name]['source-cmds']){
      delete source_configs[source_name]['source-cmds'][key];
    }

    DirTool.write_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE), source_configs || {});
  }



  private static add_source_cmd(key:string, value:string) {
    let source_configs: SourceConfigList|undefined = AppConfig.get_source_configs();
    let source_config: SourceConfig = {"source-cmds": {key: value}, settings: {}, steps: []};
    const source_name:string = OBISourceConfiguration.source_config;

    if (!source_configs || !source_configs[source_name]){
      source_configs = {source_name : source_config};
    }
    else {
      if (!source_configs[source_name]['source-cmds']) {
        source_configs[source_name]['source-cmds'] = {};
      }

      source_configs[source_name]['source-cmds'][key] = value;
    }

    DirTool.write_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE), source_configs);
  }



  private static add_source_setting(key:string, value:string) {
    let source_configs: SourceConfigList|undefined = AppConfig.get_source_configs();
    let source_config: SourceConfig = {"source-cmds": {}, settings: {key: value}, steps: []};
    const source_name:string = OBISourceConfiguration.source_config;

    if (!source_configs || !source_configs[source_name]){
      source_configs = {source_name : source_config};
    }
    else {
      if (!source_configs[source_name].settings) {
        source_configs[source_name].settings = {};
      }

      source_configs[source_name].settings[key] = value;
    }

    DirTool.write_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE), source_configs);
  }



  private static save_config(settings:{}, source_cmds:{}, steps:string[]) {

    let source_configs: SourceConfigList|undefined = AppConfig.get_source_configs();
    let source_config: SourceConfig = {"source-cmds": source_cmds, settings: settings, steps: steps};
    const source_name:string = OBISourceConfiguration.source_config;

    if (!source_configs)
      source_configs = {source_name : source_config};
    else
      source_configs[source_name] = source_config;

    DirTool.write_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE), source_configs);

    vscode.window.showInformationMessage('Source configuration saved');

}



  private static createNewPanel(extensionUri : Uri) {
    return window.createWebviewPanel(
      'obi_source_config', // Identifies the type of the webview. Used internally
      'OBI source config', // Title of the panel displayed to the user
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
    OBISourceConfiguration.currentPanel = undefined;

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