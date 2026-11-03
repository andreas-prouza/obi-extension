import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../extension/utilities/getUri";
import { DirTool } from '../../extension/utilities/DirTool';
import * as path from 'path';
import { Constants } from '../../shared/Constants';
import { OBITools } from '../../extension/utilities/OBITools';
import { AppConfig } from '../../extension/config/AppConfig';
import { Workspace } from '../../extension/utilities/Workspace';
import * as source from '../../shared/Source';
import { SourceListProvider } from './SourceListProvider';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';
import { SOURCE_INFOS_REQUESTS } from '../../shared/messages/SourceListMessages';
import { parse_message } from '../../shared/messages/MessageGuard';
import { logger } from '../../extension/utilities/Logger';
import { render_template } from '../Templates';





export class SourceInfos {

  public static currentPanel: SourceInfos|undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private static _context: vscode.ExtensionContext;
  private static _extensionUri: Uri;
  private static _edit_infos: boolean;
  public static source_list_file: string;

  private static source_list_infos: source.ISourceInfos|undefined = undefined;
  private static loadPromise: Promise<void> | undefined = undefined;


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

    // The new panel opens where the old one was (the user may have moved it to another editor group)
    const column = SourceInfos.currentPanel?._panel.viewColumn;
    SourceInfos.currentPanel?._panel.dispose();

    const panel = this.createNewPanel(context.extensionUri, column);
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

    const sources = await LocalSourceList.get_local_sources();
    const source_list: source.IQualifiedSource[] = await LocalSourceList.get_extended_source_infos(sources)||[];

    const html = render_template(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "webview", "source_infos.js"]),
        source_list: source_list,
        source_info_file: DirTool.get_encoded_file_URI(config.general['source-infos'] ?? Constants.SOURCE_INFOS)
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



  private static onReceiveMessage(raw: unknown): void {

    const message = parse_message('Source infos', raw, SOURCE_INFOS_REQUESTS, text => logger.warn(text));
    if (!message)
      return;

    const config: AppConfig = AppConfig.get_app_config();

    const workspaceUri =
    Workspace.find_workspace_uri();

    if (!workspaceUri)
      return;

    const command = message.command;

    switch (command) {

      case "save_config":
        try {
          SourceInfos.save_infos(message.data);
        }
        catch (e) {
          DirTool.show_save_error(e);
        }
        SourceInfos.update();
        break;

    }
    return;
  }



  private static save_infos(sources: source.ISourceInfos) {

    const json_file: string = path.join(Workspace.get_workspace(), AppConfig.get_app_config().general['source-infos']||'.obi/etc/source-infos.json');
    const current = DirTool.read_json_strict<source.ISourceInfos>(json_file);
    // Older versions created the file as '[]': string keys on an array are dropped by JSON.stringify
    const source_infos: source.ISourceInfos = current && !Array.isArray(current) ? current : {};

    for (const [k, v] of Object.entries(sources)) {
      source_infos[k] = v;
    }

    DirTool.update_json(json_file, source_infos);
  }



  private static createNewPanel(extensionUri : Uri, column: ViewColumn = ViewColumn.One) {
    return window.createWebviewPanel(
      'obi_source_infos_config', // Identifies the type of the webview. Used internally
      'OBI Source infos', // Title of the panel displayed to the user
      // The editor column the panel should be displayed in
      column,
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