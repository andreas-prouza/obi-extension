import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Constants } from '../../shared/Constants';


/** All folders of the workspace with an OBI project */
export function obi_folders(): vscode.WorkspaceFolder[] {
  return (vscode.workspace.workspaceFolders ?? []).filter(folder => {
    try {
      return fs.statSync(path.join(folder.uri.fsPath, Constants.OBI_APP_CONFIG_FILE)).isFile();
    }
    catch {
      return false;
    }
  });
}


/** URI of the project folder chosen with "OBI: Switch project folder" (workspaceState, set at activation) */
let chosen_folder: string | undefined;

export function set_chosen_folder(uri: string | undefined): void {
  chosen_folder = uri;
}


/**
 * The folder OBI works with: with several OBI projects the chosen one, else the first one with an OBI project,
 * otherwise the first folder (for Initialize). The only place that picks a workspace folder; in a multi-root
 * workspace it can be any of them.
 */
export function current_folder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0)
    return undefined;
  if (folders.length === 1)
    return folders[0];
  const projects = obi_folders();
  return projects.find(folder => folder.uri.toString() === chosen_folder) ?? projects[0] ?? folders[0];
}
