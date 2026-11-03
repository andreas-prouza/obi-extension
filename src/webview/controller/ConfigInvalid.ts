import * as vscode from 'vscode';
import { getUri } from "../../extension/utilities/getUri";
import { OBITools } from '../../extension/utilities/OBITools';
import { Constants } from '../../shared/Constants';
import { CONFIG_INVALID_REQUESTS } from '../../shared/messages/StartMessages';
import { parse_message } from '../../shared/messages/MessageGuard';
import { logger } from '../../extension/utilities/Logger';
import { render_template } from '../Templates';





export class ConfigInvalid implements vscode.WebviewViewProvider {


	public static readonly viewType = 'obi-config-invalid';

	private _view?: vscode.WebviewView;
  private _context?: vscode.WebviewViewResolveContext;
  private readonly _extensionUri: vscode.Uri;

	
	constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
   }



	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;
		this._context = context;

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
    
    const html_template = 'controller/config_invalid.html';

    const html = render_template(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
				main_java_script: getUri(webviewView.webview, this._extensionUri, ["out", "webview", "config_invalid.js"])
      }
    );
		webviewView.webview.html = html;

		webviewView.webview.onDidReceiveMessage((raw: unknown) => {
			const data = parse_message('Config invalid', raw, CONFIG_INVALID_REQUESTS, text => logger.warn(text));
			if (!data)
				return;
			switch (data.command) {
				case 'initialize_folder':
					{
						OBITools.initialize_folder();
						break;
					}
				case 'reload_workspace':
					{
						vscode.commands.executeCommand('workbench.action.reloadWindow');
						break;
					}
				case 'config':
					{
						vscode.commands.executeCommand('obi.controller.config');
						break;
					}
			}
		});
	}



}