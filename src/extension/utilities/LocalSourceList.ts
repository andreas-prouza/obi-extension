import * as vscode from 'vscode';
import path from "path";
import { AppConfig } from "../config/AppConfig";
import { Workspace } from "./Workspace";
import { DirTool } from "./DirTool";
import { logger } from './Logger';
import { IQualifiedSource, ISourceInfos } from '../../shared/Source';
import { Constants } from '../../shared/Constants';
import { file_stamp } from '../../shared/CachedFiles';
import { InventoryEntry, apply_source_filters, is_supported, to_qualified, walk_sources } from './SourceInventory';


/** One walk of the source folder, shared by the source list, the source filters and the source infos */
interface SourceInventory {
  /** All files and empty lib/file folders (for show-empty-folders) */
  all: IQualifiedSource[];
  /** Relative paths ('lib/file/member.ext') of all files */
  files: Set<string>;
}


export class LocalSourceList {

    private static source_list: string[] | undefined = undefined;
    private static source_info_list: ISourceInfos | undefined = undefined;
    private static source_loading_promise: Promise<void> | undefined = undefined;
    private static source_info_loading_promise: Promise<void> | undefined = undefined;
    private static inventory: SourceInventory | undefined = undefined;
    /** Increased with every walk: memoized filter results of an older walk are outdated */
    private static inventory_version = 0;
    private static readonly filter_results = new Map<string, { stamp: string; version: number; sources: IQualifiedSource[] }>();



    public static async load_source_list(): Promise<void> {

        if (LocalSourceList.source_loading_promise) {
            await LocalSourceList.source_loading_promise;
            return;
        }

        LocalSourceList.source_loading_promise = (async () => {
            try {
                const config: AppConfig = AppConfig.get_app_config();
                const supported_types = config.general['supported-object-types'] || ['pgm', 'file', 'srvpgm'];
                const entries: InventoryEntry[] = await walk_sources(DirTool.get_local_source_dir()) ?? [];
                const files = entries.filter(entry => !entry.empty_dir).map(entry => entry.path);

                LocalSourceList.inventory = { all: entries.map(to_qualified), files: new Set(files) };
                LocalSourceList.inventory_version++;
                LocalSourceList.source_list = files.filter(file => is_supported(file, supported_types));

                LocalSourceList.source_info_list = await LocalSourceList.get_source_info_list();

                for (const source of LocalSourceList.source_list) {
                    LocalSourceList.source_info_list[source] = LocalSourceList.source_info_list[source] || {};
                }
                vscode.commands.executeCommand("obi.source-filter.update");

            } catch (error) {
                logger.error(`Error loading source list: ${error}`);
                LocalSourceList.source_list = [];
                LocalSourceList.inventory = { all: [], files: new Set() };
                LocalSourceList.inventory_version++;
            } finally {
                LocalSourceList.source_loading_promise = undefined;
            }
        })();

        await LocalSourceList.source_loading_promise;
    }


    public static async get_source_list(): Promise<string[]> {
        if (LocalSourceList.source_loading_promise)
            await LocalSourceList.source_loading_promise;
        return LocalSourceList.source_list || [];
    }



    public static async get_source_info_list(): Promise<ISourceInfos> {
        if (LocalSourceList.source_info_list == undefined) {
            await LocalSourceList.load_source_infos();
        }
        if (LocalSourceList.source_info_loading_promise)
            await LocalSourceList.source_info_loading_promise;
        return LocalSourceList.source_info_list || {};
    }



    public static async load_source_infos(): Promise<void> {

        if (LocalSourceList.source_info_loading_promise) {
            await LocalSourceList.source_info_loading_promise;
            return;
        }

        LocalSourceList.source_info_loading_promise = (async () => {
            try {
                const config = AppConfig.get_app_config();
                const infos = DirTool.get_json(path.join(Workspace.get_workspace(), config.general['source-infos'] || '.obi/etc/source-infos.json'));
                // Older versions created the file as '[]'; an array would silently drop all descriptions on save
                LocalSourceList.source_info_list = infos && typeof infos === 'object' && !Array.isArray(infos) ? infos : {};
                // Without the inventory (not loaded yet) one check per entry
                const inventory = LocalSourceList.inventory;
                for (const source in LocalSourceList.source_info_list) {
                    const exists = inventory ? inventory.files.has(source) : DirTool.file_exists(path.join(DirTool.get_local_source_dir(), source));
                    if (!exists)
                        delete LocalSourceList.source_info_list[source];
                }

            } catch (error) {
                logger.error(`Error loading source list infos: ${error}`);
                LocalSourceList.source_info_list = {};
            } finally {
                LocalSourceList.source_info_loading_promise = undefined;
            }
        })();

        await LocalSourceList.source_info_loading_promise;
        LocalSourceList.source_info_loading_promise = undefined;
    }






