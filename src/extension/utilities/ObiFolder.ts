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


/**
 * The folder OBI works with: the first one with an OBI project, otherwise the first folder (for Initialize).
 * The only place that picks a workspace folder; in a multi-root workspace it can be any of them.
 */
export function current_folder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0)
    return undefined;
  return folders.length === 1 ? folders[0] : obi_folders()[0] ?? folders[0];
}
