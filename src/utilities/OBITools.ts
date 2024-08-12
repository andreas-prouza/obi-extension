import * as vscode from 'vscode';
import { DirTool } from './DirTool';
import path from 'path';
import { getUri } from './getUri';
import { getNonce } from './getNonce';
import { Constants } from '../Constants';

import { deepmerge } from "deepmerge-ts";



export class OBITools {

  public static contains_obi_project(): boolean {

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
      return false;
    }

    const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;

    if (!DirTool.file_exists(path.join(ws, Constants.OBI_CONFIG_FILE)))
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


  public static get_project_app_config(workspace: vscode.Uri): {} {
    return DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_CONFIG_FILE));
  }


  public static get_user_app_config(workspace: vscode.Uri): {} {
    return DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_USER_CONFIG_FILE));
  }



  public static get_obi_app_config(): {} {

    const ws_uri =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri
    : undefined;

    if (ws_uri) {
      
      const global_config = DirTool.get_key_value_file(path.join(ws_uri.fsPath, Constants.OBI_GLOBAL_CONFIG));
      
      let project_app_config = OBITools.get_project_app_config(ws_uri);
      const user_app_config = OBITools.get_user_app_config(ws_uri);

      if (user_app_config['general'])
        project_app_config['general'] = OBITools.override_dict(user_app_config['general'], project_app_config['general']);

      if (user_app_config['global'] && user_app_config['global']['settings'] && user_app_config['global']['settings']['general'])
        project_app_config['global']['settings']['general'] = OBITools.override_dict(user_app_config['global']['settings']['general'], project_app_config['global']['settings']['general']);

      return {
        app_config: project_app_config,
        global_config: global_config
      }
    }

    return {};
  }


  public static override_dict(from_dict:{}, to_dict:{}): {} {
    return {...to_dict, ...from_dict};
  }



  public static get_compile_list(workspaceUri: vscode.Uri): {}|undefined {

    const config = OBITools.get_obi_app_config();
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



}