import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../extension/utilities/getUri";
import { DirTool } from '../../extension/utilities/DirTool';
import { normalize_source_name } from '../../extension/utilities/SourcePath';
import { logger } from '../../extension/utilities/Logger';
import * as path from 'path';
import { Constants } from '../../shared/Constants';
import { OBITools } from '../../extension/utilities/OBITools';
import { AppConfig, SourceConfig, SourceConfigList } from '../../extension/config/AppConfig';
import { Workspace } from '../../extension/utilities/Workspace';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';
import { Dependencies, DependencyList } from '../../extension/obi/Dependency';
import { SOURCE_DEPENDENCY_REQUESTS } from '../../shared/messages/SourceConfigMessages';
import { parse_message } from '../../shared/messages/MessageGuard';
import { render_template } from '../Templates';




export class OBISourceDependency {

  public static currentPanel: OBISourceDependency | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private static _context: vscode.ExtensionContext;
  private static _extensionUri: Uri;
  public static source: string;



  /**
   * The ComponentGalleryPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: WebviewPanel, extensionUri: Uri) {
    this._panel = panel;

    LocalSourceList.load_source_list();
    
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

    OBISourceDependency._context = context;
    OBISourceDependency._extensionUri = extensionUri;
    OBISourceDependency.source = normalize_source_name(source_config);
    if (OBISourceDependency.source !== source_config)
      logger.warn(`Source name '${source_config}' is not in the form lib/file/member`);

    if (OBISourceDependency.currentPanel) {
      OBISourceDependency.currentPanel.dispose();
    }


    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(extensionUri);

    panel.webview.html = await OBISourceDependency.generate_html(extensionUri, panel.webview);
    
    panel.webview.onDidReceiveMessage(this.onReceiveMessage);

    OBISourceDependency.currentPanel = new OBISourceDependency(panel, extensionUri);
  
  }





  private static async generate_html(extensionUri: Uri, webview: Webview): Promise<string> {

    const source_configs: SourceConfigList|undefined = AppConfig.get_source_configs();
    let source_config: SourceConfig|undefined;
    
    if (source_configs)
      source_config = source_configs[OBISourceDependency.source];

    const local_source_list: string[] = await LocalSourceList.get_source_list();
    const dependencies: Dependencies = await DependencyList.get_dependencies();
    let dependencies_1: string[] = [];
    let dependencies_2: string[] = [];

    for (const dep of dependencies[OBISourceDependency.source] || []) {
      dependencies_1.push({"source": dep, "file": DirTool.get_encoded_source_URI(dep)} as any);
    }

    for (const [source, deps] of Object.entries(dependencies)) {
      if (deps.includes(OBISourceDependency.source)) {
        dependencies_2.push({"source": source, "file": DirTool.get_encoded_source_URI(source)} as any);
      }
    }
    
    const html = render_template('source_list/maintain-source-dependency.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "webview", "source_dependency.js"]),
        icons: {debug_start: '$(preview)'},
        source: OBISourceDependency.source,
        source_list: local_source_list,
        dependency_list_1: dependencies_1,
        dependency_list_2: dependencies_2,
        source_file: DirTool.get_encoded_source_URI(OBISourceDependency.source),
        source_config_file: DirTool.get_encoded_file_URI(Constants.OBI_SOURCE_CONFIG_FILE),
        source_config: source_config
      }
    );

    return html;
  }




  public static async update(): Promise<void> {

    const panel = OBISourceDependency.currentPanel;
    
    if (!panel)
      return;

    panel._panel.webview.html = await OBISourceDependency.generate_html(OBISourceDependency._extensionUri, panel._panel.webview);
    
  }



  private static onReceiveMessage(raw: unknown): void {

    const message = parse_message('Source dependency', raw, SOURCE_DEPENDENCY_REQUESTS, text => logger.warn(text));
    if (!message)
      return;

    const workspaceUri =
    Workspace.find_workspace_uri();

    if (!workspaceUri)
      return;

    switch (message.command) {

      case "add_dependency_1":
        DependencyList.add_dependency(OBISourceDependency.source, 1, message.source).catch(DirTool.show_save_error);
        break;

      case "add_dependency_2":
        DependencyList.add_dependency(OBISourceDependency.source, 2, message.source).catch(DirTool.show_save_error);
        break;

      case "delete_dependency_1":
        DependencyList.delete_dependency(OBISourceDependency.source, 1, message.source).catch(DirTool.show_save_error);
        break;

      case "delete_dependency_2":
        DependencyList.delete_dependency(OBISourceDependency.source, 2, message.source).catch(DirTool.show_save_error);
        break;

      case "reload":
        OBISourceDependency.update();
        break;
    }
    return;
  }


  private static createNewPanel(extensionUri : Uri) {
    return window.createWebviewPanel(
      'obi_source_dependency', // Identifies the type of the webview. Used internally
      'OBI source dependency', // Title of the panel displayed to the user
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
    OBISourceDependency.currentPanel = undefined;

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