import * as vscode from 'vscode';
import { DirTool } from './DirTool';
import path from 'path';
import { getUri } from './getUri';
import { getNonce } from './getNonce';
import { Constants } from '../Constants';

import { AppConfig, IConfigProperties } from '../webview/controller/AppConfig';
import { SSH_Tasks } from './SSH_Tasks';
import * as source from '../obi/Source';
import { Workspace } from './Workspace';
import * as fs from 'fs-extra';
import { logger } from './Logger';
import { OBICommands } from '../obi/OBICommands';
import { LocaleText } from './LocaleText';
import { platform } from 'os';



export class OBITools {

  public static ext_context?: vscode.ExtensionContext;
  public static lang: LocaleText|undefined = undefined;


  /**
   * Self check of the extension
   */
  public static self_check() {
    if (! vscode.workspace.workspaceFolders || !OBITools.ext_context) {
      vscode.window.showErrorMessage('No workspace is opened!');
      return;
    }

    const ws = Workspace.get_workspace();
    const ext_ws = path.join(OBITools.ext_context.asAbsolutePath('.'), 'obi-media');
    const current_version: string = vscode.extensions.getExtension('andreas-prouza.obi')?.packageJSON['version'];
    const previous_version: string|undefined = OBITools.ext_context.workspaceState.get('obi.version');
    const config: AppConfig = AppConfig.get_app_confg();

    if (!DirTool.dir_exists(path.join(ws, '.obi', 'log'))){
      fs.mkdirSync(path.join(ws, '.obi', 'log'), { recursive: true});
    }
    if (!DirTool.dir_exists(path.join(ws, '.obi', Constants.SOURCE_FILTER_FOLDER_NAME))){
      fs.mkdirSync(path.join(ws, '.obi', Constants.SOURCE_FILTER_FOLDER_NAME), { recursive: true});
    }
    if (!DirTool.dir_exists(path.join(ws, '.obi', 'tmp'))){
      fs.mkdirSync(path.join(ws, '.obi', 'tmp'), { recursive: true});
    }
    if (!DirTool.file_exists(path.join(ws, '.obi', 'etc', config.general['source-infos']||'source-infos.json'))){
      DirTool.write_file(path.join(ws, '.obi', 'etc', config.general['source-infos']||'source-infos.json'), '[]');
    }
    if (!DirTool.file_exists(path.join(ws, '.obi', 'etc', config.general['dependency-list']||'dependency.toml'))){
      DirTool.write_file(path.join(ws, '.obi', 'etc', config.general['dependency-list']||'dependency.toml'), '');
    }
    if (!DirTool.file_exists(path.join(ws, '.obi', 'etc', config.general['compiled-object-list']||'object-build.toml'))){
      DirTool.write_file(path.join(ws, '.obi', 'etc', config.general['compiled-object-list']||'object-build.toml'), '');
    }
    
    switch (previous_version) {
      case undefined:
      case '0.2.4':
      case '0.2.5':
      case '0.2.6':
      case '0.2.7':
      case '0.2.8':
        fs.copyFileSync(path.join(ext_ws, 'etc', 'constants.py'), path.join(ws, '.obi', 'etc', 'constants.py'));
        fs.copyFileSync(path.join(ext_ws, 'etc', 'logger_config.py'), path.join(ws, '.obi', 'etc', 'logger_config.py'));
    }

    OBITools.ext_context.workspaceState.update('obi.version', current_version);
    
  }



  public static is_native(): boolean {

    const config = AppConfig.get_app_confg();

    return OBITools.get_local_obi_python_path() == undefined;
  }



  public static get_local_obi_python_path(): string|undefined {

    const config = AppConfig.get_app_confg();
    
    if (!config.general['local-obi-dir'])
      return undefined;
    
    let venv_bin = 'bin';
    if (process.platform == 'win32')
      venv_bin = 'Scripts';

    const local_obi_python: string = path.join(config.general['local-obi-dir'], 'venv', venv_bin, 'python');

    if (! DirTool.file_exists(local_obi_python))
      return undefined;

    return local_obi_python;
  }




  public static async check_remote(): Promise<boolean> {

    const config = AppConfig.get_app_confg();
    const remote_base_dir: string|undefined = config.general['remote-base-dir'];
    const remote_obi_dir: string|undefined = config.general['remote-obi-dir'];
    let check: boolean;

    if (!remote_base_dir || ! remote_obi_dir)
      throw Error(`Missing 'remote_base_dir' or 'remote_obi_dir'`);

    check = await SSH_Tasks.check_remote_path(path.join(remote_base_dir, Constants.OBI_APP_CONFIG_FILE));
    if (!check)
      return false;

    if (!config.general['source-dir'])
      return false;

    check = await SSH_Tasks.check_remote_path(path.join(remote_base_dir, config.general['source-dir']));
    if (!check)
      return false;

    return true;

  }




