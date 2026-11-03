import * as vscode from 'vscode';
import { getUri } from "../../extension/utilities/getUri";
import { OBITools } from '../../extension/utilities/OBITools';
import { Constants } from '../../shared/Constants';
import { AppConfig } from '../../extension/config/AppConfig';
import { render_template } from '../Templates';




export class QuickSettings implements vscode.WebviewViewProvider {


	public static readonly viewType = 'obi.quick-settings';
  public static view_object: QuickSettings;
  public static current_run_type: string | undefined;

	private _view?: vscode.WebviewView;
	private _context?: vscode.WebviewViewResolveContext;
	private _token?: vscode.CancellationToken;
  private readonly _extensionUri: vscode.Uri


	constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    QuickSettings.view_object = this;
  }




	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		token: vscode.CancellationToken,
	) {
		this._view = webviewView;
    this._context = context;
    this._token = token;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
      enableCommandUris: false,   // no command: links on this page
			localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "out"),
        vscode.Uri.joinPath(this._extensionUri, "asserts")
			]
		};

    if (vscode.workspace.workspaceFolders == undefined) {
      vscode.window.showErrorMessage(vscode.l10n.t('No workspace defined'));
      return;
    }
    
    const html_template = 'quick_settings/index.html';
    
    const app_config = AppConfig.get_app_config();
    const config_settings_attributes = Object.entries(app_config.global.settings?.general || {})
      .filter(([_ , value]) => typeof value !== 'function')
      .map(([name, value]) => ({
        name,
        type: typeof value,
        value: value
      }));

    const html = render_template(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
        main_java_script: getUri(webviewView.webview, this._extensionUri, ["out", "webview", "controller.js"]),
        config_settings_attributes: config_settings_attributes
      }
    );
		webviewView.webview.html = html;
		// No messages are handled here (the debug message 'test' had no sender)

	}


}