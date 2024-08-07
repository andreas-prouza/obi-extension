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




export class OBIController implements vscode.WebviewViewProvider {


	public static readonly viewType = 'obi.controller';

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
    
    const html_template = 'controller/index.html';

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




  public static get_object_list(workspaceUri: Uri) {

    console.log("Read compile list");
    const fs = require("fs"); 
    
    let compile_list = fs.readFileSync(`${workspaceUri.path}/tmp/changed-object-list.json`);
    // Converting to JSON 
    compile_list = JSON.parse(compile_list);

    let dependend_sources = fs.readFileSync(`${workspaceUri.path}/tmp/dependend-object-list.json`);
    // Converting to JSON 
    dependend_sources = JSON.parse(dependend_sources);

    for (let index = 0; index < compile_list['new-objects'].length; index++) {
      compile_list['new-objects'][index] = {source: compile_list['new-objects'][index], file: DirTool.get_encoded_source_URI(workspaceUri, compile_list['new-objects'][index])};
    }
    for (let index = 0; index < compile_list['changed-sources'].length; index++) {
      compile_list['changed-sources'][index] = {source: compile_list['changed-sources'][index], file: DirTool.get_encoded_source_URI(workspaceUri, compile_list['changed-sources'][index])};
    }
    for (let index = 0; index < dependend_sources.length; index++) {
      dependend_sources[index] = {source: dependend_sources[index], file: DirTool.get_encoded_source_URI(workspaceUri, dependend_sources[index])};
    }

    return {
      new_sources : compile_list['new-objects'], 
      changed_sources: compile_list['changed-sources'], 
      dependend_sources: dependend_sources
    }
  }



  private static get_compile_list(workspaceUri: Uri) {

    console.log("Read compile list");
    const fs = require("fs"); 
    
    let compile_list = fs.readFileSync(`${workspaceUri.path}/build-output/compile-list.json`);
    // Converting to JSON 
    compile_list = JSON.parse(compile_list);

    return compile_list
  }



}