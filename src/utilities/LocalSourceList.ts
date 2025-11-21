import * as vscode from 'vscode';
import path from "path";
import { AppConfig } from "../webview/controller/AppConfig";
import { Workspace } from "./Workspace";
import { DirTool } from "./DirTool";
import { Constants } from '../Constants';
import { logger } from './Logger';


export class LocalSourceList {

    private static source_list: string[] | undefined = undefined;
    private static last_load_time: number = 0;
    private static source_loading_promise: Promise<void>[] = [];
    
    private static watcher_project: vscode.FileSystemWatcher | undefined = undefined;
    private static watcher_processing_promise: Promise<void>[] = [];
    


    private static async _load_source_list(): Promise<void> {

        const config: AppConfig = AppConfig.get_app_config();
        const source_dir = path.join(Workspace.get_workspace(), config.general['source-dir'] || 'src');

        LocalSourceList.source_list = await DirTool.get_all_files_in_dir2(
        source_dir,
        '.',
        config.general['supported-object-types'] || ['pgm', 'file', 'srvpgm'],
        true
        ) || [];
        LocalSourceList.last_load_time = Date.now();

        if (LocalSourceList.watcher_project === undefined) {
            const watch_uri = vscode.Uri.joinPath(Workspace.get_workspace_uri(), config.general['source-dir'] || 'src');
            logger.debug(`Setting up file watcher for file changes in ${watch_uri}`);
            LocalSourceList.watcher_project = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watch_uri, '**/*'), false, true, false);
        
            // File change events
            LocalSourceList.watcher_project.onDidCreate(uri => {
                if (LocalSourceList.watcher_processing_promise.length > 0)
                    return;
                LocalSourceList.source_loading_promise.push(LocalSourceList.refresh_obi_stuff(uri));
            });
            LocalSourceList.watcher_project?.onDidDelete(uri => {
                if (LocalSourceList.watcher_processing_promise.length > 0)
                    return;
                LocalSourceList.source_loading_promise.push(LocalSourceList.refresh_obi_stuff(uri));
            });
        }
    }


    private static async refresh_obi_stuff(uri: vscode.Uri) {

        const config: AppConfig = AppConfig.get_app_config();
        const ext = uri.fsPath.split('.').pop() ?? '';

        logger.debug(`File changed: ${uri.fsPath}`);
        if (ext == 'log')
            return;

        logger.debug(`Reload some stuff`);
        await LocalSourceList.load_source_list();
        await vscode.commands.executeCommand("obi.source-filter.update");
        LocalSourceList.source_loading_promise = [];
    }


    public static async load_source_list(): Promise<void> {
        if (LocalSourceList.source_loading_promise.length == 0) {
            LocalSourceList.source_loading_promise.push(LocalSourceList._load_source_list());
        }

        await Promise.all(LocalSourceList.source_loading_promise);
        LocalSourceList.source_loading_promise = [];
    }


    public static async get_source_list(): Promise<string[]> {
        if (LocalSourceList.source_list === undefined)
            await LocalSourceList.load_source_list();
        return LocalSourceList.source_list || [];
    }

}
