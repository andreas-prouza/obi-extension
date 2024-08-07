import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { DirTool } from '../utilities/DirTool';
import { OBITools } from '../utilities/OBITools';
import { Constants } from '../Constants';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');




export class Welcome implements vscode.WebviewViewProvider {


	public static readonly viewType = 'obi-welcome';

	private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri

	constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
   }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

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
    
    const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
    
    const html_template = 'controller/welcome.html';

    let theme_mode = 'light';
    if (vscode.window.activeColorTheme.kind == vscode.ColorThemeKind.Dark)
      theme_mode = 'dark';

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
        theme_mode: theme_mode
      }
    );
		webviewView.webview.html = html;

		webviewView.webview.onDidReceiveMessage(data => {
			vscode.window.showInformationMessage(data.value);
			switch (data.type) {
				case 'colorSelected':
					{
						vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
						break;
					}
			}
		});
	}



}