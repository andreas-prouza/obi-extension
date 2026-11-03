import * as vscode from 'vscode';
import { Workspace } from "./Workspace";
import { Constants } from '../../shared/Constants';
import { DirTool } from './DirTool';
import * as path from 'path';
import * as fs from 'fs';
import { LocalSourceList } from './LocalSourceList';
import { show_error } from './Notify';
import { logger } from './Logger';
import { debounce, Debounced } from '../../shared/Debounce';
import { minimatch } from 'minimatch';


export interface FileCallback {
  /** Workspace-relative glob (minimatch), matched against created, changed and deleted files */
  pattern: string;
  /** A burst of events calls the action once, this many milliseconds after the last event */
  delay: number;
  action: () => void | Promise<void>;
}


// Larger files in .obi/etc are not hashed (e.g. a big dependency.json): each event runs the callback
const MAX_HASHED_FILE_SIZE = 1024 * 1024;


export class HealthyWatchdog {

  /** Workspace-relative globs of the watched files: only files with a callback */
  public static readonly WATCHED_FILES: string[] = [
    `${Constants.OBI_CONFIGS_DIR}/*.{toml,json}`,
    `${Constants.SOURCE_FILTER_FOLDER_NAME}/**`,
    // Folders of new or deleted builds, and edited compile lists of the history
    `${Constants.BUILD_HISTORY_DIR}/{*,*/compile-list.json}`
  ];

  /** Content hashes of the files in .obi/etc, to ignore writes without change (e.g. workspace-settings.json) */
  private static readonly config_hashes = new Map<string, string>();
  public static callbacks: FileCallback[] = [];
  private static readonly debounced = new Map<FileCallback, Debounced>();
  private static readonly reload_source_list: Debounced = debounce(() => { LocalSourceList.load_source_list(); }, 500);



  public static async set_healthy_watchdog(context: vscode.ExtensionContext, callbacks: FileCallback[]) {

    HealthyWatchdog.callbacks = callbacks;
    HealthyWatchdog.set_source_watcher(context);

    const ws_uri = Workspace.get_workspace_uri();
    const watch = (glob: string, ignore_create = false, ignore_change = false) =>
      vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(ws_uri, glob), ignore_create, ignore_change);

    // Only files with a callback: nothing in .obi/tmp and .obi/build-output, which every build rewrites
    // Created too: the first build creates .obi/build-history with its first build in one event
    const folders = watch(`{${Constants.NEEDED_LIST_OF_PATH.join(',')}}`, false, true);
    const watchers = HealthyWatchdog.WATCHED_FILES.map(glob => watch(glob));

    context.subscriptions.push(folders, ...watchers, { dispose: () => HealthyWatchdog.cancel_callbacks() });

    folders.onDidCreate(uri => HealthyWatchdog.run_callbacks(uri.fsPath));
    folders.onDidDelete(async uri => {
      logger.debug(`Folder deleted: ${uri.fsPath}`);
      await HealthyWatchdog.recreate_deleted_folder();
      HealthyWatchdog.run_callbacks(uri.fsPath);
    });

    for (const watcher of watchers) {
      watcher.onDidCreate(uri => HealthyWatchdog.on_file_event(uri.fsPath, 'created'));
      watcher.onDidChange(uri => HealthyWatchdog.on_file_event(uri.fsPath, 'changed'));
      watcher.onDidDelete(uri => HealthyWatchdog.on_file_event(uri.fsPath, 'deleted'));
    }
  }


  public static async recreate_deleted_folder() {

    const ws_uri = Workspace.get_workspace_uri();

    Constants.NEEDED_LIST_OF_PATH.forEach(path_name => {
      const full_path = path.join(ws_uri.fsPath, path_name);
      if (!DirTool.dir_exists(full_path)) {
        fs.mkdir(full_path, { recursive: true }, (err) => {
          if (err) {
            show_error(vscode.l10n.t('Creating the folder {0} failed', path_name), err);
            return;
          }
        });
      }
    })
  }



  private static async on_file_event(file: string, event: 'created' | 'changed' | 'deleted'): Promise<void> {
    logger.debug(`File ${event}: ${file}`);
    if (await HealthyWatchdog.content_changed(file, event))
      HealthyWatchdog.run_callbacks(file);
  }



  /** False if a config file was written with the same content as before */
  private static async content_changed(file: string, event: 'created' | 'changed' | 'deleted'): Promise<boolean> {
    if (path.dirname(path.relative(Workspace.get_workspace(), file)).replace(/\\/g, '/') !== Constants.OBI_CONFIGS_DIR)
      return true;

    let hash: string | undefined;
    try {
      if (event !== 'deleted' && fs.statSync(file).size <= MAX_HASHED_FILE_SIZE)
        hash = await DirTool.get_file_hash(file);
    }
    catch {
      // Deleted meanwhile
    }

    if (hash === undefined) {
      HealthyWatchdog.config_hashes.delete(file);
      return true;
    }
    if (HealthyWatchdog.config_hashes.get(file) === hash)
      return false;
    HealthyWatchdog.config_hashes.set(file, hash);
    return true;
  }



  public static callbacks_for(file: string): FileCallback[] {
    const relative = path.relative(Workspace.get_workspace(), file).replace(/\\/g, '/');
    if (relative === '' || relative.startsWith('../'))
      return [];
    return HealthyWatchdog.callbacks.filter(callback => minimatch(relative, callback.pattern, { dot: true }));
  }



  /** Runs the callbacks whose pattern matches the file, debounced per callback */
  public static run_callbacks(file: string): void {
    for (const callback of HealthyWatchdog.callbacks_for(file)) {
      let run = HealthyWatchdog.debounced.get(callback);
      if (!run) {
        run = debounce(() => {
          Promise.resolve()
            .then(() => callback.action())
            .catch((e: unknown) => logger.error(`Callback for ${callback.pattern} failed: ${e}`));
        }, callback.delay);
        HealthyWatchdog.debounced.set(callback, run);
      }
      run();
    }
  }



  private static cancel_callbacks(): void {
    for (const run of HealthyWatchdog.debounced.values())
      run.cancel();
    HealthyWatchdog.debounced.clear();
    HealthyWatchdog.reload_source_list.cancel();
  }



  public static async set_source_watcher(context: vscode.ExtensionContext) {

    const watch_uri = DirTool.get_file_URI(DirTool.get_local_source_dir_relative());
    const source_watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watch_uri, '**/*'), false, true, false);
    context.subscriptions.push(source_watcher);

    // A branch switch creates and deletes many files: the source list is read once afterwards
    source_watcher.onDidCreate(() => HealthyWatchdog.reload_source_list());
    source_watcher.onDidDelete(() => HealthyWatchdog.reload_source_list());
  }

}
