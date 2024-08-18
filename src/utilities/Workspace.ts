import * as vscode from 'vscode';




export class Workspace {



  public static get_workspace_uri(): vscode.Uri {

    if (!vscode.workspace.workspaceFolders)
      throw new Error('No workspace available');

    return vscode.workspace.workspaceFolders[0].uri;
  }



  public static get_workspace(): string {

    if (!vscode.workspace.workspaceFolders)
      throw new Error('No workspace available');

    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }

}