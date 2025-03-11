import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import { OBITools } from '../../utilities/OBITools';
import { Constants } from '../../Constants';
import path from 'path';
import { OBICommands } from '../../obi/OBICommands';
import { BuildSummary } from '../show_changes/BuildSummary';
import * as fs from 'fs';
import { AppConfig } from './AppConfig';
import { Workspace } from '../../utilities/Workspace';
import { SystemCmdExecution } from '../../utilities/SystemCmdExecution';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');




export class OBIController implements vscode.WebviewViewProvider {


	public static readonly viewType = 'obi.controller';
  public static view_object: OBIController;
  public static current_run_type: string | undefined;

	private _view?: vscode.WebviewView;
	private _context?: vscode.WebviewViewResolveContext;
	private _token?: vscode.CancellationToken;
  private readonly _extensionUri: vscode.Uri
  private static is_config_watcher_set: boolean = false;


	constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    OBIController.view_object = this;

    OBIController.set_build_watcher();
  }



  public static set_build_watcher() {

    if (OBIController.is_config_watcher_set || !OBITools.contains_obi_project())
      return;

    const config = AppConfig.get_app_confg();

    if (AppConfig.attributes_missing())
      return;

    const compile_list_file_path: string = path.join(Workspace.get_workspace(), config.general['compile-list']);
    // if compile-script changed, refresh the view
    fs.watchFile(compile_list_file_path, {interval: 1000}, function (event, filename) {
      OBIController.update_build_summary_timestamp();
    });
  }



  public static run_finished() {
    OBIController.view_object._view?.webview.postMessage({command: 'run_finished'});
    OBIController.update_build_summary_timestamp();
    BuildSummary.update();
    //webviewView.webview.postMessage();
  }
  
  
  public static update_build_summary_timestamp() {

    const rootPath =
      vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri
      : undefined;

    if (!rootPath)
      return;

    if (AppConfig.attributes_missing())
      return;

    const compile_list = OBITools.get_compile_list(rootPath);
     
    OBIController.view_object._view?.webview.postMessage(
      {
        command: 'update_build_summary_timestamp',
        build_summary_timestamp: compile_list ? compile_list['timestamp'] : undefined,
        build_counts: compile_list ? compile_list['compiles'].length : undefined
      });
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
    
    const workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
    
    const html_template = 'controller/index.html';

    const compile_list: {}|undefined = OBITools.get_compile_list(workspaceFolder);

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render(html_template, 
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
        main_java_script: getUri(webviewView.webview, this._extensionUri, ["out", "controller.js"]),
        build_summary_timestamp: compile_list ? compile_list['timestamp'] : undefined,
        builds_exist: compile_list ? compile_list['compiles'].length : undefined
      }
    );
		webviewView.webview.html = html;

    OBIController.update_build_summary_timestamp();

    // Listener
		webviewView.webview.onDidReceiveMessage(data => {

			switch (data.command) {
				case 'test':
					vscode.window.showInformationMessage('Message from controller');
					break;

        case 'refresh':
          this.resolveWebviewView(webviewView, context, token);
          break;

        case 'run_build': // command:obi.run_build
          OBIController.current_run_type = data.command;
          vscode.commands.executeCommand('obi.run_build');
          break;

        case 'run_single_build': // command:obi.run_build
          OBIController.current_run_type = data.command;
          vscode.commands.executeCommand('obi.run_single_build');
          break;

        case 'show_changes': // command:obi.show_changes
          OBIController.current_run_type = data.command;
          vscode.commands.executeCommand('obi.show_changes');
          break;

        case 'show_single_changes': // command:obi.show_changes
          OBIController.current_run_type = data.command;
          vscode.commands.executeCommand('obi.show_single_changes');
          break;

        case 'cancel_show_changes': // command:obi.show_changes
          SystemCmdExecution.abort_system_cmd('show_changes');
          break;
			}
		});

	}


}