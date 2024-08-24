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
import * as fs from 'fs';



export class OBITools {

  public static ext_context?: vscode.ExtensionContext;


  public static is_native(): boolean {

    const config = AppConfig.get_app_confg();
    const use_local_obi: boolean = !((config.general.use_remote_obi ?? 'false').toLowerCase() === 'true');

    return use_local_obi;
  }



  public static async check_remote(): Promise<boolean> {

    const config = AppConfig.get_app_confg();
    const remote_base_dir: string|undefined = config.general.remote_base_dir;
    const remote_obi_dir: string|undefined = config.general.remote_obi_dir;
    let check: boolean;

    if (!remote_base_dir || ! remote_obi_dir)
      throw Error(`Missing 'remote_base_dir' or 'remote_obi_dir'`);

    check = await SSH_Tasks.check_remote_path(path.join(remote_base_dir, Constants.OBI_APP_CONFIG_FILE));
    if (!check)
      return false;

    check = await SSH_Tasks.check_remote_path(path.join(remote_base_dir, config.general.source_dir));
    if (!check)
      return false;

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



  public static initialize_folder(): void {
    
    if (! vscode.workspace.workspaceFolders || !OBITools.ext_context) {
      vscode.window.showErrorMessage('No workspace is opened!');
      return;
    }

    const ws = Workspace.get_workspace();
    const ext_ws = path.join(OBITools.ext_context.asAbsolutePath('.'), 'obi-media');

    const x = DirTool.dir_exists(path.join(ws, 'etc'));
    
    if (!DirTool.dir_exists(path.join(ws, 'etc'))){
      fs.mkdirSync(path.join(ws, 'etc'));
    }

    fs.copyFileSync(path.join(ext_ws, 'etc', 'app-config.toml'), path.join(ws, 'etc', 'app-config.toml'));
    fs.copyFileSync(path.join(ext_ws, 'etc', 'global.cfg'), path.join(ws, 'etc', 'global.cfg'));

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
      theme_mode: theme_mode
    }
  }




  public static override_dict(from_dict:{}, to_dict:{}): IConfigProperties {
    for (let [k, v] of Object.entries(from_dict)) {
      if (typeof v==='object' && v!==null && !(v instanceof Array) && !(v instanceof Date))
        v = OBITools.override_dict(from_dict[k], to_dict[k]);

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
    const file_path: string = path.join(workspaceUri.fsPath, config.general.compile_list);
    
    if (!DirTool.file_exists(file_path))
      return undefined;

    let compile_list: string = fs.readFileSync(file_path).toString();
    // Converting to JSON 
    compile_list = JSON.parse(compile_list);

    if (typeof compile_list !='object' || compile_list==null || (compile_list instanceof Array) || (compile_list instanceof Date))
      return undefined;

    if (!compile_list['compiles'] || !compile_list['timestamp'])
      return undefined;

    return compile_list
  }



  public static get_source_hash_list(workspace:string): source.ISource | undefined {

    const config = AppConfig.get_app_confg();
    const file:string = path.join(workspace, config.general.compiled_object_list)

    return DirTool.get_toml(file)

  }



  public static async get_changed_sources(): Promise<source.ISourceList> { // results: source.Source[]

    const current_hash_list = await OBITools.retrieve_current_source_hashes(Workspace.get_workspace());

    const changed_sources: source.ISourceList = await OBITools.compare_source_change(current_hash_list);

    return changed_sources;
  }



  public static get_dependend_sources(changed_sources: source.ISourceList): string[] {

    let dependend_sources: string[] = [];
    const config = AppConfig.get_app_confg();

    const all_sources: string[] = Object.assign([], changed_sources['changed-sources'], changed_sources['new-objects']);

    const dependency_list: {} = DirTool.get_toml(path.join(Workspace.get_workspace(), config.general.dependency_list));
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



  public static async generate_source_change_lists(): Promise<source.ISourceList> {
    const ws = Workspace.get_workspace();

    DirTool.clean_dir(path.join(ws, 'tmp'));
    DirTool.clean_dir(path.join(ws, 'build-output'));

    const changed_sources: source.ISourceList = await OBITools.get_changed_sources();
    const dependend_sources: string[] = await OBITools.get_dependend_sources(changed_sources);

    DirTool.clean_dir(path.join(Workspace.get_workspace(), 'tmp'));
    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.CHANGED_OBJECT_LIST), JSON.stringify(changed_sources));
    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.DEPENDEND_OBJECT_LIST), JSON.stringify(dependend_sources));

    return changed_sources;
  }



  public static compare_source_change(results: source.ISource[]): source.ISourceList {

    // Get all sources which are new or have changed
    const last_source_hashes: source.ISource | undefined = OBITools.get_source_hash_list(Workspace.get_workspace());
    let changed_sources: string[] = [];
    let new_sources: string[] = [];

    if (!last_source_hashes)
      return {
        "new-objects": [],
        "changed-sources": []
      };
    
    // check for changed sources
    results.map((source_item: source.ISource) => {

      const source_name: string = Object.keys(source_item)[0];

      const k_source: string = source_name;
      const v_hash: string = source_item[source_name]['hash'];
      let source_changed = true;

      if (!(k_source in last_source_hashes)) {
        new_sources.push(k_source);
        return;
      }

      if (k_source in last_source_hashes) {

        if (last_source_hashes[k_source]['hash'] == v_hash) {
          source_changed = false;
          return;
        }
      }

      if (source_changed)
        changed_sources.push(k_source);
    });
    
    return {
      "new-objects": new_sources,
      "changed-sources": changed_sources
    };
  }


  public static async retrieve_current_source_hashes(workspaceUri: string): Promise<source.ISource[]> {

    const config = AppConfig.get_app_confg();
    const source_dir = path.join(workspaceUri, config.general.source_dir);

    const sources = DirTool.get_all_files_in_dir(
      source_dir,
      '.',
      config.general.supported_object_types
    );

    let checksum_calls = [];
    if (sources)
      
      for (const source of sources) {
        checksum_calls.push(DirTool.checksumFile(source_dir, source));
      }

    const all_promises = Promise.all(checksum_calls);
    const hash_values: source.ISource[] = await all_promises;

    return hash_values;
  }



  public static get_remote_compiled_object_list(){

    const config = AppConfig.get_app_confg();

    if (!config.general.remote_base_dir)
      throw Error(`Config attribute 'config.general.remote_base_dir' missing`);

    const local_file: string = path.join(Workspace.get_workspace(), config.general.compiled_object_list);
    const remote_file: string = path.join(config.general.remote_base_dir, config.general.compiled_object_list);
    
    SSH_Tasks.getRemoteFile(local_file, remote_file);
  }



  public static async transfer_all() {

    const config = AppConfig.get_app_confg();

    if (!config.general.remote_base_dir)
      throw Error(`Config attribute 'config.general.remote_base_dir' missing`);

    const local_dir: string = Workspace.get_workspace();
    const remote_dir: string = path.join(config.general.remote_base_dir);
    
    console.log(`Transer local dir ${local_dir} to ${remote_dir}`);
    await SSH_Tasks.transfer_dir(local_dir, remote_dir);
  }

}