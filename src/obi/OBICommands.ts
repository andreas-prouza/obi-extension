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
import path, { join } from 'path';
import { DirTool } from '../utilities/DirTool';
import { Constants } from '../Constants';
import { logger } from '../utilities/Logger';


export class OBICommands {


  public static run_build_status: OBIStatus = OBIStatus.READY;
  public static show_changes_status: OBIStatus = OBIStatus.READY;
  public static remote_source_list_status: OBIStatus = OBIStatus.READY;



  public static async run_build_native() {

    const ws = Workspace.get_workspace();
    const config = AppConfig.get_app_confg();
    const remote_base_dir: string|undefined = config.general['remote-base-dir'];
    const remote_obi_dir: string|undefined = config.general['remote-obi-dir'];
    
    if (!remote_base_dir || !remote_obi_dir)
      throw Error(`Missing 'remote_base_dir' or 'remote_obi_dir'`);

    const remote_obi: string = path.join(remote_obi_dir, Constants.REMOTE_OBI_PYTHON_PATH);

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Transfer project`,
    }, 
    async progress => {
      progress.report({
        message: `Get changed source list`
      });

      const source_list: string[] = await OBITools.generate_source_change_lists();

      if (source_list.length == 0) {
        vscode.window.showWarningMessage("No changed sources to build");
        return;
      }

      progress.report({
        message: `Check remote project folder`
      });

      let check: boolean = await OBITools.check_remote();

      if (!check) {
        vscode.window.showErrorMessage('Missing OBI project on remote system.');
        OBITools.transfer_all(false);
      }

      if (check) {
        progress.report({
          message: `Count of source transfer: ${source_list.length}`
        });
        const result = await SSH_Tasks.transferSources(source_list);
      }

      progress.report({
        message: `Generate build script. If it takes too long, use OBI localy (see documentation).`
      });

      let ssh_cmd: string = `source .profile; cd '${remote_base_dir}' || exit 1; rm log /*2> /dev/null || true; ${remote_obi} -X utf8 ${remote_obi_dir}/main.py -a create -p .`;
      await SSH_Tasks.executeCommand(ssh_cmd);

      progress.report({
        message: `Run build script`
      });

      ssh_cmd = `source .profile; cd '${remote_base_dir}' || exit 1; ${remote_obi} -X utf8 ${remote_obi_dir}/main.py -a run -p .`;
      await SSH_Tasks.executeCommand(ssh_cmd);

      progress.report({
        message: `Get all outputs back to you`
      });

      let promise_list = [
        SSH_Tasks.getRemoteDir(path.join(ws, Constants.BUILD_OUTPUT_DIR), path.join(remote_base_dir, Constants.BUILD_OUTPUT_DIR)),
        SSH_Tasks.getRemoteDir(path.join(ws, '.obi', 'tmp'), path.join(remote_base_dir, '.obi', 'tmp')),
        SSH_Tasks.getRemoteDir(path.join(ws, '.obi', 'log'), path.join(remote_base_dir, '.obi', 'log'))
      ];

      if (config.general['compiled-object-list'])
        promise_list.push(SSH_Tasks.getRemoteFile(path.join(ws, config.general['compiled-object-list']), path.join(remote_base_dir, config.general['compiled-object-list'])));


      await Promise.all(promise_list);

    });
  }





  public static async run_build(context: vscode.ExtensionContext) {

    if (OBICommands.run_build_status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    OBICommands.run_build_status = OBIStatus.IN_PROCESS;

    const ws_uri = Workspace.get_workspace_uri();
    let buff;

    OBICommands.show_changes(context);

    try {
      if (OBITools.is_native())
        await OBICommands.run_build_native();
      else
        buff = execSync(`cd ${ws_uri.fsPath}; scripts/cleanup.sh   &&   scripts/run_build.sh`);

      BuildSummary.render(context.extensionUri, ws_uri)
      OBIController.update_build_summary_timestamp();
    }
    catch(e: any) {
      vscode.window.showErrorMessage(e.message);
    }

    OBICommands.run_build_status = OBIStatus.READY;
    OBIController.run_finished();
    return;
  }



  public static async show_changes(context: vscode.ExtensionContext) {

    if (OBICommands.show_changes_status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    OBICommands.show_changes_status = OBIStatus.IN_PROCESS;

    const ws: string = Workspace.get_workspace();
    const config = AppConfig.get_app_confg();

    let buff: Buffer;

    if (OBITools.is_native())
      await OBITools.generate_source_change_lists();
    else {
      buff = execSync(`cd ${Workspace.get_workspace()}; ${OBITools.get_local_obi_python_path()} -X utf8 ${config.general['local-obi-dir']}/main.py -a create -p .`);
    }

    BuildSummary.render(context.extensionUri, Workspace.get_workspace_uri());

    OBICommands.show_changes_status = OBIStatus.READY;
    OBIController.run_finished();
    OBIController.update_build_summary_timestamp();

    return;
  }




  public static async reset_compiled_object_list() {

    const config = AppConfig.get_app_confg();

    if (!config.general['compiled-object-list'])
      throw Error(`Invalid config for config.general['compiled-object-list']: ${config.general['compiled-object-list']}`);

    const object_list_file: string = config.general['compiled-object-list'];
    let toml_dict: {} = {};

    const source_hashes: source.ISource[] = await OBITools.retrieve_current_source_hashes();

    source_hashes.map((source: source.ISource) => {
      const source_name: string = Object.keys(source)[0];
      toml_dict[source_name.replaceAll('\\', '/')] = {hash: source[source_name].hash};
    });
    DirTool.write_toml(join(Workspace.get_workspace(), object_list_file), toml_dict);

    vscode.window.showInformationMessage(`Object list created`);
    return;
  }



  /**
   * Generates remote source list.
   * 
   * It's similar to object list.
   * 
   * @returns 
   */
  public static async get_remote_source_list(): Promise<void> {

    if (OBICommands.remote_source_list_status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    OBICommands.remote_source_list_status = OBIStatus.IN_PROCESS;

    try {

      const ws = Workspace.get_workspace();
      const config = AppConfig.get_app_confg();
      const remote_base_dir: string|undefined = config.general['remote-base-dir'];
      const remote_obi_dir: string|undefined = config.general['remote-obi-dir'];

      if (!remote_base_dir || !remote_obi_dir)
        throw Error(`Missing 'remote_base_dir' or 'remote_obi_dir'`);

      const remote_obi: string = path.join(remote_obi_dir, Constants.REMOTE_OBI_PYTHON_PATH);

      await SSH_Tasks.transfer_files([Constants.OBI_APP_CONFIG_FILE, Constants.OBI_APP_CONFIG_USER_FILE]);

      let ssh_cmd: string = `source .profile; cd '${remote_base_dir}' || exit 1; rm log /* 2>/dev/null || true; ${remote_obi} -X utf8 ${remote_obi_dir}/main.py -a gen_src_list -p .`;
      await SSH_Tasks.executeCommand(ssh_cmd);

      if (config.general['remote-source-list'] && config.general['source-list'])
        await SSH_Tasks.getRemoteFile(path.join(ws, config.general['remote-source-list']), path.join(remote_base_dir, config.general['source-list']));

      vscode.window.showInformationMessage('Remote source list transfered from remote');
    }
    catch (e: any) {
      OBICommands.remote_source_list_status = OBIStatus.READY;
      vscode.window.showErrorMessage(e.message);
      vscode.window.showErrorMessage('Failed to get remote source list');
      logger.error(e.message);
      throw e;
    }
    OBICommands.remote_source_list_status = OBIStatus.READY;

    return;
  }



  public static async get_remote_compiled_object_list() {

    const config = AppConfig.get_app_confg();
    const remote_base_dir: string|undefined = config.general['remote-base-dir'];
    const remote_obi_dir: string|undefined = config.general['remote-obi-dir'];

    if (!remote_base_dir || !remote_obi_dir)
      throw Error(`Missing config 'remote-base-dir' or 'remote-obi-dir'`);

    if (!config.general['compiled-object-list'])
      throw Error(`Missing config 'compiled-object-list'`);

    await SSH_Tasks.getRemoteFile(path.join(Workspace.get_workspace(), config.general['compiled-object-list']), path.join(remote_base_dir, config.general['compiled-object-list']));

    vscode.window.showInformationMessage('Compiled object list transfered from remote');

	}

}