  public static async check_remote_sources(): Promise<boolean> {

    await OBITools.check_remote();

    const config = AppConfig.get_app_confg();
    const ws: string = Workspace.get_workspace();

    if (!config.general['remote-source-list'])
      return false;

    if (!await OBITools.check_remote()) {
        vscode.window.showWarningMessage('Missing OBI project on remote system.');
        await OBITools.transfer_all(false);
    }

    await OBICommands.get_remote_source_list();
    const remote_source_list: source.ISource = DirTool.get_toml(path.join(ws, config.general['remote-source-list']));
    const current_hash_list = await OBITools.retrieve_current_source_hashes();
    const changed_sources: source.ISourceList = await OBITools.compare_source_change(current_hash_list, remote_source_list);
    const all_sources: string[] = [...changed_sources['changed-sources'], ...changed_sources['new-objects']];

    if (all_sources.length) {
      const answer = await vscode.window.showErrorMessage(`${all_sources.length} changed sources. Do you want to transfer to remote?\n\n${all_sources.join('\n')}`, { modal: true }, ...['Yes', 'No']);
      switch (answer) {
        case 'No':
          return false;
        case undefined: // Canceled
          return false;
        case 'Yes':
          await SSH_Tasks.transferSources(all_sources);
          vscode.window.showInformationMessage(`Sources transfered to ${config.connection['remote-host']}`);
      }
    }

    if (changed_sources['old-sources'] && changed_sources['old-sources'].length) {
      const answer = await vscode.window.showErrorMessage(`${changed_sources['old-sources'].length} not needed sources on remote system.\nDo you want to delete them?\n\n${changed_sources['old-sources'].join('\n')}`, { modal: true }, ...['Yes', 'No']);
      switch (answer) {
        case 'No':
          return false;
        case undefined: // Canceled
          return false;
        case 'Yes':
          await SSH_Tasks.delete_sources(changed_sources['old-sources']);
          vscode.window.showInformationMessage(`Sources transfered to ${config.connection['remote-host']}`);
      }
    }
    vscode.window.showInformationMessage('Remote source check finished');
    return true;

  }

  
  public static contains_obi_project(): boolean {

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
      return false;
    }

    const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;

    if (!DirTool.file_exists(path.join(ws, Constants.OBI_APP_CONFIG_FILE)))
      return false;

    //if (!AppConfig.attributes_missing())
    //  return false;

