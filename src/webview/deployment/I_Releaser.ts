import * as vscode from 'vscode';
import { getUri } from "../../utilities/getUri";
import { OBITools } from '../../utilities/OBITools';
import { Constants } from '../../Constants';
import * as DeploymentConfig from './DeploymentConfig';
import { logger } from '../../utilities/Logger';


const nunjucks = require('nunjucks');




export class I_Releaser implements vscode.WebviewViewProvider {

	public static readonly viewType = 'obi.deployment';
	public static i_releaser: I_Releaser;

	private _view?: vscode.WebviewView;
  private _context?: vscode.WebviewViewResolveContext;
  private static _extensionUri: vscode.Uri;

	constructor(extensionUri: vscode.Uri) {
    I_Releaser._extensionUri = extensionUri;
		I_Releaser.i_releaser = this;
   }

	public async resolveWebviewView(
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
        vscode.Uri.joinPath(I_Releaser._extensionUri, "out"),
        vscode.Uri.joinPath(I_Releaser._extensionUri, "asserts")
			]
		};


		webviewView.webview.html = await I_Releaser.getHTML(webviewView);

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



	private static async getHTML(webviewView: vscode.WebviewView) {

		const html_template = 'deployment/i-releaser.html';

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);

    const html = nunjucks.render(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
				main_java_script: getUri(webviewView.webview, this._extensionUri, ["out", "i_releaser.js"]),
				workspace_exist: vscode.workspace.workspaceFolders != undefined,
				config: DeploymentConfig.DeploymentConfig.get_deployment_config(),
				workflows: await I_Releaser.get_workflows()
      }
    );

		return html;
	}


	public static async refresh(): Promise<void> {
		const i_releaser = I_Releaser.i_releaser;
		if (i_releaser._view)
			i_releaser._view.webview.html = await this.getHTML(i_releaser._view);
	}




	public static async get_workflows(): Promise<{}> {

		const config: DeploymentConfig.Config = DeploymentConfig.DeploymentConfig.get_deployment_config();

		if (!config['i-releaser'].url) {
			vscode.window.showWarningMessage('Missing deployment config');
			return {};
		}

		const auth_token = await OBITools.ext_context.secrets.get(`obi|deployment|http_auth_token`);

		if (!auth_token) {
			vscode.window.showErrorMessage('Missing HTTP auth token for i-Releaser. Please check the config');
			return {};
		}

		try {
			const response = await fetch(`${config['i-releaser'].url}/api/get_workflows?auth-token=${auth_token}`);
			const data = await response.json();
			if (data['Error']) {
				throw Error(`i-Releaser: ${data['Error']}`);
			}
			return data;
		}
		catch (e: any){
			logger.error(e);
			vscode.window.showErrorMessage(`i-Releaser error: ${e.message}`);
		}

		return {};
	}

}