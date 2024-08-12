import * as vscode from 'vscode';
import { OBITools } from '../../utilities/OBITools';
import { DirTool } from '../../utilities/DirTool';
import path from 'path';
import { Constants } from '../../Constants';


export const APP_CONFIG_TEMPLATE: {} = {
  general: {
    "local-base-dir": "",
    "remote-base-dir": "",
    "supported-object-types": [],
    "file-system-encoding": "",
    "console-output-encoding": "",
    "source-dir": "",
    "compiled-object-list": "",
    "dependency-list": "",
    "deployment-object-list": "",
    "build-output-dir": "",

  }
}





export class AppConfig {



  public static get_project_app_config(workspace: vscode.Uri): {} {
    return DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_CONFIG_FILE));
  }


  public static get_user_app_config(workspace: vscode.Uri): {} {
    const user_app_config: {} = DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_USER_CONFIG_FILE)) || {};
    const project_app_config: {} = AppConfig.get_project_app_config(workspace) || {};
    AppConfig.empty(project_app_config);
    return OBITools.override_dict(user_app_config, project_app_config);
  }


  private static empty(object: {}): void {
    Object.keys(object).forEach(function (k){
        if (object[k] && typeof object[k] === 'object') {
            return AppConfig.empty(object[k]);
        }
        object[k] = '';
    });
  }


  public static get_app_confg() {
    
    const ws_uri =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri
    : undefined;

    if (ws_uri) {
      
      const global_config = DirTool.get_key_value_file(path.join(ws_uri.fsPath, Constants.OBI_GLOBAL_CONFIG));
      
      let project_app_config = AppConfig.get_project_app_config(ws_uri);
      const user_app_config = AppConfig.get_user_app_config(ws_uri);

      if (user_app_config['general'])
        project_app_config['general'] = OBITools.override_dict(user_app_config['general'], project_app_config['general']);

      if (user_app_config['global'] && user_app_config['global']['settings'] && user_app_config['global']['settings']['general'])
        project_app_config['global']['settings']['general'] = OBITools.override_dict(user_app_config['global']['settings']['general'], project_app_config['global']['settings']['general']);

      return {
        app_config: project_app_config,
        global_config: global_config
      }
    }

  }


}