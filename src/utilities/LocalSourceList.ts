import path from "path";
import { AppConfig } from "../webview/controller/AppConfig";
import { Workspace } from "./Workspace";
import { DirTool } from "./DirTool";


export class LocalSourceList {

    private static source_list: string[] | undefined = undefined;
    private static last_load_time: number = 0;
    private static source_loading_promise: Promise<void>[] = [];



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