  private static async get_inventory(): Promise<SourceInventory> {
    if (LocalSourceList.source_loading_promise)
      await LocalSourceList.source_loading_promise;
    if (!LocalSourceList.inventory)
      await LocalSourceList.load_source_list();
    return LocalSourceList.inventory ?? { all: [], files: new Set() };
  }



  /** Sources of a filter file with descriptions; evaluated again only after the filter file or the sources changed */
  public static async get_filtered_sources_with_details(source_list_file: string): Promise<IQualifiedSource[] | undefined> {

    const inventory = await LocalSourceList.get_inventory();
    const filter_file = path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, source_list_file);
    const stamp = file_stamp(filter_file);

    let memo = LocalSourceList.filter_results.get(filter_file);
    if (!memo || memo.stamp !== stamp || memo.version !== LocalSourceList.inventory_version) {
      const content: unknown = DirTool.get_json(filter_file) || [];
      const entries = Array.isArray(content) ? content as IQualifiedSource[] : [];
      const sources = apply_source_filters(inventory.all, entries, (index, message) => {
        logger.warn(`Source filter ${source_list_file}, entry ${index}: ${message}`);
        vscode.window.showWarningMessage(vscode.l10n.t('Source filter \'{0}\', entry {1}: invalid regular expression ({2})', source_list_file.replace(/\.json$/, ''), index, message));
      });
      memo = { stamp, version: LocalSourceList.inventory_version, sources };
      LocalSourceList.filter_results.set(filter_file, memo);
    }

    return LocalSourceList.get_extended_source_infos(memo.sources);
  }



  /** Sources of the source folder, from the last walk */
  public static async get_local_sources(filter_supported_types: boolean = true): Promise<IQualifiedSource[] | undefined> {

    const inventory = await LocalSourceList.get_inventory();
    if (!filter_supported_types)
      return inventory.all;

    const supported_types = AppConfig.get_app_config().general['supported-object-types'] || ['pgm', 'file', 'srvpgm'];
    return inventory.all.filter(source => source['source-member'] && is_supported(source['source-member'], supported_types));
  }





  public static async update_source_infos(source_path: string, source_member: string, description: string|undefined): Promise<void> {

    const config: AppConfig = AppConfig.get_app_config();

    const source_infos: ISourceInfos = await LocalSourceList.get_source_info_list();

    const full_name: string = `${source_path}/${source_member}`;
    logger.info(`Update source info for ${full_name}`);

    if (!(full_name in source_infos) && (!description || description.length === 0)) {
      return;
    }

    if (description && description.length > 0) {
      source_infos[full_name] = { 'description': description };
    }

    if (full_name in source_infos && (!description || description.length === 0)) {
      delete source_infos[full_name]['description'];
      if (Object.keys(source_infos[full_name] || {}).length == 0) {
        delete source_infos[full_name];
      }
    }

    DirTool.update_json(path.join(Workspace.get_workspace(), config.general['source-infos'] || '.obi/etc/source-infos.json'), source_infos);

    return;
  }



  public static async get_extended_source_infos(sources: IQualifiedSource[] | undefined): Promise<IQualifiedSource[] | undefined> {

    if (!sources)
      return;

    const source_infos: ISourceInfos = await LocalSourceList.get_source_info_list();

    // Copies: the sources may be memoized filter results
    return sources.map(source => {
      const full_name: string = `${source['source-lib']}/${source['source-file']}/${source['source-member']}`;
      return { ...source, description: full_name in source_infos ? source_infos[full_name].description : '' };
    });
  }


}
