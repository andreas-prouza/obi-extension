import * as vscode from 'vscode';
import {NodeSSH, SSHExecCommandResponse} from 'node-ssh';
import { Workspace } from './Workspace';
import * as path from 'path';
import { AppConfig } from '../webview/controller/AppConfig';
import { fail } from 'assert';
import { Constants } from '../Constants';
import { logger } from './Logger';
import { config } from 'process';



interface FileTransfer {
  local: string,
  remote: string
}


export class SSH_Tasks {

  private static ssh = new NodeSSH();
  public static context: vscode.ExtensionContext;


  public static async connect(callback?: Function) {

    const config = AppConfig.get_app_confg();
    let host = config.connection['remote-host'];
    let user = config.connection['ssh-user'];
    const ssh_key = config.connection['ssh-key'];


    if (!host || host.length == 0) {
      host = await vscode.window.showInputBox({ title: `Enter an IBM i hostname/IP`, placeHolder: "my-ibm-i" });
      if (! host)
        throw new Error('Canceled by user. No host provided');
    }

    if (!user || user.length == 0) {
      user = await vscode.window.showInputBox({ title: `Enter your user for ${host}`, placeHolder: "usrprf" });
      if (! user)
        throw new Error('Canceled by user. No user provided');
    }

    let pwd: string | undefined = await SSH_Tasks.context.secrets.get(`obi|${host}|${user}`);
    if (! pwd && (!ssh_key || ssh_key.length == 0)) {
      pwd = await vscode.window.showInputBox({ title: `Enter your password for ${user}@${host}`, placeHolder: "password", password: true });
      if (! pwd)
        throw new Error('Canceled by user. No password provided');
    }

    if (SSH_Tasks.ssh.isConnected())
      return;

    await SSH_Tasks.ssh.connect({
      host: host,
      username: user,
      password: pwd,
      privateKeyPath: ssh_key,
      keepaliveInterval: 3600
    }).catch((reason) => {
      vscode.window.showErrorMessage(reason.message);
      logger.error(`Connection error: ${reason.message}`);
      throw reason;
    });
    vscode.window.showInformationMessage(`Connected to ${host}`);
    logger.info(`Connected to ${host}`);

    if (callback) {
      const result = await callback();
      return result;
    }
  }



  public static async executeCommand(cmd: string, again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()) {
      if (again) {
        throw Error(`Could not connect to remote server`);
      }
      const func = ()=> {SSH_Tasks.executeCommand(cmd, true)};
      await SSH_Tasks.connect(func);
      return;
    }

    logger.info(`Execute: ${cmd}`);
    const result = await SSH_Tasks.ssh.execCommand(cmd);
    
    logger.info(`CODE: ${result.code}`);
    logger.info(`STDOUT: ${result.stdout}`);
    if (result.stderr.length > 0)
      logger.error(`STDERR: ${result.stderr}`);

