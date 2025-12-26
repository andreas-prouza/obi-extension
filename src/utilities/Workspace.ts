import * as vscode from 'vscode';
import { DirTool } from './DirTool';
import path from 'path';
import { Constants } from '../Constants';


export class WorkspaceSettings {
  current_profile?: string;
  
}


export class Workspace {

  public static update_workspace_settings(settings: WorkspaceSettings) {
    DirTool.write_json(path.join(Workspace.get_workspace(), Constants.OBI_WORKSPACE_SETTINGS_FILE), settings);
  }

  public static get_workspace_settings(): WorkspaceSettings {
    const result: WorkspaceSettings = DirTool.get_json(path.join(Workspace.get_workspace(), Constants.OBI_WORKSPACE_SETTINGS_FILE)) ?? {};
    return result;
  }

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