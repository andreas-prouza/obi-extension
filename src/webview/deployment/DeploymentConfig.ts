import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../extension/utilities/getUri";
import { DirTool } from '../../extension/utilities/DirTool';
import * as path from 'path';
import { Constants } from '../../shared/Constants';
import { OBITools } from '../../extension/utilities/OBITools';
import { Workspace } from '../../extension/utilities/Workspace';
import { DEPLOYMENT_CONFIG_REQUESTS } from '../../shared/messages/DeploymentMessages';
import { parse_message } from '../../shared/messages/MessageGuard';
import { logger } from '../../extension/utilities/Logger';
import { render_template } from '../Templates';
import { base_url, configured_workflows } from '../../shared/IReleaser';




export type Config = {
  "i-releaser": {
    url?: string,
    "default-workflow"?: string,
    workflows?: unknown,   // as written in the file: read with configured_workflows
    project?: string,
    "run-stages"?: unknown,   // stages that may be run from VS Code, read with configured_workflows
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
    // Most projects have no deployment config: no warning in the log (the build summary asks on every render)
    const config: Config|undefined = DirTool.file_exists(toml_file) ? DirTool.get_toml(toml_file) : undefined;
    if (!config || typeof config['i-releaser'] !== 'object' || config['i-releaser'] === null) {
      return {"i-releaser": {}};
    }
    return config;
  }



  /** http(s) URL of i-Releaser from deployment.toml without trailing "/", undefined if there is none */
  public static i_releaser_url(): string | undefined {
    return base_url(DeploymentConfig.get_deployment_config()['i-releaser'].url);
  }



  /**
   * Opens i-Releaser (URL of deployment.toml) in the browser.
   * The icon is always shown: without a URL (or without deployment.toml) it offers the config page.
   */
  public static async open_web_app(): Promise<void> {
    let base: string | undefined;
    try {
      base = DeploymentConfig.i_releaser_url();
    }
    catch (e: unknown) {
      logger.warn(`${Constants.DEPLOYMENT_CONFIG_FILE}: ${e}`);
    }
    if (!base) {
      const configure = vscode.l10n.t('Open deployment config');
      const choice = await vscode.window.showErrorMessage(vscode.l10n.t('No i-Releaser URL in {0}.', Constants.DEPLOYMENT_CONFIG_FILE), configure);
      if (choice === configure && OBITools.ext_context)
        await DeploymentConfig.render(OBITools.ext_context);
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(`${base}/`));
  }



  private static readonly TOKEN_KEY_PREFIX = 'obi|deployment|http_auth_token|';

  // One token per i-Releaser (origin): a project with another URL in deployment.toml never gets it
  private static token_key(url: unknown): string | undefined {
    const base = base_url(url);
    return base ? `${DeploymentConfig.TOKEN_KEY_PREFIX}${new URL(base).origin}` : undefined;
  }

  /** Key of the secret storage that holds an i-Releaser token */
  public static is_token_key(key: string): boolean {
    return key.startsWith(DeploymentConfig.TOKEN_KEY_PREFIX);
  }

  public static async get_auth_token(url: unknown): Promise<string | undefined> {
    const key = DeploymentConfig.token_key(url);
    const token = key ? await OBITools.ext_context?.secrets.get(key) : undefined;
    return token && token.length > 0 ? token : undefined;
  }

  /** false if the URL is no http(s) URL */
  public static async store_auth_token(url: unknown, token: string): Promise<boolean> {
    const key = DeploymentConfig.token_key(url);
    if (!key || !OBITools.ext_context)
      return false;
    await OBITools.ext_context.secrets.store(key, token);
    return true;
  }




  private static async generate_html(context: vscode.ExtensionContext, extensionUri: Uri, webview: Webview): Promise<string> {

    const config = DeploymentConfig.get_deployment_config();

    const auth_token = await DeploymentConfig.get_auth_token(config['i-releaser'].url);

    const html = render_template('deployment/deployment-config.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        config_css: getUri(webview, extensionUri, ["asserts/css", "config.css"]),
        main_java_script: getUri(webview, extensionUri, ["out", "webview", "deployment_config.js"]),
        // Never pass the secret itself into the page: only whether one is stored
        auth_token_stored: auth_token !== undefined && auth_token.length > 0,
        deploy_config: config,
        workflows: configured_workflows(config['i-releaser'].workflows),
        run_stages: configured_workflows(config['i-releaser']['run-stages'])
      }
    );

    return html;
  }




  public static async update(): Promise<void> {

    const panel = DeploymentConfig.currentPanel;
    
    if (!panel)
      return;

    panel._panel.webview.html = await DeploymentConfig.generate_html(DeploymentConfig._context, DeploymentConfig._extensionUri, panel._panel.webview);
    
  }



  private static onReceiveMessage(raw: unknown): void {

    const message = parse_message('Deployment config', raw, DEPLOYMENT_CONFIG_REQUESTS, text => logger.warn(text));
    if (!message)
      return;

    const workspaceUri =
    Workspace.find_workspace_uri();

    if (!workspaceUri)
      return;

    const command = message.command;

    switch (command) {

      case "save":
        try {
          DeploymentConfig.save_config(message.data);
        }
        catch (e) {
          DirTool.show_save_error(e);
        }
        break;

      case "reload":
        DeploymentConfig.update();
        break;

      case "delete_auth_token": {
        const key = DeploymentConfig.token_key(DeploymentConfig.get_deployment_config()['i-releaser'].url);
        if (key)
          OBITools.ext_context?.secrets.delete(key).then(() => DeploymentConfig.update());
        break;
      }

    }
    return;
  }



  private static save_config(data : Config) {

    const toml_file: string = path.join(Workspace.get_workspace(), Constants.DEPLOYMENT_CONFIG_FILE);
    // An empty field means "unchanged"; removing is an explicit action (delete_auth_token)
    const auth_token = data['i-releaser']['auth-token'];
    if (auth_token && auth_token.length > 0) {
      DeploymentConfig.store_auth_token(data['i-releaser'].url, auth_token).then(stored => {
        if (!stored)
          vscode.window.showErrorMessage(vscode.l10n.t('The token was not stored: enter the http(s) URL of i-Releaser first.'));
        DeploymentConfig.update();
      });
    }
    delete data['i-releaser']['auth-token'];
    // One name per line on the page; no list means all workflows of i-Releaser
    for (const key of ['workflows', 'run-stages'] as const) {
      const names = configured_workflows(data['i-releaser'][key]);
      if (names.length > 0)
        data['i-releaser'][key] = names;
      else
        delete data['i-releaser'][key];
    }
    if (!data['i-releaser'].project?.trim())
      delete data['i-releaser'].project;
    // The deployments view follows the file (FILE_CALLBACKS)
    DirTool.update_toml(toml_file, data);   // creates deployment.toml if there is none yet

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
        enableCommandUris: false,   // no command: links on this page
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