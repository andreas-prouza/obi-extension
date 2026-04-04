import * as vscode from 'vscode';
import {NodeSSH, SSHExecCommandResponse} from 'node-ssh';
import { Workspace } from './Workspace';
import * as path from 'path';
import { AppConfig } from '../webview/controller/AppConfig';
import { Constants } from '../Constants';
import { logger } from './Logger';



interface FileTransfer {
  local: string,
  remote: string
}




export class SSH_Tasks {

  private static ssh = new NodeSSH();
  public static context: vscode.ExtensionContext;

  private static ssh_user: string | undefined = undefined;
  private static host: string | undefined = undefined;
  private static connectionPromise: Promise<boolean> | undefined = undefined;


  public static get_ssh_user(): string | undefined {
    return SSH_Tasks.ssh_user;
  }




  public static get_finalized_command(cmd: string): string {
    // Execute command in bash shell
    return `bash -c '${cmd.replace(/'/g, "''")}'`.
        replace("${workspaceFolderBasename}", path.basename(Workspace.get_workspace() || 'workspace'));
  }


  public static get_finalized_remote_path(path_string: string): string {
    // Execute command in bash shell
    const ssh_user = SSH_Tasks.get_ssh_user() || 'UNKNOWN';
    return path_string.replace(/\$USER/g, ssh_user)
               .replace(/~/g, `/home/${ssh_user}`) // Replace ~ with /home/$USER
               .replace("${workspaceFolderBasename}", path.basename(Workspace.get_workspace() || 'workspace'));
  }



  private static is_connection_valid(): boolean {
    const config = AppConfig.get_app_config();
    return this.ssh.isConnected() && this.ssh.connection.config.username == config.connection['ssh-user'] && this.ssh.connection.config.host == config.connection['remote-host'];
  }



  public static async connect(callback?: Function) {

    const config = AppConfig.get_app_config();;

    if (this.is_connection_valid()) {
      if (callback) return await callback();
      return;
    }

    // If a connection is ALREADY in progress, wait for that one
    if (this.connectionPromise) {
      logger.info("Connection already in progress, awaiting existing attempt...");
      await this.connectionPromise;
      if (callback) return await callback();
      return;
    }

    // No connection in progress? Create a new one and store the promise
    this.connectionPromise = (async () => {
      try {
        const config = AppConfig.get_app_config();
        SSH_Tasks.host = config.connection['remote-host'];
        SSH_Tasks.ssh_user = config.connection['ssh-user'];
        const ssh_key = config.connection['ssh-key'];

        if (!SSH_Tasks.host || SSH_Tasks.host.length == 0) {
          SSH_Tasks.host = await vscode.window.showInputBox({ title: `Enter an IBM i hostname/IP`, placeHolder: "my-ibm-i" });
          if (! SSH_Tasks.host)
            throw new Error('Canceled by user. No host provided');
        }

        if (!SSH_Tasks.ssh_user || SSH_Tasks.ssh_user.length == 0) {
          SSH_Tasks.ssh_user = await vscode.window.showInputBox({ title: `Enter your user for ${SSH_Tasks.host}`, placeHolder: "usrprf" });
          if (! SSH_Tasks.ssh_user)
            throw new Error('Canceled by user. No user provided');
        }

        let pwd: string | undefined = await SSH_Tasks.context.secrets.get(`obi|${SSH_Tasks.host}|${SSH_Tasks.ssh_user}`);
        if (! pwd && (!ssh_key || ssh_key.length == 0)) {
          pwd = await vscode.window.showInputBox({ title: `Enter your password for ${SSH_Tasks.ssh_user}@${SSH_Tasks.host}`, placeHolder: "password", password: true });
          if (! pwd)
            throw new Error('Canceled by user. No password provided');
        }

        if (this.is_connection_valid())
          return;

        await SSH_Tasks.ssh.connect({
          host: SSH_Tasks.host,
          username: SSH_Tasks.ssh_user,
          password: pwd,
          privateKeyPath: ssh_key,
          keepaliveInterval: 3600
        }).catch((reason) => {
          vscode.window.showErrorMessage(reason.message);
          logger.error(`Connection error: ${reason.message}`);
          throw reason;
        });
        vscode.window.showInformationMessage(`Connected to ${SSH_Tasks.host}`);
        logger.info(`Connected to ${SSH_Tasks.host}`);

        if (callback) {
          const result = await callback();
          return result;
        }
      } catch (reason: any) {
        vscode.window.showErrorMessage(reason.message);
        logger.error(`Connection error: ${reason.message}`);
        throw reason; // Bubble up
      } finally {
        // IMPORTANT: Clear the gatekeeper when done (success or fail)
        this.connectionPromise = undefined;
      }
    })();

    await this.connectionPromise;

    if (callback) {
      return await callback();
    }
  }



  public static async executeCommand(cmd: string, again?: boolean) {

    await this.connect();
    cmd = this.get_finalized_command(cmd);

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

    await this.connect();

    remote = SSH_Tasks.get_finalized_remote_path(remote);
    logger.info(`Get remote file. LOCAL: ${local}, REMOTE: ${remote}`);
    await SSH_Tasks.ssh.getFile(local, remote);
  }