    return true;
  }



  public static async initialize_folder(): Promise<void> {
    
    if (! vscode.workspace.workspaceFolders || !OBITools.ext_context) {
      vscode.window.showErrorMessage('No workspace is opened!');
      return;
    }

    const ws = Workspace.get_workspace();
    const ext_ws = path.join(OBITools.ext_context.asAbsolutePath('.'), 'obi-media');

    if (!DirTool.dir_exists(path.join(ws, '.obi', 'etc'))){
      fs.mkdirSync(path.join(ws, '.obi', 'etc'), { recursive: true});
    }
    if (!DirTool.dir_exists(path.join(ws, '.obi', 'log'))){
      fs.mkdirSync(path.join(ws, '.obi', 'log'), { recursive: true});
    }

    const files = await DirTool.get_all_files_in_dir2(ext_ws, 'etc', ['toml', '.py']);
    if (!files)
      return;

    let copies: Promise<void>[] = [];
    for (const file of files) {
      copies.push(fs.copy(path.join(ext_ws, file), path.join(ws, '.obi', file)));
    }

    Promise.all(copies).then(() => {
      vscode.window.showInformationMessage(`${copies.length} files copied`);
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    })
    .catch((reason: Error) => {
      vscode.window.showErrorMessage(reason.message);
    });

  }



  public static get_global_stuff(webview : vscode.Webview, extensionUri: vscode.Uri) {

    const styleUri = getUri(webview, extensionUri, ["asserts/css", "style.css"]);

    const asserts_uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'asserts'));
    const nonce = getNonce();
    
    let theme_mode = 'light';
    if (vscode.window.activeColorTheme.kind == vscode.ColorThemeKind.Dark)
      theme_mode = 'dark';

    return {
      asserts_uri: asserts_uri,
      styleUri: styleUri,
      nonce: nonce,
      current_date: new Date().toLocaleString(),
      theme_mode: theme_mode,
      get_text: (v: string) => {
        return LocaleText.localeText?.get_Text(v);
      },
      locale: LocaleText.localeText?.current_locale
    }
  }




  public static override_dict(from_dict:{}, to_dict:{}): any {
    if (to_dict == undefined)
      to_dict = {};

    for (let [k, v] of Object.entries(from_dict)) {
      if (typeof v==='object' && v!==null && to_dict[k] && !(v instanceof Array) && !(v instanceof Date))
        v = OBITools.override_dict(from_dict[k], to_dict[k]);

      if (v == undefined)
        continue;
      if ((typeof v == 'string') && v.length == 0)
        continue;
      if (v instanceof Array && v.length == 0)
        continue;

      to_dict[k] = v;
    }
    //return {...to_dict, ...from_dict};
    return to_dict;
  }




  public static get_compile_list(workspaceUri: vscode.Uri): {}|undefined {
    
    if (AppConfig.attributes_missing())
      return undefined;

    const config = AppConfig.get_app_confg();
    if (!config.general['compile-list']) {
      vscode.window.showErrorMessage('OBI config is invalid');
      throw Error('OBI config is invalid');
    }
      
    const file_path: string = path.join(workspaceUri.fsPath, config.general['compile-list']);
    
    if (!DirTool.file_exists(file_path))
      return undefined;

    let compile_list_string: string = fs.readFileSync(file_path).toString();
    // Converting to JSON 
    const compile_list = JSON.parse(compile_list_string);

    if (typeof compile_list !='object' || compile_list==null || (compile_list instanceof Array) || (compile_list instanceof Date))
      return undefined;

    if (!compile_list['compiles'] || !compile_list['timestamp'])
      return undefined;

    return compile_list
  }



  public static get_source_hash_list(workspace:string): source.ISource | undefined {

    const config = AppConfig.get_app_confg();
    if (!config.general['compiled-object-list'])
      return undefined
    
    const file:string = path.join(workspace, config.general['compiled-object-list'])

    return DirTool.get_toml(file)

  }



  public static async get_changed_sources(): Promise<source.ISourceList> { // results: source.Source[]

    const t0 = performance.now();
    const current_hash_list = await OBITools.retrieve_current_source_hashes();
    const t1 = performance.now();
    console.log(`1. It took ${t1 - t0} milliseconds.`);
    
    const t2 = performance.now();
    const changed_sources: source.ISourceList = await OBITools.compare_source_change(current_hash_list);
    const t3 = performance.now();
    console.log(`2. It took ${t3 - t2} milliseconds.`);

    return changed_sources;
  }



  public static get_dependend_sources(changed_sources: source.ISourceList): string[] {

    let dependend_sources: string[] = [];
    const config = AppConfig.get_app_confg();

    const all_sources: string[] = Object.assign([], changed_sources['changed-sources'], changed_sources['new-objects']);

    const dependency_list: {['source']: string[]} = DirTool.get_toml(path.join(Workspace.get_workspace(), config.general['dependency-list']));
    for (const [k, v] of Object.entries(dependency_list)) {
      for (let i=0; i<all_sources.length; i++) {
        if (v.includes(all_sources[i]) && !all_sources.includes(k)) {
          dependend_sources.push(k);
          break;
        }
      }
    }

    return dependend_sources;
  }



  public static async generate_source_change_lists(): Promise<string[]> {
    const ws = Workspace.get_workspace();

    DirTool.clean_dir(path.join(ws, '.obi', 'tmp'));
    DirTool.clean_dir(path.join(ws, '.obi', 'build-output'));

    console.log('Get changed sources');
    const changed_sources: source.ISourceList = await OBITools.get_changed_sources();
    console.log('Get dependend sources');
    const dependend_sources: string[] = await OBITools.get_dependend_sources(changed_sources);

    console.log('Clean dir');
    DirTool.clean_dir(path.join(Workspace.get_workspace(), '.obi', 'tmp'));
    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.CHANGED_OBJECT_LIST), JSON.stringify(changed_sources, undefined, 2));
    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.DEPENDEND_OBJECT_LIST), JSON.stringify(dependend_sources, undefined, 2));

    //return changed_sources;
    return [...changed_sources['changed-sources'], ...changed_sources['new-objects'], ...dependend_sources];
  }



  public static async compare_source_change(results: source.ISource[], last_source_hashes?: source.ISource|undefined): Promise<source.ISourceList> {

    // Get all sources which are new or have changed
    if (!last_source_hashes)
      last_source_hashes = OBITools.get_source_hash_list(Workspace.get_workspace()) || {};

    let changed_sources: string[] = [];
    let new_sources: string[] = [];
    let old_sources: string[] = [];

    console.log(`Check ${results.length} sources`);

    //----------------------------------------
    // First start all processes
    //----------------------------------------

    const t6 = performance.now();
    let promise_list: Promise<source.ISourceList>[] = [];

    // check for changed sources
    results.map((source_item: source.ISource) => {
      promise_list.push(OBITools.check_source_change_item(source_item, last_source_hashes));
    });
    const t7 = performance.now();
    console.log(`Start check_source_change_item: It took ${t7 - t6} milliseconds.`);

    //----
/*
    let promise_list2: Promise<string|undefined>[] = [];

    // Check for old sources
    const t4 = performance.now();
  
    for (const k in last_source_hashes) {
      promise_list2.push(OBITools.check_old_source_item(k, results));
    };

    const t5 = performance.now();
    console.log(`Start check_old_source_item: It took ${t5 - t4} milliseconds.`);
  */

    //----------------------------------------
    // Then get the results
    //----------------------------------------
    const t0 = performance.now();
    const all_promises = await Promise.all(promise_list);
    const t1 = performance.now();
    console.log(`Change check: It took ${t1 - t0} milliseconds.`);
    
    all_promises.map((source_item_list: source.ISourceList) => {
      if (source_item_list['changed-sources'].length > 0)
        changed_sources.push(source_item_list['changed-sources'][0]);
      if (source_item_list['new-objects'].length > 0)
        new_sources.push(source_item_list['new-objects'][0]);
    });

    //----
/*
    const t2 = performance.now();
    const all_promises2 = await Promise.all(promise_list2);
    const t3 = performance.now();
    console.log(`Old check: It took ${t3 - t2} milliseconds.`);

    all_promises2.map((source_item: string|undefined) => {
      if (source_item)
        old_sources.push(source_item);
    });
*/

    console.log(`new_sources: ${new_sources.length}, changed-sources: ${changed_sources.length}`);

    return {
      "new-objects": new_sources,
      "changed-sources": changed_sources,
      "old-sources": old_sources
    };
  }



  private static async check_old_source_item(source_from_list: string, current_sources: source.ISource[]): Promise<string|undefined> {

    let found =false;
    current_sources.map((source_item: source.ISource) => {
      if (source_item[source_from_list]){
        found = true;
        return;
      }
    });
    
    if (found)
      return source_from_list;

    return undefined;
  }



  private static async check_source_change_item(source_item: source.ISource, last_source_hashes: source.ISource): Promise<source.ISourceList> {
    
    const source_name: string = Object.keys(source_item)[0];
    const k_source: string = source_name.replaceAll('\\', '/');
    const v_hash: string = source_item[source_name]['hash'];
    let source_changed = true;

    if (!(k_source in last_source_hashes)) {
      return {"changed-sources": [], "new-objects": [k_source]};
    }

    if (k_source in last_source_hashes) {

      if (last_source_hashes[k_source]['hash'] == v_hash) {
        source_changed = false;
        return {"changed-sources": [], "new-objects": []};
      }
    }

    if (source_changed)
      return {"changed-sources": [k_source], "new-objects": []};

    return {"changed-sources": [], "new-objects": []};

  }




  public static async retrieve_current_source_hashes(): Promise<source.ISource[]> {

    console.log('Start retrieve_current_source_hashes');
    let p1 = performance.now();

    const config = AppConfig.get_app_confg();
    const max_threads = config.general['max-threads'] || 20;
    const source_dir = path.join(Workspace.get_workspace(), config.general['source-dir'] || 'src');

    const sources = await DirTool.get_all_files_in_dir2(
      source_dir,
      '.',
      config.general['supported-object-types'] || ['pgm', 'file', 'srvpgm']
    );

    let p2 = performance.now();
    console.log(`Duration: ${p2-p1} milliseconds`);

    console.log(`Get checksum of sources`);

    let checksum_calls = [];
    let counter = 0;
    let hash_values: source.ISource[] = [];

    p1 = performance.now();
    if (sources) {
      
      //OBITools.parallel(sources, )
      //... eher mit dowhile und Promise.all und immer dazuhängen ...
      for (const source of sources) {
        counter ++;
        checksum_calls.push(DirTool.checksumFile(source_dir, source));
        if (counter > max_threads) {
          const all_promises = await Promise.all(checksum_calls);
          if (all_promises)
            hash_values = [...hash_values, ...all_promises];
          counter = 0;
          checksum_calls = [];
        }
      }

      const all_promises = await Promise.all(checksum_calls);
      if (all_promises)
        hash_values = [...hash_values, ...all_promises];
    }
    
    p2 = performance.now();
    console.log(`In total ${hash_values.length} hash values. Duration: ${p2-p1}`);
    return hash_values;
  }




  public static async parallel(arr: [], fn: Function, threads:number = 10) {
    const result = [];
    while (arr.length) {
      const res = await Promise.all(arr.splice(0, threads).map(x => fn(x)));
      result.push(res);
    }
    return result.flat();
  }



  public static get_remote_compiled_object_list(){

    const config = AppConfig.get_app_confg();

    if (!config.general['remote-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' missing`);

    const local_file: string = path.join(Workspace.get_workspace(), config.general['compiled-object-list']);
    const remote_file: string = path.join(config.general['remote-base-dir'], config.general['compiled-object-list']);
    
    SSH_Tasks.getRemoteFile(local_file, remote_file);
  }



  public static async transfer_all(silent: boolean|undefined) {

    const config = AppConfig.get_app_confg();

    if (!config.general['remote-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' missing`);

    const local_dir: string = Workspace.get_workspace();
    const remote_dir: string = path.join(config.general['remote-base-dir']);
    
    if (!silent) {
      const answer = await vscode.window.showErrorMessage(`Do you want to transfer all?\nThis can take several minutes.\n\nRemote folder: ${remote_dir}`, { modal: true }, ...['Yes', 'No']);
      switch (answer) {
        case 'No':
          throw new Error('Transfer canceled by user');
        case undefined:
          throw new Error('Transfer canceled by user');
        case 'Yes':
          break;
        }
    }

    vscode.window.showInformationMessage('Start transfer');

    const result = await SSH_Tasks.cleanup_directory();
    if (!result) {
      vscode.window.showErrorMessage('Cleanup of remote directory failed!');
      throw Error('Cleanup of remote directory failed!');
      return;
    }

    logger.info(`Transer local dir ${local_dir} to ${remote_dir}`);
    await SSH_Tasks.transfer_dir(local_dir, remote_dir);
  }




  public static async get_filtered_sources_with_details(source_list_file: string): Promise<source.IQualifiedSource[]|undefined> {

    const sources = await OBITools.get_local_sources();
    
    const source_filters: source.IQualifiedSource[] = DirTool.get_json(path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, source_list_file)) || [];

    const filtered_sources = OBITools.get_filtered_sources(sources, source_filters);
    const filtered_sources_extended = OBITools.get_extended_source_infos(filtered_sources);

    return filtered_sources_extended;
  }



  public static async get_local_sources(): Promise<source.IQualifiedSource[]|undefined> {

    const config = AppConfig.get_app_confg();
    const source_dir = path.join(Workspace.get_workspace(), config.general['source-dir'] || 'src');

    const sources = await DirTool.get_all_files_in_dir3(
      source_dir,
      '.',
      config.general['supported-object-types'] || ['pgm', 'file', 'srvpgm']
    );

    return sources;
  }



  private static get_extended_source_infos(sources: source.IQualifiedSource[]|undefined): source.IQualifiedSource[] | undefined {

    if (!sources)
      return;

    let new_list: source.IQualifiedSource[] = [];

    const config: AppConfig = AppConfig.get_app_confg();
    const source_infos: source.IQualifiedSource[] = DirTool.get_json(path.join(Workspace.get_workspace(), config.general['source-infos'] || '.obi/etc/source-infos.json')) || [];

    for (let source of sources) {

      source.description = '';
      
      for (const source_info of source_infos) {
        
        if (source['source-member'] == source_info['source-member'] && source['source-file'] == source_info['source-file'] && source['source-lib'] == source_info['source-lib']) {
          source.description = source_info.description;
          break;
        }
      }
      new_list.push(source);
    }

    return new_list;
  }




  private static get_filtered_sources(sources: source.IQualifiedSource[]|undefined, source_filters: source.IQualifiedSource[]): source.IQualifiedSource[] | undefined {

    if (!sources)
      return;

    let filtered_sources: source.IQualifiedSource[] = [];

    for (let source of sources) {
      
      const src_mbr = source['source-member'];
      const src_file = source['source-file'];
      const src_lib = source['source-lib'];

      for (const source_filter of source_filters) {
        
        const re_lib = new RegExp(source_filter['source-lib']);
        const re_file = new RegExp(source_filter['source-file']);
        const re_mbr = new RegExp(source_filter['source-member']);

        if (src_lib.match(re_lib) && src_file.match(re_file) && src_mbr.match(re_mbr))
          filtered_sources.push({"source-lib": src_lib, "source-file": src_file, "source-member": src_mbr});
      }
    }

    return filtered_sources;
  }



}