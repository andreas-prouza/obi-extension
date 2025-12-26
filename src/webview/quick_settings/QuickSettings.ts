import * as vscode from 'vscode';
import { getUri } from "../../utilities/getUri";
import { DirTool } from '../../utilities/DirTool';
import { OBITools } from '../../utilities/OBITools';
import { Constants } from '../../Constants';
import * as path from 'path';
import { BuildSummary } from '../show_changes/BuildSummary';
import * as fs from 'fs';
import { AppConfig, ConfigCompileSettings } from '../controller/AppConfig';
import { Workspace } from '../../utilities/Workspace';
import { SystemCmdExecution } from '../../utilities/SystemCmdExecution';
import { logger } from '../../utilities/Logger';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');




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
    
    const html_template = 'quick_settings/index.html';
    
    const app_config = AppConfig.get_app_config();
    const config_settings_attributes = Object.entries(app_config['global']['settings']['general'] || {})
      .filter(([_ , value]) => typeof value !== 'function')
      .map(([name, value]) => ({
        name,
        type: typeof value,
        value: value
      }));

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
        main_java_script: getUri(webviewView.webview, this._extensionUri, ["out", "controller.js"]),
        config_settings_attributes: config_settings_attributes
      }
    );
		webviewView.webview.html = html;

    // Listener
		webviewView.webview.onDidReceiveMessage(data => {

			switch (data.command) {
				case 'test':
					vscode.window.showInformationMessage('Message from controller');
					break;
			}
		});

	}


}