import * as vscode from 'vscode';
import { DirTool } from './DirTool';
import path from 'path';
import { getUri } from './getUri';
import { getNonce } from './getNonce';
import { Constants } from '../Constants';

import { AppConfig } from '../webview/controller/AppConfig';
import { SSH_Tasks } from './SSH_Tasks';
import * as source from '../obi/Source';
import { Workspace } from './Workspace';
import * as fs from 'fs';



export class OBITools {

  public static ext_context?: vscode.ExtensionContext;


  public static is_native(): boolean {

    const config = AppConfig.get_app_confg();
    const use_local_obi: boolean = !(config['global_config']['USE_PYTHON'].toLowerCase() === 'true');

    return use_local_obi;
  }



  
  public static contains_obi_project(): boolean {

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
      return false;
    }

    const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;

    if (!DirTool.file_exists(path.join(ws, Constants.OBI_APP_CONFIG_FILE)))
      return false;

    if (!DirTool.file_exists(path.join(ws, Constants.OBI_GLOBAL_CONFIG)))
      return false;


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




  public static override_dict(from_dict:{}, to_dict:{}): {} {
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
    
    const config = AppConfig.get_app_confg();
    const file_path: string = path.join(workspaceUri.fsPath, config['app_config']['general']['compile-list']);
    
    if (!DirTool.file_exists(file_path))
      return undefined;

    const fs = require("fs"); 
    let compile_list = fs.readFileSync(file_path);
    // Converting to JSON 
    compile_list = JSON.parse(compile_list);

    if (typeof compile_list !='object' || compile_list==null || (compile_list instanceof Array) || (compile_list instanceof Date))
      return undefined;

    if (!compile_list['compiles'] || !compile_list['timestamp'])
      return undefined;

    return compile_list
  }



  public static get_source_hash_list(workspace:string): source.Source | undefined {

    const config = AppConfig.get_app_confg();
    const file:string = path.join(workspace, config['app_config']['general']['compiled-object-list'])

    return DirTool.get_toml(file)

  }



  public static async get_changed_sources(): source.ChangedSources { // results: source.Source[]

    const current_hash_list: [] = await OBITools.retrieve_source_hashes(Workspace.get_workspace());
    const changed_sources: source.ChangedSources = OBITools.compare_source_change(current_hash_list);

    return changed_sources;
  }



  public static get_dependend_sources(changed_sources: source.ChangedSources): string[] {

    let dependend_sources: string[] = [];
    const config = AppConfig.get_app_confg();

    const all_sources: string[] = Object.assign([], changed_sources['changed-sources'], changed_sources['new-objects']);

    const dependency_list: {} = DirTool.get_toml(path.join(Workspace.get_workspace(), config['app_config']['general']['dependency-list']));
    for (const [k, v] of Object.entries(dependency_list)) {
      for (let i=0; i<all_sources.length; i++) {
        if (all_sources[i] in v) {
          dependend_sources.push(k);
          break;
        }
      }
    }

    return dependend_sources;
  }




  public static compare_source_change(results: source.Source[]): source.ChangedSources {

    // Get all sources which are new or have changed
    const last_source_hashes: source.Source | undefined = OBITools.get_source_hash_list(Workspace.get_workspace());
    let changed_sources: source.Source[] = [];
    let new_sources: source.Source[] = [];

    if (!last_source_hashes)
      return {
        "new-objects": [],
        "changed-sources": []
      };
    
    // check for changed sources
    results.map((source_item: source.Source) => {

      const source_name: string = Object.keys(source_item)[0];

      const k_source: string = source_name;
      const v_hash: string = source_item[source_name]['hash'];
      let source_changed = true;

      if (!(k_source in last_source_hashes)) {
        new_sources.push(source_item);
        return;
      }

      if (k_source in last_source_hashes) {

        if (last_source_hashes[k_source]['hash'] == v_hash) {
          source_changed = false;
          return;
        }
      }

      if (source_changed)
        changed_sources.push(source_item);
    });
    
    return {
      "new-objects": new_sources,
      "changed-sources": changed_sources
    };
  }


  public static retrieve_source_hashes(workspaceUri: string) {

    const config = AppConfig.get_app_confg();
    const source_dir = path.join(workspaceUri, config['app_config']['general']['source-dir']);

    const dirs = DirTool.get_all_files_in_dir(
      source_dir,
      '.',
      config['app_config']['general']['supported-object-types']
    );

    let checksum_calls = [];
    if (dirs)
      for (const dir of dirs) {
        checksum_calls.push(DirTool.checksumFile(source_dir, dir));
      }

    return Promise.all(checksum_calls)
    .then((results) => {
      console.log(`Finished for ${results.length} files`);
      return results;
    });
  }



  public static get_remote_compiled_object_list(){

    const config = AppConfig.get_app_confg();

    const local_file: string = path.join(Workspace.get_workspace(), config['app_config']['general']['compiled-object-list']);
    const remote_file: string = path.join(config['app_config']['general']['remote-base-dir'], config['app_config']['general']['compiled-object-list']);
    
    SSH_Tasks.getRemoteFile(local_file, remote_file);
  }



  public static async transfer_all(){

    const config = AppConfig.get_app_confg();

    const local_dir: string = Workspace.get_workspace();
    const remote_dir: string = path.join(config['app_config']['general']['remote-base-dir']);
    
    SSH_Tasks.transfer_dir(local_dir, remote_dir);
  }

}