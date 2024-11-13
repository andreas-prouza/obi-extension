import * as vscode from 'vscode';
import { getUri } from "../../utilities/getUri";
import { OBITools } from '../../utilities/OBITools';
import { Constants } from '../../Constants';


const nunjucks = require('nunjucks');




export class I_Releaser implements vscode.WebviewViewProvider {

	public static readonly viewType = 'obi.deployment';

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
      enableCommandUris: true,
			localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "out"),
        vscode.Uri.joinPath(this._extensionUri, "asserts")
			]
		};

    const html_template = 'deployment/i-releaser.html';

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
				main_java_script: getUri(webviewView.webview, this._extensionUri, ["out", "i_releaser.js"]),
				workspace_exist: vscode.workspace.workspaceFolders != undefined
      }
    );
		webviewView.webview.html = html;

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.command) {
				case 'open_web_app':
					{
						vscode.commands.executeCommand('workbench.action.openRecent');
						break;
					}
			}
		});
	}



}