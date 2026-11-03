import * as vscode from 'vscode';
import { getUri } from "../../extension/utilities/getUri";
import { OBITools } from '../../extension/utilities/OBITools';
import { Constants } from '../../shared/Constants';
import * as DeploymentConfig from './DeploymentConfig';
import { logger } from '../../extension/utilities/Logger';
import { I_RELEASER_REQUESTS } from '../../shared/messages/DeploymentMessages';
import { parse_message } from '../../shared/messages/MessageGuard';
import { show_error } from '../../extension/utilities/Notify';
import { render_template } from '../Templates';






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
      enableCommandUris: false,   // no command: links on this page
			localResourceRoots: [
        vscode.Uri.joinPath(I_Releaser._extensionUri, "out"),
        vscode.Uri.joinPath(I_Releaser._extensionUri, "asserts")
			]
		};


		webviewView.webview.html = await I_Releaser.getHTML(webviewView);

		webviewView.webview.onDidReceiveMessage((raw: unknown) => {
			const data = parse_message('i-Releaser', raw, I_RELEASER_REQUESTS, text => logger.warn(text));
			if (!data)
				return;
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

    const html = render_template(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
				main_java_script: getUri(webviewView.webview, this._extensionUri, ["out", "webview", "i_releaser.js"]),
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
			vscode.window.showWarningMessage(vscode.l10n.t('Missing deployment config'));
			return {};
		}

		const auth_token = await OBITools.ext_context?.secrets.get(`obi|deployment|http_auth_token`);

		if (!auth_token) {
			vscode.window.showErrorMessage(vscode.l10n.t('Missing HTTP auth token for i-Releaser. Please check the configuration.'));
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
		catch (e: unknown){
			show_error(vscode.l10n.t('i-Releaser request failed'), e);
		}

		return {};
	}

}