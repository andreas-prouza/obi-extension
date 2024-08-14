import * as vscode from 'vscode';
import { DirTool } from './DirTool';
import path from 'path';
import { getUri } from './getUri';
import { getNonce } from './getNonce';
import { Constants } from '../Constants';

import { AppConfig } from '../webview/controller/AppConfig';



export class OBITools {

  public static contains_obi_project(): boolean {

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
      return false;
    }

    const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;

    if (!DirTool.file_exists(path.join(ws, Constants.OBI_APP_CONFIG_FILE)))
      return false;

    if (!DirTool.file_exists(path.join(ws, 'etc', 'global.cfg')))
      return false;

    if (!DirTool.dir_exists(path.join(ws, 'scripts')))
      return false;

    return true;
  }




  public static get_global_stuff(webview : vscode.Webview, extensionUri: vscode.Uri) {

    const styleUri = getUri(webview, extensionUri, ["asserts/css", "style.css"]);

    const asserts_uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'asserts'));
    const webviewUri = getUri(webview, extensionUri, ["out", "webview.js"]); // VSCode styling
    const nonce = getNonce();
    
    let theme_mode = 'light';
    if (vscode.window.activeColorTheme.kind == vscode.ColorThemeKind.Dark)
      theme_mode = 'dark';

    return {
      asserts_uri: asserts_uri,
      styleUri: styleUri,
      webviewUri: webviewUri,
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
    this
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


  public static get_source_hash_list_file(workspace:string): {}[] | undefined {

    const config = AppConfig.get_app_confg();
    const file:string = path.join(workspace, config['app_config']['general']['compiled-object-list'])

    return DirTool.get_toml(file)

  }


  public static retrieve_source_hashes(workspaceUri: string, callback: Function) {

    const config = AppConfig.get_app_confg();
    const source_dir = path.join(workspaceUri, config['app_config']['general']['source-dir']);

    const dirs = DirTool.get_all_files_in_dir(
      source_dir,
      '.',
      config['app_config']['general']['supported-object-types']
    );

    let checksum_calls = [];
    for (const dir of dirs) {
      checksum_calls.push(DirTool.checksumFile(source_dir, dir));
    }

    console.log('Hash 1');
    Promise.all(checksum_calls)
    .then((results) => {
      for (const el of results) {
        //console.log(el);
      }
      console.log(`Finished for ${results.length} files`);
      callback(results);
    });

    console.log('Hash 3');
  }
}