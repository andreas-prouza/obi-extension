import * as vscode from 'vscode';
import {NodeSSH} from 'node-ssh';
import { Workspace } from './Workspace';
import path from 'path';
import { AppConfig } from '../webview/controller/AppConfig';
import { fail } from 'assert';



interface FileTransfer {
  local: string,
  remote: string
}


export class SSH_Tasks {

  private static ssh = new NodeSSH();
  public static context: vscode.ExtensionContext;


  public static async connect(callback?: Function) {

    const config = AppConfig.get_app_confg();
    let host = config['global_config']['REMOTE_HOST'];
    let user = config['global_config']['SSH_USER'];
    const ssh_key = config['global_config']['SSH_KEY'];


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
      privateKeyPath: ssh_key
    }).catch((reason) => {
      vscode.window.showErrorMessage(reason.message);
      throw reason;
    });
    vscode.window.showInformationMessage(`Connected to ${host}`);
    if (callback)
        callback();
  }



  public static async executeCommand(cmd: string, again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()) {
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.executeCommand(cmd, true)};
      await SSH_Tasks.connect(func);
      return;
    }

    console.log(cmd);
    SSH_Tasks.ssh.execCommand(cmd).then((result)=>{
      console.log('STDOUT: ' + result.stdout);
      console.log('STDERR: ' + result.stderr);
    }); // {cwd: '.' }
  }


  public static async getRemoteFile(local: string, remote: string, again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.getRemoteFile(local, remote, true)};
      await SSH_Tasks.connect(func);
      return;
    }

    return SSH_Tasks.ssh.getFile(local, remote);
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
        concurrency: 5,
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
            //failed.push(localPath)
            console.log(error);
          } else {
            //successful.push(localPath)
          }
        }
      });

      console.log(failed);
      console.log(successful);
  }



  public static async check_remote_file(file: string, again?: boolean): Promise<boolean> {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return false;
      }
      await SSH_Tasks.connect();
      return SSH_Tasks.check_remote_file(file, true);
    }

    const cmd = `ls ${file.replaceAll('"$HOME"', '~')}`;
    const result = await SSH_Tasks.ssh.execCommand(cmd);
    console.log('Code: ' + result.code);
    console.log('STDOUT: ' + result.stdout);
    console.log('STDERR: ' + result.stderr);

    return result.code == 0;
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

    let transfer_list: FileTransfer[] = [];

    const config = AppConfig.get_app_confg();
    const source_dir: string = config['app_config']['general']['source-dir'];
    const local_source_dir: string = path.join(Workspace.get_workspace(), config['app_config']['general']['local-base-dir'], source_dir);
    const remote_source_dir: string = path.join(config['app_config']['general']['remote-base-dir'], source_dir);

    source_list.map((source: string) => {

      transfer_list.push({
        local: path.join(local_source_dir, source),
        remote: path.join(remote_source_dir, source),
      })
    });

    await SSH_Tasks.ssh.putFiles(transfer_list);

    if (transfer_list.length > 1)
      vscode.window.showInformationMessage(`${transfer_list.length} sources transfered`);
    else
      vscode.window.showInformationMessage(`${transfer_list.length} source transfered`);
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

      // SSH transfer
      const status = await SSH_Tasks.ssh_put_dir(local_dir, remote_dir, failed, successful);
      if (status)
        vscode.window.showInformationMessage(`${successful.length} files were successfully transfered to ${remote_dir}`);
      else
        throw new Error(`${successful.length} of ${failed.length} failed transfered to ${remote_dir}`);

      var endTime = performance.now();

      final_message = `Finished transfer in ${(endTime - startTime)/1000} seconds.`
    });

    vscode.window.showInformationMessage(final_message);

  }
  

  private static async ssh_put_dir(local_dir: string, remote_dir: string, failed: string[], successful: string[]) {

    const x = remote_dir.replaceAll('\'"$HOME"\'', '~');!!! das alles wird escaped
    vscode.window.showInformationMessage(x);

    return await SSH_Tasks.ssh.putDirectory(local_dir, remote_dir.replaceAll('\'"$HOME"\'', '~'), {
      recursive: true,
      concurrency: 5,
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
        } else {
          successful.push(localPath)
        }
      }
      });
  }

}