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

    const app_config = DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_APP_CONFIG_FILE));

    const global_config = DirTool.get_key_value_file(path.join(workspace.fsPath, Constants.OBI_GLOBAL_CONFIG)) || {};

    return {
      app_config: app_config,
      global_config: global_config
    }
  }



  public static get_user_app_config(workspace: vscode.Uri): {} {

    const user_app_config: {} = DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_APP_CONFIG_USER_FILE)) || {};

    const project_app_config: {} = AppConfig.get_project_app_config(workspace) || {};
    AppConfig.empty(project_app_config);

    const app_config = OBITools.override_dict(user_app_config, project_app_config['app_config']);
    //im app_config gibt es unterschiedliche array strukturen als im Project array!!!!

    const global_user_config: {} = DirTool.get_key_value_file(path.join(workspace.fsPath, Constants.OBI_GLOBAL_USER_CONFIG)) || {};
    const global_config: {} = OBITools.override_dict(global_user_config, project_app_config['global_config']);

    return {
      app_config: app_config,
      global_config: global_config
    }

  }


  private static empty(object: {}): void {
    Object.keys(object).forEach(function (k:string){
        if (object[k] && typeof object[k] === 'object' && !(object[k] instanceof Array)) {
            return AppConfig.empty(object[k]);
        }
        if (object[k] instanceof Array)
          object[k] = [];
        if (typeof object[k] === 'string')
          object[k] = '';
    });
  }


  public static get_app_confg() {
    
    const ws_uri =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0].uri
    : undefined;

    if (!ws_uri)
      return {
        app_config: {},
        global_config: {}
      }
            
    const project_app_config: {} = AppConfig.get_project_app_config(ws_uri);
    const user_app_config: {} = AppConfig.get_user_app_config(ws_uri);

    const all: {} = OBITools.override_dict(user_app_config, project_app_config);
    //const app_config: {} = OBITools.override_dict(user_app_config['app_config'], project_app_config['app_config']);
    //const global_config: {} = OBITools.override_dict(user_app_config['global_config'], project_app_config['global_config']);

    return all;
    
  }


}