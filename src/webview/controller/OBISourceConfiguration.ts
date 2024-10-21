import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import path from 'path';
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
      // If the webview panel already exists reveal it
      OBISourceConfiguration.currentPanel._panel.reveal(ViewColumn.One);
      return;
    }

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(extensionUri);

    panel.webview.html = await OBISourceConfiguration.generate_html(extensionUri, panel.webview);
    
    panel.webview.onDidReceiveMessage(this.onReceiveMessage);

    OBISourceConfiguration.currentPanel = new OBISourceConfiguration(panel, extensionUri);
  
  }





  private static async generate_html(extensionUri: Uri, webview: Webview): Promise<string> {

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);

    const source_configs: SourceConfigList|undefined = AppConfig.get_source_configs();

    let source_config: SourceConfig|undefined;
    
    if (source_configs)
      source_config = source_configs[OBISourceConfiguration.source_config];
    
    const html = nunjucks.render('controller/config_source_details.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "source_config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "source_config.js"]),
        icons: {debug_start: '$(preview)'},
        source: OBISourceConfiguration.source_config,
        config_source_list: source_config
      }
    );

    return html;
  }




  public static async update(): Promise<void> {

    const panel = OBISourceConfiguration.currentPanel;
    
    if (!panel)
      return;

    panel._panel.webview.html = await OBISourceConfiguration.generate_html(OBISourceConfiguration._context, OBISourceConfiguration._extensionUri, OBISourceConfiguration.currentPanel?._panel.webview);
    
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

      case "user_save":
        break;

      case "reload":
        
        OBISourceConfiguration.update();
    }
    return;
  }



  private static save_config(isUser: boolean, workspaceUri: Uri, data: {}) {

    vscode.window.showInformationMessage('Configuration saved');

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