import * as vscode from 'vscode';
import * as path from 'path';
import { AppConfig } from './AppConfig';
import { ExtendedSourceProcessingList } from './EspConfig';
import { Workspace } from '../utilities/Workspace';
import { DirTool } from '../utilities/DirTool';
import { logger } from '../utilities/Logger';
import { Constants } from '../../shared/Constants';
import { never_save_key, ssh_secret_key } from '../../shared/Profile';


type ProfileStorage = Pick<vscode.ExtensionContext, 'secrets' | 'workspaceState'>;


/**
 * Deletes the active profile after a modal confirmation: its user config, its user ESP config and its stored
 * SSH password and passphrase. Then the default profile is active. The default profile can't be deleted
 * (the page disables the button; a message from an older page is refused here).
 * Returns whether the profile was deleted.
 */
export async function delete_current_profile(storage: ProfileStorage): Promise<boolean> {

  const alias = Workspace.get_current_profile() ?? '';
  if (alias === '') {
    vscode.window.showInformationMessage(vscode.l10n.t("The default profile can't be deleted."));
    return false;
  }
  if (!AppConfig.is_known_profile(alias)) {
    logger.warn(`Delete profile: unknown profile '${alias}'`);
    return false;
  }

  const ws = Workspace.get_workspace();
  const files = [
    path.join(Constants.OBI_APP_CONFIG_DIR, AppConfig.convert_profile_alias_to_file(alias)),
    ExtendedSourceProcessingList.convert_profile_alias_to_file(alias)
  ].filter((file): file is string => file !== undefined && DirTool.file_exists(path.join(ws, file)));

  // The keys contain host and user of the profile: read them before switching to the default profile
  const connection = AppConfig.get_app_config().connection;
  const password_key = ssh_secret_key(alias, connection['remote-host'], connection['ssh-user']);

  const delete_button = vscode.l10n.t('Delete');
  const choice = await vscode.window.showWarningMessage(
    vscode.l10n.t('Delete profile {0}?', alias),
    {
      modal: true,
      detail: [
        vscode.l10n.t('These files are deleted:'),
        ...files.map(file => `• ${file}`),
        '',
        vscode.l10n.t('A stored password and key passphrase of the profile are removed from the OS keychain.')
      ].join('\n')
    },
    delete_button);
  if (choice !== delete_button)
    return false;

  Workspace.change_profile('');
  for (const file of files)
    DirTool.delete_file(path.join(ws, file));
  for (const key of [password_key, `${password_key}|passphrase`])
    await storage.secrets.delete(key);
  for (const kind of ['password', 'passphrase'] as const)
    await storage.workspaceState.update(never_save_key(alias, kind), undefined);

  logger.info(`Profile ${alias} deleted: ${files.join(', ')}`);
  return true;
}