    if (result.code != 0)
      throw Error(result.stderr);

  }



  public static async getRemoteFile(local: string, remote: string, again?: boolean): Promise<void> {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.getRemoteFile(local, remote, true)};
      await SSH_Tasks.connect(func);
      return;
    }

    logger.info(`Get remote file. LOCAL: ${local}, REMOTE: ${remote}`);
    await SSH_Tasks.ssh.getFile(local, remote);
  }



  public static async getRemoteDir(local: string, remote: string, again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.getRemoteDir(local, remote, true)};
      await SSH_Tasks.connect(func);
      return;
    }

    let failed: string[]=[];
    let successful: string[]=[];

    await SSH_Tasks.ssh.getDirectory(local, remote, 
      { recursive: true, 
        concurrency: AppConfig.get_app_confg().connection['ssh-concurrency'] ?? 5,
        validate: function(itemPath) {
          const baseName = path.basename(itemPath)
          return baseName !== '.git' && // Don't send git directory
                 baseName !== '.vscode' &&
                 baseName !== '.theia' &&
                 baseName !== '.project' &&
                 baseName !== '.gitignore'
        },
        tick: function(localPath, remotePath, error) { // Remember transfer status
          if (error) {
            failed.push(localPath)
            logger.error(`Transfer error: ${error}; Local: ${localPath}, Remote: ${remotePath}`);
          } else {
            //logger.debug(`Transfered: Local: ${localPath}, Remote: ${remotePath}`);
            successful.push(localPath)
          }
        }
      });
      
      if (failed.length > 0)
        logger.error(`Failed to transfer ${failed}`);
      logger.debug(`Transfered: ${successful}`);
  }



  public static async check_remote_paths(files: string[], again?: boolean): Promise<boolean> {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return false;
      }
      await SSH_Tasks.connect();
      return SSH_Tasks.check_remote_paths(files, true);
    }

    let cmd = 'bash; ';
    let first = true;
    files.forEach((file) => {
      if (! first)
        cmd = `${cmd} && `;
      cmd = `${cmd} ls "${file}"`;
      first = false;
    })

    logger.info(`Check path: ${cmd}`);
    const result = await SSH_Tasks.ssh.execCommand(cmd);

    logger.info(`CODE: ${result.code}`);
    logger.info(`STDOUT: ${result.stdout}`);
    if (result.stderr.length > 0)
      logger.error(`STDERR: ${result.stderr}`);

    return result.code == 0;
  }




  public static async delete_sources(source_list: string[], again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.delete_sources(source_list, true)};
      await SSH_Tasks.connect(func);
      return;
    }
    
    const config = AppConfig.get_app_confg();
    if (!config.general['remote-base-dir'] || !config.general['local-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' or 'config.general.local-base-dir' missing`);
    
    const source_dir: string = config.general['source-dir'] ?? 'src';
    const local_source_dir: string = path.join(Workspace.get_workspace(), config.general['local-base-dir'], source_dir);
    const remote_source_dir: string = `${config.general['remote-base-dir']}/${source_dir}`;
    
    let cmds: Promise<SSHExecCommandResponse>[] = [];

    source_list.map((file: string) => {
      cmds.push(SSH_Tasks.ssh.execCommand(`rm ${remote_source_dir}/${file}`));
    })

    await Promise.all(cmds);
  }



  public static async create_remote_project_dir(): Promise<void> {
    const config = AppConfig.get_app_confg();
    if (!config.general['remote-base-dir'] || config.general['remote-base-dir'].length < 4) // to be sure it's not root!
    throw Error(`Config attribute 'config.general.remote_base_dir' invalid: ${config.general['remote-base-dir']}`);
  
    const remote_base_dir: string = config.general['remote-base-dir'];
    const remote_src_dir: string = `${remote_base_dir}/${config.general['source-dir']||'src'}`;
    const remote_build_out_dir: string = `${remote_base_dir}/${config.general['build-output-dir'] || Constants.BUILD_OUTPUT_DIR}`;
    const remote_src_filter_dir: string = `${remote_base_dir}/${Constants.SOURCE_FILTER_FOLDER_NAME}`;
    const cmd = `mkdir -p ${remote_src_dir} ${remote_build_out_dir} ${remote_src_filter_dir}`;

  }



  public static async cleanup_directory(again?: boolean, return_value?: boolean): Promise<boolean> {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return false;
      }
      let return_value2 = false;
      const func = ()=> {SSH_Tasks.cleanup_directory(true, return_value2)};
      await SSH_Tasks.connect(await func);
      return return_value2;
    }
    
    const config = AppConfig.get_app_confg();
    if (!config.general['remote-base-dir'] || config.general['remote-base-dir'].length < 4) // to be sure it's not root!
      throw Error(`Config attribute 'config.general.remote_base_dir' invalid: ${config.general['remote-base-dir']}`);
    
    const remote_base_dir: string = config.general['remote-base-dir'];
    const answer = await vscode.window.showInformationMessage(`Process with remote folder: '${remote_base_dir}'?`, { modal: true }, ...['Yes', 'No']);
    switch (answer) {
      case 'No':
        throw new Error('Transfer canceled by user');
      case undefined:
        throw new Error('Transfer canceled by user');
      case 'Yes':
        break;
    }

    const cmd = `/QOpenSys/pkgs/bin/bash; source .profile; cd ${remote_base_dir} 2> /dev/null || mkdir -p ${remote_base_dir} && cd ${remote_base_dir} && echo "pwd: $(pwd)" || exit 1; [ \`echo $(pwd) | wc -c\` -ge 3 ] &&  echo "Current dir: $(pwd)" ||  exit 1  ;  echo "Change back from $(pwd)" &&  cd  && echo "pwd 2: $(pwd)" && rm -rf ${remote_base_dir}`;
    logger.info(`Execute cmd: ${cmd}`);
    const result = await SSH_Tasks.ssh.execCommand(cmd);

    logger.info(`CODE: ${result.code}`);
    logger.info(`STDOUT: ${result.stdout}`);
    if (result.stderr.length > 0) {
      logger.error(`STDERR: ${result.stderr}`);
      vscode.window.showErrorMessage(result.stderr);
    }

    return_value = result.code == 0;
    logger.info(`Finished cleanup: ${return_value}`);
    return return_value;
  }



  public static async transferSources(source_list: string[], again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.transferSources(source_list, true)};
      await SSH_Tasks.connect(func);
      return;
    }
    
    const config = AppConfig.get_app_confg();
    if (!config.general['remote-base-dir'] || !config.general['local-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' or 'config.general.local-base-dir' missing`);
    
    const source_dir: string = config.general['source-dir'] ?? 'src';
    const local_source_dir: string = path.join(Workspace.get_workspace(), config.general['local-base-dir'], source_dir);
    const remote_source_dir: string = `${config.general['remote-base-dir']}/${source_dir}`;
    
    let transfer_list: FileTransfer[] = [
      {
        local: path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_FILE),
        remote: `${config.general['remote-base-dir']}/${Constants.OBI_APP_CONFIG_FILE}`,
      },
      {
        local: path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_USER_FILE),
        remote: `${config.general['remote-base-dir']}/${Constants.OBI_APP_CONFIG_USER_FILE}`,
      },
      {
        local: path.join(Workspace.get_workspace(), '.obi', 'etc', 'constants.py'),
        remote: `${config.general['remote-base-dir']}/.obi/etc/constants.py`,
      }
    ];

    source_list.map((source: string) => {

      transfer_list.push({
        local: path.join(local_source_dir, source),
        remote: `${remote_source_dir}/${source}`,
      })
    });

    logger.info(`Transfer files: ${source_list}`);

    await SSH_Tasks.ssh.putFiles(transfer_list, {concurrency: config.connection['ssh-concurrency'] ?? 5 });

    if (transfer_list.length == 1)
      vscode.window.showInformationMessage(`1 source transfered`);
    else
      vscode.window.showInformationMessage(`${transfer_list.length} sources transfered`);
  }




  public static async transfer_files(file_list: string[], again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.transfer_files(file_list, true)};
      await SSH_Tasks.connect(func);
      return;
    }
    
    const config = AppConfig.get_app_confg();
    if (!config.general['remote-base-dir'] || !config.general['local-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' missing`);
    const local_base_dir: string = path.join(Workspace.get_workspace(), config.general['local-base-dir']);
    const remote_base_dir: string = config.general['remote-base-dir'];

    logger.info(`Transfer: ${file_list}`);

    let transfer_list: FileTransfer[] = [];

    file_list.map((file: string) => {
      transfer_list.push({
        local: path.join(local_base_dir, file),
        remote: `${remote_base_dir}/${file}`,
      })
    });

    await SSH_Tasks.ssh.putFiles(transfer_list, {concurrency: config.connection['ssh-concurrency'] ?? 5 });
  }




  public static async transfer_dir(local_dir: string, remote_dir: string, again?: boolean) {

    // With Compression!!!!
    // https://stackoverflow.com/questions/15641243/need-to-zip-an-entire-directory-using-node-js

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.transfer_dir(local_dir, remote_dir, true)};
      await SSH_Tasks.connect(func);
      return;
    }

    let final_message: string = "";

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Transfer project`,
    }, 
    async progress => {
      progress.report({
        message: `Start transfer.`
      });

      var startTime = performance.now();

      let failed: string[] = [];
      let successful: string[] = [];

      //##############################
      // SSH transfer folder
      //##############################
      const status = await SSH_Tasks.ssh_put_dir(local_dir, remote_dir, failed, successful);
      if (status)
        vscode.window.showInformationMessage(`${successful.length} files were successfully transfered to ${remote_dir}`);
      else
        throw new Error(`${successful.length} of ${failed.length} failed transfered to ${remote_dir}`);

      var endTime = performance.now();

      final_message = `Finished transfer in ${(endTime - startTime)/1000} seconds.`
    });

    vscode.window.showInformationMessage(final_message);
    logger.info(final_message);

  }
  

  private static async ssh_put_dir(local_dir: string, remote_dir: string, failed: string[], successful: string[], again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.ssh_put_dir(local_dir, remote_dir, failed, successful, true)};
      await SSH_Tasks.connect(func);
      return;
    }
    
    logger.debug(`Send directory. Local: ${local_dir}, remote: ${remote_dir}`);

    const result: boolean = await SSH_Tasks.ssh.putDirectory(local_dir, remote_dir, {
      recursive: true,
      concurrency: AppConfig.get_app_confg().connection['ssh-concurrency'] ?? 5,
      validate: function(itemPath) {
        const baseName = path.basename(itemPath)
        return baseName !== '.git' && // Don't send git directory
               baseName !== '.vscode' &&
               baseName !== '.theia' &&
               baseName !== '.project' &&
               baseName.slice(-4) !== '.pyc' && // Python cache
               baseName !== '.gitignore'
      },
      tick: function(localPath, remotePath, error) { // Remember transfer status
        if (error) {
          failed.push(localPath)
        } else {
          successful.push(localPath)
        }
      }
      });

      if (failed.length > 0)
        logger.error(`Failed to transfer ${failed}`);
      logger.debug(`Transfered: ${successful}`);

      return result;
  }

}