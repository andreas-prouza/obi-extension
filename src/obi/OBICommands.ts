import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";

import { exec, execSync } from "child_process";
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
import { config } from 'winston';


export class OBICommands {


  public static run_build_status: OBIStatus = OBIStatus.READY;
  public static show_changes_status: OBIStatus = OBIStatus.READY;
  public static remote_source_list_status: OBIStatus = OBIStatus.READY;
  public static reset_compiled_object_list_status: OBIStatus = OBIStatus.READY;



  public static async run_build_process(source?: string) {

    const ws = Workspace.get_workspace();
    const config = AppConfig.get_app_confg();
    const remote_base_dir: string|undefined = config.general['remote-base-dir'];
    const remote_obi_dir: string|undefined = config.general['remote-obi-dir'];
    
    if (!remote_base_dir || !remote_obi_dir)
      throw Error(`Missing 'remote_base_dir' or 'remote_obi_dir'`);
    
    const remote_obi: string|undefined = await OBITools.get_remote_obi_python_path();
    if (!remote_obi)
      throw Error(`OBI path is not korrekt`);

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Run build`,
    }, 
    async progress => {
      
      let ssh_cmd: string = '';

      progress.report({
        message: `Get changed source list`
      });

      let source_list: string[] = [source||''];
      if (!source)
        source_list = await OBITools.generate_source_change_lists();

      if (source_list.length == 0) {
        vscode.window.showWarningMessage("No changed sources to build");
        return;
      }

      progress.report({
        message: `Check remote project folder`
      });

      let check: boolean = await OBITools.check_remote();

      if (!check) {
        return false;
      }

      progress.report({
        message: `Count of source transfer: ${source_list.length}`
      });
      const result = await SSH_Tasks.transferSources(source_list);

      if (!OBITools.without_local_obi()) {

        progress.report({
          message: `Generate build script by local OBI.`
        });
        let cmd = `${OBITools.get_local_obi_python_path()} -X utf8 ${path.join(config.general['local-obi-dir'], 'main.py')} -a create -p .`;
        if (source)
          cmd = `${cmd} --source "${source}"`;
        logger.info(`CMD: ${cmd}`);
        const child = await OBICommands.run_system_cmd(Workspace.get_workspace(), cmd);

        progress.report({
          message: `Transfer build list to remote.`
        });
        await SSH_Tasks.transfer_files([config.general['compile-list']]);
        await SSH_Tasks.transfer_dir(path.join(Workspace.get_workspace(), Constants.OBI_TMP_DIR), `${config.general['remote-base-dir']}/${Constants.OBI_TMP_DIR}`);
  
      }
      else {

        progress.report({
          message: `Generate build script on remote. If it takes too long, use OBI localy (see documentation).`
        });
        ssh_cmd = `source .profile; cd '${remote_base_dir}' || exit 1; rm log/* .obi/log/* 2> /dev/null || true; ${remote_obi} -X utf8 ${remote_obi_dir}/main.py -a create -p .`;
        if (source)
          ssh_cmd = `${ssh_cmd} --source "${source}"`;
        await SSH_Tasks.executeCommand(ssh_cmd);

      }

      progress.report({
        message: `Run build on IBM i`
      });

      ssh_cmd = `source .profile; cd '${remote_base_dir}' || exit 1; rm log/* .obi/log/* 2> /dev/null || true; ${remote_obi} -X utf8 ${remote_obi_dir}/main.py -a run -p .`;
      await SSH_Tasks.executeCommand(ssh_cmd);

      progress.report({
        message: `Get all outputs back to you`
      });

      let promise_list = [
        SSH_Tasks.getRemoteDir(path.join(ws, Constants.BUILD_OUTPUT_DIR), `${remote_base_dir}/${Constants.BUILD_OUTPUT_DIR}`),
        SSH_Tasks.getRemoteDir(path.join(ws, '.obi', 'tmp'), `${remote_base_dir}/.obi/tmp`),
        SSH_Tasks.getRemoteDir(path.join(ws, '.obi', 'log'), `${remote_base_dir}/.obi/log`)
      ];

      if (config.general['compiled-object-list'])
        promise_list.push(SSH_Tasks.getRemoteFile(path.join(ws, config.general['compiled-object-list']), `${remote_base_dir}/${config.general['compiled-object-list']}`));


      await Promise.all(promise_list);

    });
  }




  public static get_current_active_source(): string|undefined {
    if (!vscode.window.activeTextEditor) {
      vscode.window.showWarningMessage('No active source');
      return undefined;
    }

    const config = AppConfig.get_app_confg();

    let source = vscode.window.activeTextEditor.document.fileName.replace(path.join(Workspace.get_workspace(), AppConfig.get_app_confg().general['source-dir']||'src'), '');
    source = source.replaceAll('\\', '/');
    if (source.charAt(0) == '/')
      source = source.substring(1);

    if (!config.general['supported-object-types'].includes(source.split('.').pop())) {
      vscode.window.showWarningMessage(`${source} is not a supported source type`);
      return undefined;
    }

    if (!DirTool.file_exists(path.join(Workspace.get_workspace(), config.general['source-dir'], source))) {
      vscode.window.showWarningMessage(`${source} does not exist in current source directory (${path.join(Workspace.get_workspace(), config.general['source-dir'])})`);
      return undefined;
    }

    logger.info(`Source: ${source}`);

    return source
  }



  public static async run_single_build(context: vscode.ExtensionContext) {

    const source = OBICommands.get_current_active_source();

    if (!source)
      return OBIController.run_finished();

    OBICommands.run_build(context, source);
  }




  public static async run_build(context: vscode.ExtensionContext, source?: string) {

    if (OBICommands.run_build_status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    OBICommands.run_build_status = OBIStatus.IN_PROCESS;

    const ws_uri = Workspace.get_workspace_uri();
    let buff;

    OBICommands.show_changes(context, source);

    try {
      await OBICommands.run_build_process(source);

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



  public static async show_single_changes(context: vscode.ExtensionContext) {
    const source = OBICommands.get_current_active_source();

    if (!source)
      return OBIController.run_finished();

    OBICommands.show_changes(context, source);
  }




  public static async show_changes(context: vscode.ExtensionContext, source?: string) {

    if (OBICommands.show_changes_status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    OBICommands.show_changes_status = OBIStatus.IN_PROCESS;

    const ws: string = Workspace.get_workspace();
    const config = AppConfig.get_app_confg();

    let child;

    try {
      if (OBITools.without_local_obi())
        await OBITools.generate_source_change_lists(source);
      else {
        logger.info(`WS: ${Workspace.get_workspace()}`);
        let cmd = `${OBITools.get_local_obi_python_path()} -X utf8 ${path.join(config.general['local-obi-dir'], 'main.py')} -a create -p .`;
        if (source)
          cmd = `${cmd} --source "${source}"`;
        logger.info(`CMD: ${cmd}`);
        child = await OBICommands.run_system_cmd(Workspace.get_workspace(), cmd);
      }

      BuildSummary.render(context.extensionUri, Workspace.get_workspace_uri());
    }
    catch(e: any) {
      vscode.window.showErrorMessage(e.message);
    }

    OBICommands.show_changes_status = OBIStatus.READY;
    OBIController.run_finished();
    OBIController.update_build_summary_timestamp();

    return;
  }




  public static async run_system_cmd(cwd: string, cmd: string) {

    const stdout = execSync(cmd, { cwd: cwd });
    return stdout;
  }




  public static async reset_compiled_object_list() {

    if (OBICommands.reset_compiled_object_list_status != OBIStatus.READY) {
      vscode.window.showErrorMessage('OBI process is already running');
      return;
    }

    OBICommands.reset_compiled_object_list_status = OBIStatus.IN_PROCESS;

    const config = AppConfig.get_app_confg();

    try {
      if (!config.general['compiled-object-list'])
        throw Error(`Invalid config for config.general['compiled-object-list']: ${config.general['compiled-object-list']}`);

      const object_list_file: string = config.general['compiled-object-list'];
      let json_dict: {} = {};

      const source_hashes: source.ISource[] = await OBITools.retrieve_current_source_hashes();

      source_hashes.map((source: source.ISource) => {
        const source_name: string = Object.keys(source)[0];
        json_dict[source_name.replaceAll('\\', '/')] = source[source_name];
      });
      DirTool.write_json(join(Workspace.get_workspace(), object_list_file), json_dict);
      vscode.window.showInformationMessage(`Object list created`);
      
      await SSH_Tasks.transfer_files([object_list_file]);
      vscode.window.showInformationMessage(`Object list transfered to IBM i`);
    }
    catch(e: any) {
      vscode.window.showErrorMessage(e.message);
    }

    OBICommands.reset_compiled_object_list_status = OBIStatus.READY;
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

      const remote_obi: string|undefined = `${config.general['remote-obi-dir']}/venv/bin/python`;

      await SSH_Tasks.transfer_files([Constants.OBI_APP_CONFIG_FILE, Constants.OBI_APP_CONFIG_USER_FILE]);

      let ssh_cmd: string = `source .profile; cd '${remote_base_dir}' || exit 1; rm log/* .obi/log/* 2>/dev/null || true; ${remote_obi} -X utf8 ${remote_obi_dir}/main.py -a gen_src_list -p .`;
      await SSH_Tasks.executeCommand(ssh_cmd);

      if (config.general['remote-source-list'] && config.general['source-list'])
        await SSH_Tasks.getRemoteFile(path.join(ws, config.general['remote-source-list']), `${remote_base_dir}/${config.general['source-list']}`);

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

    await SSH_Tasks.getRemoteFile(path.join(Workspace.get_workspace(), config.general['compiled-object-list']), `${remote_base_dir}/${config.general['compiled-object-list']}`);

    vscode.window.showInformationMessage('Compiled object list transfered from remote');

	}

}