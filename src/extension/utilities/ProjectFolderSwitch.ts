import * as vscode from 'vscode';
import { current_folder, obi_folders, set_chosen_folder } from './ObiFolder';
import { OperationLock } from './OperationLock';
import { logger } from './Logger';


/** workspaceState: URI of the OBI project folder to work with, in a workspace with several */
export const PROJECT_FOLDER_KEY = 'obi.project-folder';


/** At activation, before anything asks for the folder */
export function restore_project_folder(context: vscode.ExtensionContext): void {
  set_chosen_folder(context.workspaceState.get<string>(PROJECT_FOLDER_KEY));
}


/**
 * OBI: Switch project folder. Picks one of the OBI projects of the workspace, stores it and reloads the window:
 * views, watchers, caches, the SSH connection and open panels all start with the new project. Refused while an
 * operation runs. Returns the picked folder, or undefined if nothing changed.
 */
export async function switch_project_folder(context: vscode.ExtensionContext): Promise<vscode.WorkspaceFolder | undefined> {
  const projects = obi_folders();
  const current = current_folder();
  if (projects.length < 2) {
    vscode.window.showInformationMessage(vscode.l10n.t('This workspace has only one OBI project.'));
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(projects.map(folder => ({
    label: folder.name,
    description: folder.uri.toString() === current?.uri.toString() ? vscode.l10n.t('current') : undefined,
    detail: folder.uri.fsPath,
    folder
  })), { title: vscode.l10n.t('Switch OBI project folder'), placeHolder: vscode.l10n.t('OBI project to work with') });
  if (!picked || picked.folder.uri.toString() === current?.uri.toString())
    return undefined;

  if (OperationLock.running) {
    vscode.window.showWarningMessage(vscode.l10n.t('{0} is running. Switch the project folder when it has finished.', OperationLock.running));
    return undefined;
  }

  const reload = vscode.l10n.t('Switch and reload');
  const answer = await vscode.window.showWarningMessage(
    vscode.l10n.t('Work with the OBI project {0}?', picked.folder.name),
    { modal: true, detail: vscode.l10n.t('The window is reloaded, so all OBI views start with the new project.') },
    reload);
  if (answer !== reload)
    return undefined;

  await context.workspaceState.update(PROJECT_FOLDER_KEY, picked.folder.uri.toString());
  logger.info(`Project folder: ${picked.folder.uri.fsPath}`);
  await vscode.commands.executeCommand('workbench.action.reloadWindow');
  return picked.folder;
}
