import * as vscode from 'vscode';
import { getUri } from "../../utilities/getUri";
import { DirTool } from '../../utilities/DirTool';
import { OBITools } from '../../utilities/OBITools';
import { Constants } from '../../Constants';
import * as path from 'path';
import { BuildSummary } from '../show_changes/BuildSummary';
import * as fs from 'fs';
import { AppConfig } from './AppConfig';
import { Workspace } from '../../utilities/Workspace';
import { SystemCmdExecution } from '../../utilities/SystemCmdExecution';
import { logger } from '../../utilities/Logger';
import { log } from 'console';
import { OBIConfiguration } from './OBIConfiguration';

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

    const config = AppConfig.get_app_config();

    if (AppConfig.attributes_missing())
      return;

    const compile_list_file_path: string = path.join(Workspace.get_workspace(), config.general['compile-list']);
    // if compile-script changed, refresh the view
    fs.watchFile(compile_list_file_path, {interval: 1000}, function (event, filename) {
      OBIController.update_build_summary_timestamp();
    });
  }




  public static async update(): Promise<void> {

    if (OBIController.view_object && OBIController.view_object._view) {
      OBIController.view_object.resolveWebviewView(
        OBIController.view_object._view,
        OBIController.view_object._context!,
        OBIController.view_object._token!
      );
    }
    
  }


  public static check_obi_response() {

    const ws = Workspace.get_workspace();
    const obi_status_file = path.join(ws, Constants.OBI_STATUS_FILE);

    if (DirTool.file_exists(obi_status_file)) {
      const status = DirTool.get_json(obi_status_file);

      if (status) {

        logger.info(`Status: ${JSON.stringify(status)}`);

        if (!status['version'] || status['version'] < Constants.OBI_BACKEND_VERSION) {
          vscode.window.showWarningMessage(
            'An update for OBI backend is available.',
            'Update'
          ).then(async selection => {
          if (selection === 'Update') {
            const config = AppConfig.get_app_config();

            const cmd = 'git pull';
            try {
              await SystemCmdExecution.run_system_cmd(config.general['local-obi-dir'], cmd, 'update_obi');
              vscode.window.showInformationMessage('OBI backend updated successfully.');
            } catch (error: any) {
              if (error.signal === 'SIGTERM') {
                vscode.window.showErrorMessage('Git pull command was aborted.');
              }
              throw error;
            }
          }
          });
        }

        if (status['message']) {
        
          vscode.window.showErrorMessage(
            status['message'],
            'Open Details'
          ).then(selection => {

            if (selection === 'Open Details') {
              vscode.window.showInformationMessage(status['details'], { modal: true });
            }

          });
        }
      }
    }
  }


  public static run_finished() {
    OBIController.view_object._view?.webview.postMessage({command: 'run_finished'});
    OBIController.check_obi_response();
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

  
  public static async update_current_profile() {

    await OBIController.update();

    OBIController.view_object._view?.webview.postMessage(
      {
        command: 'update_current_profile',
        current_profile: AppConfig.get_current_profile_app_config_name()
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
    (webviewView as any).retainContextWhenHidden = true;

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
        config_profiles: AppConfig.get_profile_app_config_list(),
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

        case 'show_changes':
          OBIController.current_run_type = data.command;
          vscode.commands.executeCommand('obi.show_changes');
          break;

        case 'show_single_changes':
          OBIController.current_run_type = data.command;
          vscode.commands.executeCommand('obi.show_single_changes');
          break;

        case 'cancel_running':
          SystemCmdExecution.abort_system_cmd('show_changes');
          SystemCmdExecution.abort_system_cmd('run_build');
          OBITools.cancel('retrieve_current_source_hashes');
          break;

        case 'change_profile':
          AppConfig.change_current_profile(data.profile);
          OBIConfiguration.update();
          break;

        case 'copy_profile':
          vscode.commands.executeCommand('obi.copy-profile-config');
          break;

        case 'delete_current_profile':
          const current_profile = AppConfig.get_current_profile_app_config_file();
          let ws = Workspace.get_workspace_settings();
          ws.current_profile = Constants.OBI_APP_CONFIG_USER;
          Workspace.update_workspace_settings(ws);
          DirTool.delete_file(path.join(Workspace.get_workspace(), current_profile));
          OBIController.update_current_profile();
          break;
			}
		});

	}


    // obi.source-filter.add-source-file
  public static async copy_current_profile(): Promise<void> {
  
    const current_profile = AppConfig.get_current_profile_app_config_name();
    const profile_list = AppConfig.get_profile_app_config_list();

    let new_profile_config: string | undefined = await vscode.window.showInputBox({ title: `Copy profile config ${current_profile}`, 
                                                        placeHolder: 'profile-name', validateInput(value) {
      if (value.trim() === '')
        return 'Profile name cannot be empty';

      value = value.replace(' ', '-');
      value = value.replace('.toml', '');
      value = Constants.OBI_APP_CONFIG_USER.replace('.toml', `-${value}.toml`);
      if (profile_list.some((profile: { file: string }) => profile.file === value))
        return `Profile ${value} already exists`;
      return null;
    }});
    if (!new_profile_config)
      throw new Error('Canceled by user. No new profile name provided.');
    
    new_profile_config = Constants.OBI_APP_CONFIG_USER.replace('.toml', `-${new_profile_config}.toml`);
    const new_profile_config_file = path.join(Constants.OBI_CONFIGS_DIR, new_profile_config);
    DirTool.write_toml(path.join(Workspace.get_workspace(), new_profile_config_file), AppConfig.get_user_app_config(Workspace.get_workspace_uri()))

    AppConfig.change_current_profile(new_profile_config);

    OBIController.update_current_profile();

  }


}