  public static async getRemoteDir(local: string, remote: string, again?: boolean) {

    await this.connect();

    let failed: string[]=[];
    let successful: string[]=[];
    
    remote = SSH_Tasks.get_finalized_remote_path(remote);

    await SSH_Tasks.ssh.getDirectory(local, remote, 
      { recursive: true, 
        concurrency: AppConfig.get_app_config().connection['ssh-concurrency'] ?? 5,
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

    await this.connect();

    let cmd = '';
    let first = true;
    files.forEach((file) => {
      if (!first)
        cmd = `${cmd} && `;
      file = SSH_Tasks.get_finalized_remote_path(file);
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

    await this.connect();
    
    const config = AppConfig.get_app_config();
    if (!config.general['remote-base-dir'] || !config.general['local-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' or 'config.general.local-base-dir' missing`);
    
    const source_dir: string = config.general['source-dir'] ?? 'src';
    const local_source_dir: string = path.join(Workspace.get_workspace(), config.general['local-base-dir'], source_dir);
    const remote_source_dir: string = `${config.general['remote-base-dir']}/${source_dir}`;
    
    let cmds: Promise<SSHExecCommandResponse>[] = [];

    source_list.map((file: string) => {
      let file_path = `${remote_source_dir}/${file}`;
      file_path = SSH_Tasks.get_finalized_remote_path(file_path);
      cmds.push(SSH_Tasks.ssh.execCommand(`rm ${file_path}`));
    })

    await Promise.all(cmds);
  }




  public static async cleanup_directory(again?: boolean, return_value?: boolean): Promise<boolean> {

    await this.connect();
    
    const config = AppConfig.get_app_config();
    if (!config.general['remote-base-dir'] || config.general['remote-base-dir'].length < 4) // to be sure it's not root!
      throw Error(`Config attribute 'config.general.remote_base_dir' invalid: ${config.general['remote-base-dir']}`);
    
    const remote_base_dir: string = SSH_Tasks.get_finalized_remote_path(config.general['remote-base-dir']);
    const answer = await vscode.window.showInformationMessage(`Process with remote folder: '${remote_base_dir}'?`, { modal: true }, ...['Yes', 'No']);
    switch (answer) {
      case 'No':
        throw new Error('Transfer canceled by user');
      case undefined:
        throw new Error('Transfer canceled by user');
      case 'Yes':
        break;
    }

    let cmd = `cd ${remote_base_dir} 2> /dev/null || mkdir -p ${remote_base_dir} && cd ${remote_base_dir} && echo "pwd: $(pwd)" || exit 1; [ \`echo $(pwd) | wc -c\` -ge 3 ] &&  echo "Current dir: $(pwd)" ||  exit 1  ;  echo "Change back from $(pwd)" &&  cd  && echo "pwd 2: $(pwd)" && rm -rf ${remote_base_dir}`;
    cmd = SSH_Tasks.get_finalized_command(cmd);
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

    await this.connect();
    
    const config = AppConfig.get_app_config();
    if (!config.general['remote-base-dir'] || !config.general['local-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' or 'config.general.local-base-dir' missing`);
    
    const source_dir: string = config.general['source-dir'] ?? 'src';
    const local_source_dir: string = path.join(Workspace.get_workspace(), config.general['local-base-dir'], source_dir);
    let remote_base_dir: string = SSH_Tasks.get_finalized_remote_path(config.general['remote-base-dir']);
    let remote_source_dir: string = `${remote_base_dir}/${source_dir}`;
    
    let transfer_list: FileTransfer[] = [
      {
        local: path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_FILE),
        remote: `${remote_base_dir}/${Constants.OBI_APP_CONFIG_FILE}`,
      },
      {
        local: path.join(Workspace.get_workspace(), AppConfig.get_current_profile_app_config_file()),
        remote: `${remote_base_dir}/${Constants.OBI_APP_CONFIG_USER_FILE}`,
      },
      {
        local: path.join(Workspace.get_workspace(), '.obi', 'etc', 'constants.py'),
        remote: `${remote_base_dir}/.obi/etc/constants.py`,
      },
      {
        local: path.join(Workspace.get_workspace(), '.obi', 'etc', 'logger_config.py'),
        remote: `${remote_base_dir}/.obi/etc/logger_config.py`,
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

    await this.connect();
    
    const config = AppConfig.get_app_config();
    if (!config.general['remote-base-dir'] || !config.general['local-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' missing`);
    const local_base_dir: string = path.join(Workspace.get_workspace(), config.general['local-base-dir']);
    let remote_base_dir: string = SSH_Tasks.get_finalized_remote_path(config.general['remote-base-dir']);

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

    await this.connect();

    remote_dir = SSH_Tasks.get_finalized_remote_path(remote_dir);

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

    await this.connect();

    remote_dir = SSH_Tasks.get_finalized_remote_path(remote_dir);
    
    logger.debug(`Send directory. Local: ${local_dir}, remote: ${remote_dir}`);

    const result: boolean = await SSH_Tasks.ssh.putDirectory(local_dir, remote_dir, {
      recursive: true,
      concurrency: AppConfig.get_app_config().connection['ssh-concurrency'] ?? 5,
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