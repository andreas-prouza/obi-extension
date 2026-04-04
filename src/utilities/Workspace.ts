import * as vscode from 'vscode';
import { DirTool } from './DirTool';
import path from 'path';
import { Constants } from '../Constants';
import { logger } from './Logger';
import { OBIConfiguration } from '../webview/controller/OBIConfiguration';


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

    if (!vscode.workspace.workspaceFolders) {
      logger.error('No workspace available');
      throw new Error('No workspace available');
    }

    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }


  public static change_profile(profile_name: string) {

    const settings = Workspace.get_workspace_settings();
    settings.current_profile = profile_name;
    Workspace.update_workspace_settings(settings);
    OBIConfiguration.update();

  }

}