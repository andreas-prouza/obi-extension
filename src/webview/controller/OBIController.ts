import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getUri } from "../../extension/utilities/getUri";
import { DirTool } from '../../extension/utilities/DirTool';
import { OBITools } from '../../extension/utilities/OBITools';
import { Constants } from '../../shared/Constants';
import { BuildSummary } from '../show_changes/BuildSummary';
import { AppConfig } from '../../extension/config/AppConfig';
import { Workspace } from '../../extension/utilities/Workspace';
import { SystemCmdExecution } from '../../extension/utilities/SystemCmdExecution';
import { logger } from '../../extension/utilities/Logger';
import { validate_new_profile_name } from '../../shared/Profile';
import { UserCancelledError } from '../../shared/Errors';
import { OperationLock } from '../../extension/utilities/OperationLock';
import { CONTROLLER_REQUESTS } from '../../shared/messages/ControllerMessages';
import { parse_message } from '../../shared/messages/MessageGuard';
import { show_error } from '../../extension/utilities/Notify';
import { OBICommands } from '../../extension/obi/OBICommands';
import { require_trust } from '../../extension/utilities/Trust';
import { render_template } from '../Templates';





export class OBIController implements vscode.WebviewViewProvider {


  public static readonly viewType = 'obi.controller';
  public static view_object: OBIController;
  public static current_run_type: string | undefined;

  private _view?: vscode.WebviewView;
  private _message_listener?: vscode.Disposable;
  private readonly _extensionUri: vscode.Uri


  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    OBIController.view_object = this;

