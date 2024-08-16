import * as vscode from 'vscode';
import {NodeSSH} from 'node-ssh';



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



  public static executeCommand(): void {

    if (SSH_Tasks.ssh.isConnected())
      SSH_Tasks.ssh.execCommand('pwd; ls -la', {cwd: '.' }).then((result)=>{
        console.log('STDOUT: ' + result.stdout);
        console.log('STDERR: ' + result.stderr);
      });

  }


  public static getRemoteFile(local: string, remote: string, again?: boolean): void {

    if (!SSH_Tasks.ssh.isConnected()){
      if (again) {
        vscode.window.showErrorMessage("Still no connection available");
        return;
      }
      const func = ()=> {SSH_Tasks.getRemoteFile(local, remote, true)};
      SSH_Tasks.connect(func);
      return;
    }

    SSH_Tasks.ssh.getFile(local, remote).then((result)=>{
    });

  }
  

}