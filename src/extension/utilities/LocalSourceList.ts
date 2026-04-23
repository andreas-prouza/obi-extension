import * as vscode from 'vscode';
import path from "path";
import { AppConfig } from "../../shared/AppConfig";
import { Workspace } from "./Workspace";
import { DirTool } from "./DirTool";
import { logger } from './Logger';
import { IQualifiedSource, ISourceInfos } from '../../shared/Source';
import { Constants } from '../../shared/Constants';


export class LocalSourceList {

    private static source_list: string[] | undefined = undefined;
    private static source_info_list: ISourceInfos | undefined = undefined;
    private static source_loading_promise: Promise<void> | undefined = undefined;
    private static source_info_loading_promise: Promise<void> | undefined = undefined;



    public static async load_source_list(): Promise<void> {

        if (LocalSourceList.source_loading_promise) {
            await LocalSourceList.source_loading_promise;
            return;
        }

        LocalSourceList.source_loading_promise = (async () => {
            try {
                const config: AppConfig = AppConfig.get_app_config();
                const source_dir = path.join(Workspace.get_workspace(), config.general['source-dir'] || 'src');

                LocalSourceList.source_list = await DirTool.get_all_files_in_dir2(
                source_dir,
                '.',
                config.general['supported-object-types'] || ['pgm', 'file', 'srvpgm'],
                true
                ) || [];

                LocalSourceList.source_info_list = await LocalSourceList.get_source_info_list();

                for (const source of LocalSourceList.source_list) {
                    LocalSourceList.source_info_list[source] = LocalSourceList.source_info_list[source] || {};
                }
                vscode.commands.executeCommand("obi.source-filter.update");

            } catch (error) {
                logger.error(`Error loading source list: ${error}`);
                LocalSourceList.source_list = [];
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
                LocalSourceList.source_info_list = DirTool.get_json(path.join(Workspace.get_workspace(), config.general['source-infos'] || '.obi/etc/source-infos.json')) || {};
                for (const source in LocalSourceList.source_info_list) {
                    if (!DirTool.file_exists(path.join(Workspace.get_workspace(), config.general['source-dir'] || 'src', source))) {
                        delete LocalSourceList.source_info_list[source];
                    }
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






  public static async get_filtered_sources_with_details(source_list_file: string): Promise<IQualifiedSource[] | undefined> {

    const sources = await LocalSourceList.get_local_sources(false);

    const source_filters: IQualifiedSource[] = DirTool.get_json(path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, source_list_file)) || [];

    const filtered_sources = LocalSourceList.get_filtered_sources(sources, source_filters);
    const filtered_sources_extended = await LocalSourceList.get_extended_source_infos(filtered_sources);

    return filtered_sources_extended;
  }



  public static async get_local_sources(filter_supported_types: boolean = true): Promise<IQualifiedSource[] | undefined> {

    const config = AppConfig.get_app_config();
    const source_dir = path.join(Workspace.get_workspace(), config.general['source-dir'] || 'src');
    const supported_types = filter_supported_types ? (config.general['supported-object-types'] || ['pgm', 'file', 'srvpgm']) : undefined;

    const sources = await DirTool.get_all_files_in_dir3(
      source_dir,
      '.',
      supported_types
    );

    return sources;
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

    DirTool.write_file(path.join(Workspace.get_workspace(), config.general['source-infos'] || '.obi/etc/source-infos.json'), JSON.stringify(source_infos, undefined, 2));

    return;
  }



  public static async get_extended_source_infos(sources: IQualifiedSource[] | undefined): Promise<IQualifiedSource[] | undefined> {

    if (!sources)
      return;

    let new_list: IQualifiedSource[] = [];

    const config: AppConfig = AppConfig.get_app_config();
    const source_infos: ISourceInfos = await LocalSourceList.get_source_info_list();

    for (let source of sources) {

      source.description = '';

      const full_name: string = `${source['source-lib']}/${source['source-file']}/${source['source-member']}`;
      if (full_name in source_infos) {
        source.description = source_infos[full_name].description;
      }
      new_list.push(source);
    }

    return new_list;
  }




  private static get_filtered_sources(sources: IQualifiedSource[] | undefined, source_filters: IQualifiedSource[]): IQualifiedSource[] | undefined {

    if (!sources)
      return;

    const wcmatch = require('wildcard-match');
    let filtered_sources: IQualifiedSource[] = [];
    let use_regex: boolean;
    let show_empty_folders: boolean;
    let lib: string;
    let file: string;
    let mbr: string;
    let isMatch: boolean = false;

    for (let source of sources) {

      const src_mbr = source['source-member'];
      const src_file = source['source-file'];
      const src_lib = source['source-lib'];


      for (const source_filter of source_filters) {

        const show_empty_folders: boolean = source_filter['show-empty-folders'] || false;
        const use_regex: boolean = source_filter['use-regex'] || false;
        const lib: string = (source_filter['source-lib'] || '').toLowerCase();
        const file: string = (source_filter['source-file'] || '').toLowerCase();
        const mbr: string = (source_filter['source-member'] || '').toLowerCase();
        let isMatch: boolean = false;

        if ((!src_lib || !src_file || !src_mbr) && !show_empty_folders)
          continue;

        if (!src_lib && !src_file)
          continue;

        if (use_regex) {
          const re_lib = new RegExp(`^${lib}$`);
          const re_file = new RegExp(`^${file}$`);
          const re_mbr = new RegExp(`^${mbr}$`);
          isMatch = (src_lib.toLowerCase().match(re_lib) != null && src_file.toLowerCase().match(re_file) != null && src_mbr.toLowerCase().match(re_mbr) != null);
        }
        else {
          const wc_lib = wcmatch(lib);
          const wc_file = wcmatch(file);
          const wc_mbr = wcmatch(mbr);
          isMatch = wc_lib(src_lib.toLowerCase()) && wc_file(src_file.toLowerCase()) && wc_mbr(src_mbr.toLowerCase());
        }
        if (isMatch)
          filtered_sources.push({ "source-lib": src_lib, "source-file": src_file, "source-member": src_mbr});
      }
    }

    return filtered_sources;
  }




}