    // Busy indicator for operations started anywhere (this view, editor title, build summary, …)
    OperationLock.on_did_change(() => OBIController.post_running_state());
  }



  /** Re-renders the view (never re-registers the message listener). */
  public static async update(): Promise<void> {
    OBIController.view_object?.render();
  }



  public static post_running_state(): void {
    OBIController.view_object?._view?.webview.postMessage({ command: 'running_state', running: OperationLock.running });
  }


  public static check_obi_response() {

    const ws = Workspace.get_workspace();
    const obi_status_file = path.join(ws, Constants.OBI_STATUS_FILE);

    if (DirTool.file_exists(obi_status_file)) {
      const status = DirTool.get_json(obi_status_file);

      if (status) {

        logger.info(`Status: ${JSON.stringify(status)}`);

        if (!status['version'] || status['version'] < Constants.OBI_BACKEND_VERSION) {
          const update = vscode.l10n.t('Update');
          vscode.window.showWarningMessage(
            vscode.l10n.t('An update for the OBI backend is available.'),
            update
          ).then(async selection => {
            if (selection === update) {
              const config = AppConfig.get_app_config();
              if (!require_trust(vscode.l10n.t('Updating the OBI backend')))
                return;

              try {
                await SystemCmdExecution.run_system_cmd(config.general['local-obi-dir'] ?? '', 'git', ['pull'], 'update_obi');
                vscode.window.showInformationMessage(vscode.l10n.t('OBI backend updated successfully.'));
              } catch (error: unknown) {
                if (error instanceof UserCancelledError)
                  vscode.window.showInformationMessage(vscode.l10n.t('Update of the OBI backend was cancelled.'));
                else
                  show_error(vscode.l10n.t('Updating the OBI backend failed'), error);
              }
            }
          });
        }

        if (status['message']) {

          vscode.window.showErrorMessage(
            status['message'],
            vscode.l10n.t('Open details')
          ).then(selection => {

            if (selection === vscode.l10n.t('Open details')) {
              vscode.window.showInformationMessage(status['details'], { modal: true });
            }

          });
        }
      }
    }
  }


  public static run_finished(process?: string) {
    OBIController.view_object._view?.webview.postMessage({ command: 'run_finished', process: process });
    OBIController.check_obi_response();
    OBIController.update_build_summary_timestamp();
    BuildSummary.update();
    //webviewView.webview.postMessage();
  }


  public static update_build_summary_timestamp() {

    const rootPath =
      Workspace.find_workspace_uri();

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

    //await OBIController.update();

    OBIController.view_object._view?.webview.postMessage(
      {
        command: 'update_current_profile',
        profiles: AppConfig.get_profile_app_config_list(),
        current_profile: Workspace.get_workspace_settings().current_profile
      });

  }



  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    // retainContextWhenHidden is set at registration (extension.ts); it has no effect on the view object
    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "out"),
        vscode.Uri.joinPath(this._extensionUri, "asserts")
      ]
    };

    this.render();

    // Exactly one listener per webview
    this._message_listener?.dispose();
    this._message_listener = webviewView.webview.onDidReceiveMessage(data => this.on_message(data));
    webviewView.onDidDispose(() => {
      this._message_listener?.dispose();
      this._message_listener = undefined;
      this._view = undefined;
    });
  }



  private render(): void {

    const webviewView = this._view;
    if (!webviewView)
      return;

    if (vscode.workspace.workspaceFolders == undefined) {
      vscode.window.showErrorMessage(vscode.l10n.t('No workspace defined'));
      return;
    }

    const workspaceFolder = Workspace.get_workspace_uri();

    const html_template = 'controller/index.html';

    const compile_list: any | undefined = OBITools.get_compile_list(workspaceFolder);

    const html = render_template(html_template,
      {
        global_stuff: OBITools.get_global_stuff(webviewView.webview, this._extensionUri),
        config_profiles: AppConfig.get_profile_app_config_list(),
        main_java_script: getUri(webviewView.webview, this._extensionUri, ["out", "webview", "controller.js"]),
        build_summary_timestamp: compile_list ? compile_list['timestamp'] : undefined,
        builds_exist: compile_list ? compile_list['compiles'].length : undefined,
        running: OperationLock.running
      }
    );
    webviewView.webview.html = html;

    OBIController.update_build_summary_timestamp();
    OBIController.update_current_profile();
  }



  private on_message(raw: unknown): void {

      const data = parse_message('OBI Build view', raw, CONTROLLER_REQUESTS, text => logger.warn(text));
      if (!data)
        return;

      switch (data.command) {
        case 'refresh':
          this.render();
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
          OBICommands.cancel_running();
          break;

        case 'change_profile':
          Workspace.change_profile(data.profile);
          break;

        case 'copy_profile':
          vscode.commands.executeCommand('obi.copy-profile-config');
          break;

        case 'delete_current_profile': {
          const current_profile = AppConfig.get_current_profile_app_config_file();
          let ws = Workspace.get_workspace_settings();
          ws.current_profile = '';
          Workspace.change_profile('');
          DirTool.delete_file(path.join(Workspace.get_workspace(), current_profile));
          OBIController.update_current_profile();
          break;
        }
      }
  }


  // obi.source-filter.add-source-file
  public static async copy_current_profile(): Promise<void> {

    const ws = Workspace.get_workspace();
    const current_profile_config_file = path.join(ws, AppConfig.get_current_profile_app_config_file());
    const current_profile = Workspace.get_workspace_settings().current_profile;
    const profile_list = AppConfig.get_profile_app_config_list();

    const new_profile: string | undefined = await vscode.window.showInputBox({
      title: vscode.l10n.t('Copy profile {0}', current_profile ?? ''),
      placeHolder: vscode.l10n.t('profile-name'), validateInput(value) {
        return validate_new_profile_name(value, profile_list.map(profile => profile.alias)) ?? null;
      }
    });
    if (!new_profile)
      return;   // cancelled

    let new_profile_config_file = AppConfig.convert_profile_alias_to_file(new_profile);
    new_profile_config_file = path.join(ws, Constants.OBI_CONFIGS_DIR, new_profile_config_file);
    DirTool.copy_file(current_profile_config_file, new_profile_config_file, true);

    Workspace.change_profile(new_profile);

    OBIController.update_current_profile();

  }


}