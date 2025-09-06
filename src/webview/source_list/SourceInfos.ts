import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import * as path from 'path';
import { Constants } from '../../Constants';
import { OBITools } from '../../utilities/OBITools';
import { AppConfig, ConfigCompileSettings } from '../controller/AppConfig';
import { Workspace } from '../../utilities/Workspace';
import * as source from '../../obi/Source';
import { SourceListProvider } from './SourceListProvider';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');




export class SourceInfos {

  public static currentPanel: SourceInfos|undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private static _context: vscode.ExtensionContext;
  private static _extensionUri: Uri;
  private static _edit_infos: boolean;
  public static source_list_file: string;



  /**
   * The ComponentGalleryPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: WebviewPanel, extensionUri: Uri) {
    this._panel = panel;
    SourceInfos._extensionUri = extensionUri;

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
  public static async render(context: vscode.ExtensionContext, edit_infos: boolean) {

    SourceInfos._context = context;
    SourceInfos._edit_infos = edit_infos;

    if (SourceInfos.currentPanel) {
      // If the webview panel already exists reveal it
      SourceInfos.currentPanel._panel.dispose();
    }

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(context.extensionUri);
    panel.webview.html = await SourceInfos.generate_html(context.extensionUri, panel.webview);
    
    panel.webview.onDidReceiveMessage(this.onReceiveMessage);

    SourceInfos.currentPanel = new SourceInfos(panel, context.extensionUri);
  
  }



  private static async generate_html(extensionUri: Uri, webview: Webview): Promise<string> {

    const config = AppConfig.get_app_config();
    let html_template = 'source_list/source-infos-view.html';
    if (SourceInfos._edit_infos) {
      html_template = 'source_list/source-infos-config.html';
    }

    const sources = await OBITools.get_local_sources();
    const source_list: source.IQualifiedSource[] = OBITools.get_extended_source_infos(sources)||[];

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "source_infos.js"]),
        source_list: source_list,
        source_info_file: DirTool.get_encoded_file_URI(config.general['source-infos'])
      }
    );

    return html;
  }




  public static async update(): Promise<void> {

    const panel = SourceInfos.currentPanel;
    
    if (!panel)
      return;

    //panel._panel.webview.html = await SourceInfos.generate_html(SourceInfos._extensionUri, SourceInfos.currentPanel?._panel.webview);
    SourceListProvider.source_list_provider.refresh();
  }



  private static onReceiveMessage(message: any): void {

    const config: AppConfig = AppConfig.get_app_config();

    const workspaceUri =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri
    : undefined;

    if (!workspaceUri)
      return;

    const command = message.command;

    switch (command) {

      case "save_config":
        SourceInfos.save_infos(message.data);
        SourceInfos.update();
        break;

    }
    return;
  }



  private static save_infos(sources: source.ISourceInfos) {

    const json_file: string = path.join(Workspace.get_workspace(), AppConfig.get_app_config().general['source-infos']||'.obi/etc/source-infos.json');
    let source_infos: source.ISourceInfos = DirTool.get_json(json_file) || [];

    for (const [k, v] of Object.entries(sources)) {
      source_infos[k] = v;
    }

    DirTool.write_file(json_file, JSON.stringify(source_infos, undefined, 2));
  }



  private static createNewPanel(extensionUri : Uri) {
    return window.createWebviewPanel(
      'obi_source_infos_config', // Identifies the type of the webview. Used internally
      'OBI Source infos', // Title of the panel displayed to the user
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
    SourceInfos.currentPanel = undefined;

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