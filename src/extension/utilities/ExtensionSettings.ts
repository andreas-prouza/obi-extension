import * as vscode from 'vscode';
import { current_folder } from './ObiFolder';


export type RevealMode = 'onStart' | 'onError' | 'never';


/**
 * The VS Code settings of OBI (contributes.configuration). They hold personal preferences:
 * what the Python OBI or the team needs belongs into the OBI configuration files.
 */
export class ExtensionSettings {

  /** Fires when a setting of OBI changes */
  public static on_did_change(listener: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('obi'))
        listener();
    });
  }


  private static resource(): vscode.Uri | undefined {
    return current_folder()?.uri;
  }


  public static log_write_files(): boolean {
    return vscode.workspace.getConfiguration('obi').get<boolean>('log.writeFiles', true);
  }


  public static log_max_file_size_mb(): number {
    return Math.max(1, vscode.workspace.getConfiguration('obi').get<number>('log.maxFileSizeMB', 5));
  }


  public static build_reveal_output(): RevealMode {
    const mode = vscode.workspace.getConfiguration('obi').get<string>('build.revealOutput', 'onError');
    return mode === 'onStart' || mode === 'never' ? mode : 'onError';
  }


  public static build_confirm_run(): boolean {
    return vscode.workspace.getConfiguration('obi', ExtensionSettings.resource()).get<boolean>('build.confirmRun', true);
  }


  /** git pull of the local OBI backend (local-obi-dir) when VS Code starts */
  public static backend_auto_update_local(): boolean {
    return vscode.workspace.getConfiguration('obi').get<boolean>('backend.autoUpdateLocal', false);
  }


  /** git pull of the OBI backend on the IBM i (remote-obi-dir), once per session before its first use */
  public static backend_auto_update_remote(): boolean {
    return vscode.workspace.getConfiguration('obi').get<boolean>('backend.autoUpdateRemote', false);
  }


  public static status_bar_enabled(): boolean {
    return vscode.workspace.getConfiguration('obi').get<boolean>('statusBar.enabled', true);
  }


  public static build_history_max_builds(): number {
    return vscode.workspace.getConfiguration('obi', ExtensionSettings.resource()).get<number>('buildHistory.maxBuilds', 100);
  }


  public static build_history_max_age_days(): number {
    return vscode.workspace.getConfiguration('obi', ExtensionSettings.resource()).get<number>('buildHistory.maxAgeDays', 0);
  }


  /** True if the user set a limit for the build history (the default alone doesn't delete anything without asking) */
  public static build_history_limit_configured(): boolean {
    const config = vscode.workspace.getConfiguration('obi', ExtensionSettings.resource());
    return ['buildHistory.maxBuilds', 'buildHistory.maxAgeDays'].some(key => {
      const values = config.inspect(key);
      return values?.globalValue !== undefined || values?.workspaceValue !== undefined || values?.workspaceFolderValue !== undefined;
    });
  }
}
