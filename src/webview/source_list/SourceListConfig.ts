import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import path from 'path';
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




export class SourceListConfig {

  public static currentPanel: SourceListConfig;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private static _context: vscode.ExtensionContext;
  private static _extensionUri: Uri;
  public static source_list_file: string;



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
  public static async render(context: vscode.ExtensionContext, source_list_file: string) {

    const extensionUri = context.extensionUri;
    SourceListConfig._context = context;
    SourceListConfig._extensionUri = extensionUri;
    SourceListConfig.source_list_file = source_list_file;

    if (SourceListConfig.currentPanel) {
      // If the webview panel already exists reveal it
      SourceListConfig.currentPanel._panel.dispose();
    }

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(extensionUri);
    panel.webview.html = await SourceListConfig.generate_html(extensionUri, panel.webview);
    
    panel.webview.onDidReceiveMessage(this.onReceiveMessage);

    SourceListConfig.currentPanel = new SourceListConfig(panel, extensionUri);
  
  }



  private static async generate_html(extensionUri: Uri, webview: Webview): Promise<string> {

    const config = AppConfig.get_app_confg();

    const source_list: source.IQualifiedSource[] = DirTool.get_json(path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, SourceListConfig.source_list_file)) || [];

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render('source_list/source-filter-config.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "source_list_config.js"]),
        source_list: source_list,
        source_list_file: SourceListConfig.source_list_file.replace('.json', ''),
        icons: {trash: "${trash}"}
      }
    );

    return html;
  }




  public static async update(): Promise<void> {

    const panel = SourceListConfig.currentPanel;
    
    if (!panel)
      return;

    panel._panel.webview.html = await SourceListConfig.generate_html(SourceListConfig._extensionUri, SourceListConfig.currentPanel?._panel.webview);
    SourceListProvider.source_list_provider.refresh();
  }



  private static onReceiveMessage(message: any): void {

    const config: AppConfig = AppConfig.get_app_confg();

    const workspaceUri =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri
    : undefined;

    if (!workspaceUri)
      return;

    const command = message.command;

    switch (command) {

      case "save_config":
        SourceListConfig.save_filter(message.data);
        SourceListConfig.update();
        break;

      case "delete_filter":
        SourceListConfig.delete_filter(message.lib, message.file, message.member);
        SourceListConfig.update();
        break;

      case "add_filter":
        SourceListConfig.add_filter(message.lib, message.file, message.member, message.regex);
        SourceListConfig.update();
        break;
    }
    return;
  }



  private static delete_filter(lib: string, file: string, member: string) {

    const json_file: string = path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, SourceListConfig.source_list_file);
    const sl: source.IQualifiedSource[] = DirTool.get_json(json_file) || [];

    for (let i=0; i<sl.length; i++) {
      if (sl[i]['source-lib'] == lib && sl[i]['source-file'] == file && sl[i]['source-member'] == member) {
        sl.splice(i, 1);
        i--;
      }
    }

    DirTool.write_file(json_file, JSON.stringify(sl, undefined, 2));
  }


  private static add_filter(lib: string, file: string, member: string, regex: boolean) {

    const json_file: string = path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, SourceListConfig.source_list_file);
    const sl: source.IQualifiedSource[] = DirTool.get_json(json_file) || [];

    // check if it already exist
    for (let i=0; i<sl.length; i++) {
      if (sl[i]['source-lib'] == lib && sl[i]['source-file'] == file && sl[i]['source-member'] == member) {
        return;
      }
    }

    sl.push({"source-lib": lib, "source-file": file, "source-member": member, 'use-regex': regex});

    DirTool.write_file(json_file, JSON.stringify(sl, undefined, 2));
  }


  private static save_filter(filter: source.IQualifiedSource[]) {

    const json_file: string = path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, SourceListConfig.source_list_file);

    DirTool.write_file(json_file, JSON.stringify(filter, undefined, 2));
  }



  private static createNewPanel(extensionUri : Uri) {
    return window.createWebviewPanel(
      'obi_filter_config', // Identifies the type of the webview. Used internally
      'OBI filter config', // Title of the panel displayed to the user
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
    SourceListConfig.currentPanel = undefined;

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