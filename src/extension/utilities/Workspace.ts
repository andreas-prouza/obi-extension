import * as vscode from 'vscode';
import { DirTool } from './DirTool';
import path from 'path';
import { Constants } from '../../shared/Constants';
import { logger } from './Logger';
import { AppConfig } from '../config/AppConfig';
import { is_safe_profile_alias } from '../../shared/Profile';
import { CachedFiles } from '../../shared/CachedFiles';
import { current_folder, obi_folders } from './ObiFolder';


export class WorkspaceSettings {
  current_profile?: string;
  
}


export class Workspace {

  private static readonly _on_did_change_profile = new vscode.EventEmitter<string>();
  /** Fires with the alias of the new profile ('' = default) */
  public static readonly on_did_change_profile = Workspace._on_did_change_profile.event;

  private static readonly _settings = new CachedFiles<WorkspaceSettings>(
    () => [path.join(Workspace.get_workspace(), Constants.OBI_WORKSPACE_SETTINGS_FILE)],
    files => DirTool.get_json(files[0], false) ?? {}
  );
  /** Profile of the last change_profile, to tell external edits of workspace-settings.json from our own */
  private static _active_profile: string | undefined;


  public static update_workspace_settings(settings: WorkspaceSettings) {
    DirTool.write_json(path.join(Workspace.get_workspace(), Constants.OBI_WORKSPACE_SETTINGS_FILE), settings);
  }


  public static get_current_profile(): string | undefined {

    const settings = Workspace.get_workspace_settings();
    return settings.current_profile;
  }

  

  /** Shared: copy it before modifying */
  public static get_workspace_settings(): WorkspaceSettings {
    return Workspace._settings.get();
  }



  public static get_obi_folders(): vscode.WorkspaceFolder[] {
    return obi_folders();
  }


  public static find_workspace_uri(): vscode.Uri | undefined {
    return current_folder()?.uri;
  }


  public static get_workspace_uri(): vscode.Uri {
    const uri = Workspace.find_workspace_uri();
    if (!uri)
      throw new Error('No workspace available');
    return uri;
  }



  public static get_workspace(): string {
    const uri = Workspace.find_workspace_uri();
    if (!uri) {
      logger.error('No workspace available');
      throw new Error('No workspace available');
    }
    return uri.fsPath;
  }


  /** workspace-settings.json changed: switch the profile if it was edited outside of OBI */
  public static apply_profile_from_settings(): void {
    const profile = Workspace.get_workspace_settings().current_profile ?? '';
    if (profile !== Workspace._active_profile)
      Workspace.change_profile(profile);
  }


  public static change_profile(profile_name: string) {

    // The name comes from the webview or workspace-settings.json: only accept existing profiles
    if (typeof profile_name !== 'string' || !is_safe_profile_alias(profile_name) || !AppConfig.is_known_profile(profile_name)) {
      logger.warn(`Unknown profile '${profile_name}'`);
      vscode.window.showWarningMessage(vscode.l10n.t('Unknown profile \'{0}\'', String(profile_name)));
      return;
    }

    const settings = Workspace.get_workspace_settings();
    // Only if it changes: each write triggers the watcher callback for workspace-settings.json
    if ((settings.current_profile ?? '') !== profile_name)
      Workspace.update_workspace_settings({ ...settings, current_profile: profile_name });
    Workspace._active_profile = profile_name;
    Workspace._on_did_change_profile.fire(profile_name);

  }

}