import * as vscode from 'vscode';
import { OBITools } from './utilities/OBITools';
import { AppConfig } from './config/AppConfig';
import { Constants } from '../shared/Constants';
import { logger } from './utilities/Logger';
import { OPEN_CONFIGURATION, show_error } from './utilities/Notify';
import { get_error_message } from '../shared/Errors';
import { debounce } from '../shared/Debounce';
import { Workspace } from './utilities/Workspace';


export interface ProjectHooks {
  /** An OBI project was found (at activation or later, e.g. after Initialize): register commands and views */
  on_project_found(context: vscode.ExtensionContext): void;
  /** The configuration is valid for the first time: start watchers, load the source list, ... */
  on_valid(context: vscode.ExtensionContext): void;
}


/**
 * State of the OBI project in this window: the context keys obi.contains_obi_project and obi.valid-config,
 * and what is registered and started. Changes of the configuration update it in place, without a window reload.
 */
export class ProjectState {

  private static context: vscode.ExtensionContext | undefined;
  private static hooks: ProjectHooks | undefined;
  private static found = false;
  private static started = false;
  private static first_update = true;
  private static shown_error: string | undefined;
  private static running: Promise<void> | undefined;
  private static again = false;
  private static several_projects_shown = false;


  public static init(context: vscode.ExtensionContext, hooks: ProjectHooks): void {
    ProjectState.context = context;
    ProjectState.hooks = hooks;

    // Project and user configs (also created by Initialize) and the active profile, in any workspace folder
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${Constants.OBI_CONFIGS_DIR}/{${Constants.OBI_APP_CONFIG},${Constants.OBI_APP_CONFIG_USER_PREFIX}*.toml,workspace-settings.json}`);
    const update = debounce(() => { ProjectState.update().catch((e: unknown) => logger.error(`Updating the project state failed: ${get_error_message(e)}`)); }, 300);
    watcher.onDidCreate(update);
    watcher.onDidChange(update);
    watcher.onDidDelete(update);
    context.subscriptions.push(watcher, vscode.workspace.onDidChangeWorkspaceFolders(update), { dispose: () => update.cancel() });
  }


  /** Checks the project and its configuration again; calls during a running update run once afterwards */
  public static async update(): Promise<void> {
    if (ProjectState.running) {
      ProjectState.again = true;
      return ProjectState.running;
    }
    ProjectState.running = (async () => {
      try {
        do {
          ProjectState.again = false;
          await ProjectState.do_update();
        } while (ProjectState.again);
      }
      finally {
        ProjectState.running = undefined;
      }
    })();
    return ProjectState.running;
  }


  private static async do_update(): Promise<void> {
    const context = ProjectState.context;
    const hooks = ProjectState.hooks;
    if (!context || !hooks)
      return;

    const contains = OBITools.contains_obi_project();
    await vscode.commands.executeCommand('setContext', 'obi.contains_obi_project', contains);
    if (!contains) {
      await vscode.commands.executeCommand('setContext', 'obi.valid-config', false);
      return;
    }

    if (!ProjectState.found) {
      ProjectState.found = true;
      hooks.on_project_found(context);
    }

    const projects = Workspace.get_obi_folders();
    if (projects.length > 1 && !ProjectState.several_projects_shown) {
      ProjectState.several_projects_shown = true;
      vscode.window.showInformationMessage(vscode.l10n.t('Several OBI projects found. OBI works with \'{0}\'. Working with several projects at the same time is not supported yet.', projects[0].name));
    }

    let error: unknown;
    try {
      OBITools.self_check();
    }
    catch (e: unknown) {
      error = e;
    }

    await vscode.commands.executeCommand('setContext', 'obi.valid-config', error === undefined);
    await vscode.commands.executeCommand('setContext', 'obi.run_native', OBITools.without_local_obi());

    if (error !== undefined) {
      // Once per problem, not for every save of the file
      const message = get_error_message(error);
      if (message !== ProjectState.shown_error) {
        ProjectState.shown_error = message;
        show_error(vscode.l10n.t('The OBI configuration is invalid'), error, [OPEN_CONFIGURATION]);
      }
      return;
    }
    ProjectState.shown_error = undefined;

    if (ProjectState.first_update && AppConfig.get_app_config().attributes_missing()) {
      vscode.window.showWarningMessage(vscode.l10n.t('The OBI configuration is incomplete. Please fill in the mandatory fields.'));
      vscode.commands.executeCommand('obi.controller.config');
    }
    ProjectState.first_update = false;

    if (!ProjectState.started) {
      ProjectState.started = true;
      hooks.on_valid(context);
    }
  }
}
