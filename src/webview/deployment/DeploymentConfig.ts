import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { DirTool } from '../../utilities/DirTool';
import * as path from 'path';
import { Constants } from '../../Constants';
import { OBITools } from '../../utilities/OBITools';
import { Workspace } from '../../utilities/Workspace';
import { I_Releaser } from './I_Releaser';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');



export type Config = {
  "i-releaser": {
    url?: string,
    "default-workflow"?: string,
    "main-branch"?: string,
    "auth-token"?: string
  } 
}





export class DeploymentConfig {

  public static currentPanel: DeploymentConfig | undefined;
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
  public static async render(context: vscode.ExtensionContext) {

    DeploymentConfig._context = context;
    DeploymentConfig._extensionUri = context.extensionUri;

    if (DeploymentConfig.currentPanel) {
      // If the webview panel already exists reveal it
      DeploymentConfig.currentPanel._panel.reveal(ViewColumn.One);
      return;
    }

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(context.extensionUri);

    panel.webview.html = await DeploymentConfig.generate_html(context, context.extensionUri, panel.webview);
    
    panel.webview.onDidReceiveMessage(this.onReceiveMessage);

    DeploymentConfig.currentPanel = new DeploymentConfig(panel, context.extensionUri);
  
  }



  public static get_deployment_config() : Config {
    const toml_file: string = path.join(Workspace.get_workspace(), Constants.DEPLOYMENT_CONFIG_FILE);
    const config: Config|undefined = DirTool.get_toml(toml_file);
    if (!config) {
      return {"i-releaser": {}};
    }
    return config;
  }




  private static async generate_html(context: vscode.ExtensionContext, extensionUri: Uri, webview: Webview): Promise<string> {

    const config = DeploymentConfig.get_deployment_config();

    const auth_token = await context.secrets.get(`obi|deployment|http_auth_token`);

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    
    const html = nunjucks.render('deployment/deployment-config.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "deployment_config.js"]),
        auth_token: auth_token,
        deploy_config: config
      }
    );

    return html;
  }




  public static async update(): Promise<void> {

    const panel = DeploymentConfig.currentPanel;
    
    if (!panel)
      return;

    panel._panel.webview.html = await DeploymentConfig.generate_html(DeploymentConfig._context, DeploymentConfig._extensionUri, DeploymentConfig.currentPanel?._panel.webview);
    
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

      case "save":
        DeploymentConfig.save_config(message.data);
        break;

      case "reload":
        DeploymentConfig.update();
        break;

    }
    return;
  }



  private static save_config(data : Config) {

    const toml_file: string = path.join(Workspace.get_workspace(), Constants.DEPLOYMENT_CONFIG_FILE);
    data['i-releaser']['auth-token']
    OBITools.ext_context.secrets.store('obi|deployment|http_auth_token', data['i-releaser']['auth-token'] || '');
    delete data['i-releaser']['auth-token'];
    DirTool.write_toml(toml_file, data);
    I_Releaser.refresh();

  }



  private static createNewPanel(extensionUri : Uri) {
    return window.createWebviewPanel(
      'obi_deployment_config', // Identifies the type of the webview. Used internally
      'i-Releaser config', // Title of the panel displayed to the user
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
    DeploymentConfig.currentPanel = undefined;

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