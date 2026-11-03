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
import { SOURCE_CONFIG_REQUESTS } from '../../shared/messages/SourceConfigMessages';
import { parse_message } from '../../shared/messages/MessageGuard';
import { render_template } from '../Templates';




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
    OBISourceConfiguration.source_config = normalize_source_name(source_config);
    if (OBISourceConfiguration.source_config !== source_config)
      logger.warn(`Source name '${source_config}' is not in the form lib/file/member`);

    // The new panel opens where the old one was (the user may have moved it to another editor group)
    const column = OBISourceConfiguration.currentPanel?._panel.viewColumn;
    OBISourceConfiguration.currentPanel?.dispose();

    const panel = this.createNewPanel(extensionUri, column);

    panel.webview.html = await OBISourceConfiguration.generate_html(extensionUri, panel.webview);
    
    panel.webview.onDidReceiveMessage(this.onReceiveMessage);

    OBISourceConfiguration.currentPanel = new OBISourceConfiguration(panel, extensionUri);
  
  }





  private static async generate_html(extensionUri: Uri, webview: Webview): Promise<string> {

    const source_configs: SourceConfigList|undefined = AppConfig.get_source_configs();
    let source_config: SourceConfig|undefined;
    
    if (source_configs)
      source_config = source_configs[OBISourceConfiguration.source_config];
    
    const html = render_template('controller/config_source_details.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "webview", "source_config.js"]),
        icons: {debug_start: '$(preview)'},
        source: OBISourceConfiguration.source_config,
        source_file: DirTool.get_encoded_source_URI(OBISourceConfiguration.source_config),
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

    panel._panel.webview.html = await OBISourceConfiguration.generate_html(OBISourceConfiguration._extensionUri, panel._panel.webview);
    
  }



  private static onReceiveMessage(raw: unknown): void {

    const message = parse_message('Source config', raw, SOURCE_CONFIG_REQUESTS, text => logger.warn(text));
    if (!message)
      return;

    const workspaceUri =
    Workspace.find_workspace_uri();

    if (!workspaceUri)
      return;

    try {
      switch (message.command) {

        case "add_source_cmd":
          OBISourceConfiguration.add_source_cmd(message.key, message.value);
          break;

        case "delete_source_cmd":
          OBISourceConfiguration.delete_source_cmd(message.key);
          break;

        case "add_source_setting":
          OBISourceConfiguration.add_source_setting(message.key, message.type == 'list' ? message.value.split(/\r?\n/) : message.value);
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
    }
    catch (e) {
      DirTool.show_save_error(e);
    }
    return;
  }



  private static source_config_file(): string {
    return path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE);
  }


  /** source-config.toml as stored; {} if it doesn't exist. Throws ConfigFileError if it can't be parsed. */
  private static read_source_configs(): SourceConfigList {
    return DirTool.read_toml_strict<SourceConfigList>(OBISourceConfiguration.source_config_file()) ?? {};
  }


  /** The entry of the current source, created if missing. */
  private static current_entry(source_configs: SourceConfigList): SourceConfig {
    const source_name: string = OBISourceConfiguration.source_config;
    if (!source_configs[source_name])
      source_configs[source_name] = {"source-cmds": {}, settings: {}, steps: []};
    return source_configs[source_name];
  }



  private static delete_source_setting(key:string) {
    const source_configs = OBISourceConfiguration.read_source_configs();
    const entry = source_configs[OBISourceConfiguration.source_config];

    if (entry && entry.settings){
      delete entry.settings[key];
    }

    DirTool.update_toml(OBISourceConfiguration.source_config_file(), source_configs);
  }



  private static delete_source_cmd(key:string) {
    const source_configs = OBISourceConfiguration.read_source_configs();
    const entry = source_configs[OBISourceConfiguration.source_config];

    if (entry && entry['source-cmds']){
      delete entry['source-cmds'][key];
    }

    DirTool.update_toml(OBISourceConfiguration.source_config_file(), source_configs);
  }



  private static add_source_cmd(key:string, value:string) {
    const source_configs = OBISourceConfiguration.read_source_configs();
    const entry = OBISourceConfiguration.current_entry(source_configs);

    entry['source-cmds'] = { ...(entry['source-cmds'] ?? {}), [key]: value };

    DirTool.update_toml(OBISourceConfiguration.source_config_file(), source_configs);
  }



  private static add_source_setting(key:string, value: string | string[]) {
    const source_configs = OBISourceConfiguration.read_source_configs();
    const entry = OBISourceConfiguration.current_entry(source_configs);

    entry.settings = { ...(entry.settings ?? {}), [key]: value };

    DirTool.update_toml(OBISourceConfiguration.source_config_file(), source_configs);
  }



  private static save_config(settings: Record<string, string | string[]>, source_cmds: Record<string, string>, steps:string[]) {

    const source_configs = OBISourceConfiguration.read_source_configs();
    source_configs[OBISourceConfiguration.source_config] = {"source-cmds": source_cmds, settings: settings, steps: steps};

    DirTool.update_toml(OBISourceConfiguration.source_config_file(), source_configs);

    vscode.window.showInformationMessage(vscode.l10n.t('Source configuration saved'));

}



  private static createNewPanel(extensionUri : Uri, column: ViewColumn = ViewColumn.One) {
    return window.createWebviewPanel(
      'obi_source_config', // Identifies the type of the webview. Used internally
      'OBI source config', // Title of the panel displayed to the user
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