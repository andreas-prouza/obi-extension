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


export class OBICommands {

  public static status: OBIStatus = OBIStatus.READY;



  public static run_build_native(context: vscode.ExtensionContext): void {

    const ws_uri = Workspace.get_workspace_uri();
    const config = AppConfig.get_app_confg();
    const remote_base_dir: string = path.join(config['app_config']['general']['remote-base-dir']);
    const remote_obi_dir: string = path.join(config['global_config']['REMOTE_OBI_DIR'].replaceAll('"', ''));
    const remote_obi: string = path.join(remote_obi_dir, config['global_config']['REMOTE_OBI_PYTHON_PATH']);

    OBITools.retrieve_source_hashes(ws_uri.fsPath, (results: []) => {

      let changed_sources: source.Source[] = OBICommands.get_changed_sources(results);

      console.log(`After source hashes ... Run build ${results.length}`);
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
    });

  }


  public static get_changed_sources(results: source.Source[]): source.Source[] {

    // Get all sources which are new or have changed
    const last_source_hashes: source.Source | undefined = OBITools.get_source_hash_list(Workspace.get_workspace());
    let changed_sources: source.Source[] = [];

    if (!last_source_hashes)
      return changed_sources;
    
    // check for changed sources
    results.map((source_item: source.Source) => {

      const source_name: string = Object.keys(source_item)[0];

      const k_source: string = source_name;
      const v_hash: string = source_item[source_name]['hash'];
      let source_changed = true;

      if (k_source in last_source_hashes) {

        if (last_source_hashes[k_source]['hash'] == v_hash) {
          source_changed = false;
          return;
        }
      }

      if (source_changed)
        changed_sources.push(source_item);
    });

    return changed_sources;
  }




  public static run_build(context: vscode.ExtensionContext): void {

    if (OBICommands.status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

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

    const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const buff = execSync(`cd ${ws}; scripts/cleanup.sh   &&   scripts/create_build_script.sh`);

    BuildSummary.render(context.extensionUri, vscode.workspace.workspaceFolders[0].uri)

    OBICommands.status = OBIStatus.READY;
    OBIController.run_finished();
    OBIController.update_build_summary_timestamp();

    return;
  }

}