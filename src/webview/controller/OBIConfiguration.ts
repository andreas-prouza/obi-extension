import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import path from 'path';
import { Constants } from '../../Constants';
import { OBITools } from '../../utilities/OBITools';
import { AppConfig } from './AppConfig';

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
  public static render(extensionUri: Uri, workspaceUri: Uri) {

    if (OBIConfiguration.currentPanel) {
      // If the webview panel already exists reveal it
      OBIConfiguration.currentPanel._panel.reveal(ViewColumn.One);
      return;
    }

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(extensionUri);
    const project_config = AppConfig.get_project_app_config(workspaceUri);
    const user_config = AppConfig.get_user_app_config(workspaceUri);

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render('controller/configuration.html', 
      {
        global_stuff: OBITools.get_global_stuff(panel.webview, extensionUri),
        main_java_script: getUri(panel.webview, extensionUri, ["out", "config.js"]),
        icons: {debug_start: '$(preview)'},
        user_config: user_config,
        project_config: project_config,
        config_file: DirTool.get_encoded_file_URI(workspaceUri, Constants.OBI_APP_CONFIG_FILE)
        //filex: encodeURIComponent(JSON.stringify(fileUri)),
        //object_list: this.get_object_list(workspaceUri),
        //compile_list: this.get_compile_list(workspaceUri)
      }
    );
    panel.webview.html = html;
    //panel.webview.html = index_html.html;

    panel.webview.onDidReceiveMessage(this.onReceiveMessage);

    OBIConfiguration.currentPanel = new OBIConfiguration(panel, extensionUri);
  
  }



  private static onReceiveMessage(message: any): void {

    const is_user = true;
    const is_project = false;

    const workspaceUri =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri
    : undefined;

    if (!workspaceUri)
      return;

    const command = message.command;

    switch (command) {
      case "user_save":
        OBIConfiguration.save_config(is_user, workspaceUri, message.data);
        break;
      case "project_save":
        OBIConfiguration.save_config(is_project, workspaceUri, message.data);
        break;
    }
    return;
  }


  private static save_config(isUser: boolean, workspaceUri: Uri, data: {}) {

    vscode.window.showInformationMessage('Configuration saved');

    // App config
    let toml_file = path.join(workspaceUri.fsPath, Constants.OBI_APP_CONFIG_FILE);
    if (isUser)
      toml_file = path.join(workspaceUri.fsPath, Constants.OBI_APP_CONFIG_USER_FILE);
    
    DirTool.write_toml(toml_file, data.app);
    
    let shell_config_file = path.join(workspaceUri.fsPath, Constants.OBI_GLOBAL_CONFIG);
    if (isUser)
      shell_config_file = path.join(workspaceUri.fsPath, Constants.OBI_GLOBAL_USER_CONFIG);

    // Shell config
    const shell_config: string[]|undefined = DirTool.get_key_value_file(shell_config_file);
    if (!shell_config)
      return;

    // Replace existing config with new values
    for (let [k, v] of Object.entries(data.global)) {

      let found = false;

      for (let i=0; i < shell_config.length; i++) {

        if (shell_config[i].split('=')[0] == k) {

          // if empty --> remove from list
          if (v.length == 0) {
            shell_config.splice(i, 1);
            break;
          }

          shell_config[i] = `${k}=${v}`;
          found = true;
          break;
        }
      }

      // if not found --> add new entry to list
      if (!found && v.length > 0)
        shell_config.push(`${k}=${v}`);
    }

    DirTool.write_file(shell_config_file, shell_config.join('\n'));
}
  

  private static createNewPanel(extensionUri : Uri) {
    return window.createWebviewPanel(
      'source_list', // Identifies the type of the webview. Used internally
      'Source list', // Title of the panel displayed to the user
      // The editor column the panel should be displayed in
      ViewColumn.One,
      // Extra panel configurations
      {
        // Enable JavaScript in the webview
        enableScripts: true,
        enableCommandUris: true,
        // Restrict the webview to only load resources from the `out` directory
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "asserts")
        ],
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