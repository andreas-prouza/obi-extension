import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import { OBITools } from '../../utilities/OBITools';
import { Constants } from '../../Constants';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');




export class Welcome implements vscode.WebviewViewProvider {


	public static readonly viewType = 'obi-welcome';

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

    if (vscode.workspace.workspaceFolders == undefined) {
      vscode.window.showErrorMessage('No workspace defined');
      return;
    }
    
    const html_template = 'controller/welcome.html';

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
				main_java_script: getUri(webviewView.webview, this._extensionUri, ["out", "welcome.js"])
      }
    );
		webviewView.webview.html = html;

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.command) {
				case 'open_folder':
					{
						vscode.commands.executeCommand('workbench.action.openRecent');
						break;
					}
				case 'initialize_folder':
					{
						OBITools.initialize_folder();
						break;
					}
			}
		});
	}



}