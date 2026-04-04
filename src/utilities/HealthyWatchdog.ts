import * as vscode from 'vscode';
import { Workspace } from "./Workspace";
import { Constants } from '../Constants';
import { ConstantsCallback } from '../ConstantsCallback';
import { DirTool } from './DirTool';
import * as path from 'path';
import * as fs from 'fs';
import { LocalSourceList } from './LocalSourceList';
import { AppConfig } from '../webview/controller/AppConfig';
import { logger } from './Logger';



export class HealthyWatchdog {

  private static file_hashes: { [key: string]: string } = {};
  


  public static async set_healthy_watchdog(context: vscode.ExtensionContext) {
    
    HealthyWatchdog.set_source_watcher(context);

    const ws_uri = Workspace.get_workspace_uri();

    const list_subfolders = Constants.NEEDED_LIST_OF_PATH.join(',');
    // Create a file system watcher
    const pattern = new vscode.RelativePattern(ws_uri, `{${list_subfolders}}`);
    const pattern_content = new vscode.RelativePattern(ws_uri, `{${list_subfolders}}/**/*`);
    const obi_dir = vscode.workspace.createFileSystemWatcher(pattern, true);
    const obi_content = vscode.workspace.createFileSystemWatcher(pattern_content);

    context.subscriptions.push(obi_dir, obi_content);

    //--------------------------------
    // Check config files
    //--------------------------------
    // File change events
    obi_dir.onDidChange(uri => {
      console.log(`File changed: ${uri.fsPath}`);
      HealthyWatchdog.check_dir_change_callback(uri.fsPath);
    });

    obi_dir.onDidDelete(async uri => {
      delete HealthyWatchdog.file_hashes[uri.fsPath];
      await HealthyWatchdog.recreate_deleted_folder();
      HealthyWatchdog.check_dir_change_callback(uri.fsPath);
    });

    obi_content.onDidCreate(uri => {
      console.log(`File created: ${uri.fsPath}`);
      HealthyWatchdog.check_dir_change_callback(uri.fsPath);
    });
    
    obi_content.onDidDelete(uri => {
      delete HealthyWatchdog.file_hashes[uri.fsPath];
      console.log(`File deleted: ${uri.fsPath}`);
      HealthyWatchdog.check_dir_change_callback(uri.fsPath);
    });

    obi_content.onDidChange(uri => {
      console.log(`File changed: ${uri.fsPath}`);
      HealthyWatchdog.check_dir_change_callback(uri.fsPath);
    });

  }


  public static async recreate_deleted_folder() {

    const ws_uri = Workspace.get_workspace_uri();

    Constants.NEEDED_LIST_OF_PATH.forEach(path_name => {
      const full_path = path.join(ws_uri.fsPath, path_name);
      if (!DirTool.dir_exists(full_path)) {
        fs.mkdir(full_path, { recursive: true }, (err) => {
          if (err) {
            vscode.window.showErrorMessage(`Failed to create directory ${path_name}: ${err.message}`);
            return;
          }
        });
      }
    })
  }




  public static async check_dir_change_callback(dir_name: string) {

    const base_dir_name = dir_name.replace(`${Workspace.get_workspace()}/`, '');

    if (DirTool.is_file(dir_name)) {
      const checksum = await DirTool.get_file_hash(dir_name);

      if (HealthyWatchdog.file_hashes[dir_name] && HealthyWatchdog.file_hashes[dir_name] == checksum) {
        return;
      }
      HealthyWatchdog.file_hashes[dir_name] = checksum;
    }


    Object.keys(ConstantsCallback.DIR_CHANGE_CALLBACK).forEach((dir: string) => {
      if (base_dir_name.startsWith(dir)) {
        ConstantsCallback.DIR_CHANGE_CALLBACK[dir]();
      }
    });
  }



  public static async set_source_watcher(context: vscode.ExtensionContext) {
    
    const config = AppConfig.get_app_config();
    const watch_uri = vscode.Uri.joinPath(Workspace.get_workspace_uri(), config.general['source-dir'] || 'src');
    const source_watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watch_uri, '**/*'), false, true, false);
    context.subscriptions.push(source_watcher);
  
    // File change events
    source_watcher.onDidCreate(uri => {
        LocalSourceList.load_source_list();
    });
    source_watcher.onDidDelete(uri => {
        LocalSourceList.load_source_list();
    });

  }

}