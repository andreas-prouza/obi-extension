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



  public static run_build_native(context: vscode.ExtensionContext): void {

    const ws_uri = Workspace.get_workspace_uri();
    const config = AppConfig.get_app_confg();
    const remote_base_dir: string = path.join(config['app_config']['general']['remote-base-dir']);
    const remote_obi_dir: string = path.join(config['global_config']['REMOTE_OBI_DIR'].replaceAll('"', ''));
    const remote_obi: string = path.join(remote_obi_dir, config['global_config']['REMOTE_OBI_PYTHON_PATH']);

    let changed_sources: source.Source[] = OBICommands.get_changed_sources();

    console.log(`Changed sources ${changed_sources.length}`);

    if (changed_sources.length == 0) {
      vscode.window.showWarningMessage("No changed sources to build");
      return;
    }

    SSH_Tasks.transferSources(changed_sources).then(()=> {
      console.log('Files transfered');

      const ssh_cmd: string = `source .profile; cd "${remote_base_dir}"; ${remote_obi} -X utf8 ${remote_obi_dir}/main.py -a run -p ${remote_base_dir} || true`;
      SSH_Tasks.executeCommand(ssh_cmd);
    });
  }





  public static run_build(context: vscode.ExtensionContext): void {

    if (OBICommands.status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    if (OBITools.is_native())
      return OBICommands.run_build_native(context);

    OBICommands.status = OBIStatus.IN_PROCESS;

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
      vscode.window.showErrorMessage('No workspace');
      return;
    }

    const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const buff = execSync(`cd ${ws}; scripts/cleanup.sh   &&   scripts/run_build.sh`);

    BuildSummary.render(context.extensionUri, vscode.workspace.workspaceFolders[0].uri)

    OBICommands.status = OBIStatus.READY;
    OBIController.run_finished();
    OBIController.update_build_summary_timestamp();

    return;
  }



  public static async show_changes_native(context: vscode.ExtensionContext) {

    const changed_sources: source.ChangedSources = await OBITools.get_changed_sources();
    const dependend_sources: string[] = await OBITools.get_dependend_sources(changed_sources);

    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.CHANGED_OBJECT_LIST), JSON.stringify(changed_sources));
    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.DEPENDEND_OBJECT_LIST), JSON.stringify(dependend_sources));

    return;
  }


  public static show_changes(context: vscode.ExtensionContext): void {

    if (OBICommands.status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
      vscode.window.showErrorMessage('No workspace');
      return;
    }

    OBICommands.status = OBIStatus.IN_PROCESS;
    const ws = Workspace.get_workspace();
    let buff: Buffer;

    if (OBITools.is_native())
      OBICommands.show_changes_native(context);
    else
      buff = execSync(`cd ${ws}; scripts/cleanup.sh   &&   scripts/create_build_script.sh`);


    BuildSummary.render(context.extensionUri, Workspace.get_workspace_uri());

    OBICommands.status = OBIStatus.READY;
    OBIController.run_finished();
    OBIController.update_build_summary_timestamp();

    return;
  }

}