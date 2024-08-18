import * as vscode from 'vscode';
import {NodeSSH} from 'node-ssh';
import { Source, SourceItem } from '../obi/Source';
import { Workspace } from './Workspace';
import path from 'path';
import { AppConfig } from '../webview/controller/AppConfig';



interface FileTransfer {
  local: string,
  remote: string
}


export class SSH_Tasks {

  private static ssh = new NodeSSH();


  public static connect(callback?: Function): void {

    const host = 'academy';

    if (SSH_Tasks.ssh.isConnected())
      return;

    SSH_Tasks.ssh.connect({
      host: host,
      username: 'prouzat1',
      privateKeyPath: '/home/andreas/.ssh/academy_user_rsa'
    }).then(()=> {
      vscode.window.showInformationMessage(`Connected to ${host}`);
      if (callback)
        callback();
    });

  }



  public static async executeCommand(cmd: string, again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()) {
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.executeCommand(cmd, true)};
      SSH_Tasks.connect(func);
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
      SSH_Tasks.connect(func);
      return;
    }

    return SSH_Tasks.ssh.getFile(local, remote);
  }



  public static async transferSources(source_list: Source[], again?: boolean) {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.transferSources(source_list, true)};
      SSH_Tasks.connect(func);
      return;
    }

    let transfer_list: FileTransfer[] = [];

    const config = AppConfig.get_app_confg();
    const source_dir: string = config['app_config']['general']['source-dir'];
    const local_source_dir: string = path.join(Workspace.get_workspace(), config['app_config']['general']['local-base-dir'], source_dir);
    const remote_source_dir: string = path.join(config['app_config']['general']['remote-base-dir'], source_dir);

    source_list.map((el: Source) => {
      const source: string = Object.keys(el)[0];

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

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.transfer_dir(local_dir, remote_dir, true)};
      SSH_Tasks.connect(func);
      return;
    }

    vscode.window.withProgress({
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
      await SSH_Tasks.ssh_put_dir(local_dir, remote_dir, failed, successful).then(function(status) {
        if (status)
          vscode.window.showInformationMessage(`${successful.length} files were successfully transfered to ${remote_dir}`);
        else
          vscode.window.showErrorMessage(`${successful.length} of ${failed.length} failed transfered to ${remote_dir}`);
      });

      var endTime = performance.now();

      progress.report({
        message: `Finished transfer in ${(endTime - startTime)/1000} seconds.`
      });
      await new Promise(f => setTimeout(f, 2000));

    });

    
  }
  

  private static async ssh_put_dir(local_dir: string, remote_dir: string, failed: string[], successful: string[]) {

    return SSH_Tasks.ssh.putDirectory(local_dir, remote_dir, {
      recursive: true,
      concurrency: 5,
      validate: function(itemPath) {
        const baseName = path.basename(itemPath)
        return baseName !== '.git' && // Don't send git directory
               baseName !== '.vscode' &&
               baseName !== '.gitignore'
      },
      tick: function(localPath, remotePath, error) { // Remember transfer status
        if (error) {
          failed.push(localPath)
        } else {
          successful.push(localPath)
        }
      }
      })

  }

}