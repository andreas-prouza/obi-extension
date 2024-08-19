import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";

import { execSync } from "child_process";
import { BuildSummary } from '../webview/show_changes/BuildSummary';
import { OBIStatus } from './OBIStatus';
import { OBIController } from '../webview/controller/OBIController';
import { OBITools } from '../utilities/OBITools';
import { Workspace } from '../utilities/Workspace';

import * as source from '../obi/Source';
import { SSH_Tasks } from '../utilities/SSH_Tasks';
import { AppConfig } from '../webview/controller/AppConfig';
import path from 'path';
import { DirTool } from '../utilities/DirTool';
import { Constants } from '../Constants';


export class OBICommands {

  public static status: OBIStatus = OBIStatus.READY;



  public static async run_build_native() {

    const ws = Workspace.get_workspace();
    const config = AppConfig.get_app_confg();
    const remote_base_dir: string = path.join(config['app_config']['general']['remote-base-dir']);
    const remote_obi_dir: string = path.join(config['global_config']['REMOTE_OBI_DIR'].replaceAll('"', ''));
    const remote_obi: string = path.join(remote_obi_dir, config['global_config']['REMOTE_OBI_PYTHON_PATH']);

    const changed_sources: source.ISourceList = await OBITools.generate_source_change_lists();
    const source_list: string[] = Object.assign([], changed_sources['changed-sources'], changed_sources['new-objects']);

    const check: boolean = await SSH_Tasks.check_remote_file(path.join(config['app_config']['general']['remote-base-dir'], Constants.OBI_APP_CONFIG_FILE));
    if (!check) {
      const answer = await vscode.window.showErrorMessage("Missing OBI project on remote system. Do you want to transfer all?\nThis can take several minutes.", ...['Yes', 'No']);
      switch (answer) {
        case 'No':
          return;
        case 'Yes':
          await OBITools.transfer_all();
      }
    }

    await SSH_Tasks.transferSources(source_list);

     if (source_list.length == 0) {
      vscode.window.showWarningMessage("No changed sources to build");
      return;
    }

    let ssh_cmd: string = `source .profile; cd "${remote_base_dir}"; ${remote_obi} -X utf8 ${remote_obi_dir}/main.py -a create -p ${remote_base_dir} || true`;
    await SSH_Tasks.executeCommand(ssh_cmd);

    ssh_cmd = `source .profile; cd "${remote_base_dir}"; ${remote_obi} -X utf8 ${remote_obi_dir}/main.py -a run -p ${remote_base_dir} || true`;
    await SSH_Tasks.executeCommand(ssh_cmd);

    await Promise.all([
      SSH_Tasks.getRemoteDir(path.join(ws, Constants.BUILD_OUTPUT_DIR), path.join(config['app_config']['general']['remote-base-dir'], Constants.BUILD_OUTPUT_DIR)),
      SSH_Tasks.getRemoteDir(path.join(ws, 'tmp'), path.join(config['app_config']['general']['remote-base-dir'], 'tmp'))
    ]);
  }





  public static async run_build(context: vscode.ExtensionContext) {

    if (OBICommands.status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    OBICommands.status = OBIStatus.IN_PROCESS;

    const ws_uri = Workspace.get_workspace_uri();
    let buff;

    if (OBITools.is_native())
      await OBICommands.run_build_native();
    else
      buff = execSync(`cd ${ws_uri.fsPath}; scripts/cleanup.sh   &&   scripts/run_build.sh`);

    BuildSummary.render(context.extensionUri, ws_uri)

    OBICommands.status = OBIStatus.READY;
    OBIController.run_finished();
    OBIController.update_build_summary_timestamp();

    return;
  }



  public static async show_changes(context: vscode.ExtensionContext) {

    if (OBICommands.status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
      vscode.window.showErrorMessage('No workspace');
      return;
    }

    OBICommands.status = OBIStatus.IN_PROCESS;
    const ws: string = Workspace.get_workspace();
    let buff: Buffer;

    if (OBITools.is_native())
      await OBITools.generate_source_change_lists();
    else
      buff = execSync(`cd ${ws}; scripts/cleanup.sh   &&   scripts/create_build_script.sh`);


    BuildSummary.render(context.extensionUri, Workspace.get_workspace_uri());

    OBICommands.status = OBIStatus.READY;
    OBIController.run_finished();
    OBIController.update_build_summary_timestamp();

    return;
  }

}