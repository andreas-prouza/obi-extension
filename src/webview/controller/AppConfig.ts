import * as vscode from 'vscode';
import { OBITools } from '../../utilities/OBITools';
import { DirTool } from '../../utilities/DirTool';
import * as path from 'path';
import { Constants } from '../../Constants';
import { Workspace } from '../../utilities/Workspace';
import { SourceListConfig } from '../source_list/SourceListConfig';




export interface IConfigCompileSteps {
  ['extension'] : string[]
}


export interface IConfigConnectionProperties {
  'remote-host' : string,
  'ssh-key' : string | undefined,
  'ssh-user' : string,
  'ssh-concurrency' : number
}

export interface IConfigGeneralProperties {
  'local-base-dir' : string,
  'remote-base-dir' : string,
  'source-dir' : string,
  'local-obi-dir' : string,
  'remote-obi-dir' : string,
  'supported-object-types' : string[],
  'file-system-encoding' : string,
  'console-output-encoding' : string,
  'compiled-object-list' : string,
  'remote-source-list' : string,
  'compiled-object-list-md' : string,
  'dependency-list' : string,
  'deployment-object-list' : string,
  'build-output-dir' : string,
  'compile-list' : string
  'check-remote-source-on-startup' : boolean
}




export interface IConfigProperties {
  connection : IConfigConnectionProperties
  general : IConfigGeneralProperties
  global: ConfigGlobal
}


export interface IConfigLanguageCompileSettings {
  [language: string] : ConfigCompileSettings
}



export class ConfigConnection {
  public ['remote-host']?: string;
  public ['ssh-key']?: string;
  public ['ssh-user']?: string;
  public ['ssh-concurrency']?: number;

  constructor(remote_host?: string, ssh_key?: string, ssh_user?: string, ssh_concurrency?: number) {
    this['remote-host'] = remote_host;
    this['ssh-key'] = ssh_key;
    this['ssh-user'] = ssh_user;
    this['ssh-concurrency'] = ssh_concurrency;
  }

  public attributes_missing(): boolean {
    const x = (
      !this['remote-host']
    );
    return (
      !this['remote-host']
    );
  }
}



export class ConfigGeneral {

  public ['local-base-dir']?: string;
  public ['remote-base-dir']?: string;
  public ['source-dir']?: string;
  public ['local-obi-dir']?: string; // if not used, not necessary
  public ['remote-obi-dir']?: string;
  public ['supported-object-types']?: string[];
  public ['file-system-encoding']?: string;
  public ['console-output-encoding']?: string;
  public ['compiled-object-list']?: string;
  public ['source-list']?: string;
  public ['remote-source-list']?: string;
  public ['source-infos']?: string;
  public ['dependency-list']?: string;
  public ['deployment-object-list']?: string;
  public ['build-output-dir']?: string;
  public ['compile-list']?: string;
  public ['compiled-object-list-md']?: string;
  public ['check-remote-source-on-startup']?: boolean;
  public ['max-threads']?: number;
  public ['cloud-ws-ssh-remote-host']?: string; // This is the remote instead of local workspace not the IBM i server


  constructor(local_base_dir?: string, remote_base_dir?: string, source_dir?: string, 
    local_obi_dir?: string, remote_obi_dir?: string, supported_object_types?: string[], file_system_encoding?: string, 
    console_output_encoding?: string, compiled_object_list?: string, dependency_list?: string, deployment_object_list?: string, 
    build_output_dir?: string, compile_list?: string, compiled_object_list_md?: string, remote_source_list?: string, 
    check_remote_source_on_startup?: boolean, source_infos?: string, max_threads?: number, local_source_list?: string, cloud_ws_ssh_remote_host?: string) {
      
    this['local-base-dir'] = local_base_dir;
    this['remote-base-dir'] = remote_base_dir;
    this['local-obi-dir'] = local_obi_dir;
    this['remote-obi-dir'] = remote_obi_dir;
    this['source-dir'] = source_dir;
    
    this['supported-object-types'] = supported_object_types;
    this['file-system-encoding'] = file_system_encoding;
    this['console-output-encoding'] = console_output_encoding;
    this['compiled-object-list'] = compiled_object_list;
    this['remote-source-list'] = remote_source_list;
    this['source-list'] = local_source_list;
    this['source-infos'] = source_infos;
    this['dependency-list'] = dependency_list;
    this['deployment-object-list'] = deployment_object_list;
    this['build-output-dir'] = build_output_dir;
    this['compile-list'] = compile_list;
    this['compiled-object-list-md'] = compiled_object_list_md;
    this['check-remote-source-on-startup'] = check_remote_source_on_startup;
    this['max-threads'] = max_threads;
    this['cloud-ws-ssh-remote-host'] = cloud_ws_ssh_remote_host;
  }

  public attributes_missing(): boolean {

    return (
      !this['local-base-dir'] ||
      !this['remote-base-dir'] ||
      !this['source-dir'] ||
      !this['remote-obi-dir'] ||
      (!this['supported-object-types'] || this['supported-object-types'].length == 0) ||
      !this['file-system-encoding'] ||
      !this['console-output-encoding'] ||
      !this['compiled-object-list'] ||
      !this['source-list'] ||
      !this['remote-source-list'] ||
      !this['source-infos'] ||
      !this['dependency-list'] ||
      !this['deployment-object-list'] ||
      !this['build-output-dir'] ||
      !this['compile-list'] ||
      !this['compiled-object-list-md'] ||
      !this['max-threads']
    );
  }

}



export class ConfigCompileSettings {
  public TGTRLS?: string;
  public DBGVIEW?: string;
  public TGTCCSID?: string;
  public STGMDL?: string;
  public LIBL?: string[];
  public RPGPPOPT?: string;
  public INCDIR_RPGLE?: string;
  public INCDIR_SQLRPGLE?: string;
  public TARGET_LIB_MAPPING?: {};
  public INCLUDE_BNDDIR?: string;
  public ACTGRP?: string;
  public TARGET_LIB?: string;

  constructor(TGTRLS?: string, DBGVIEW?: string, TGTCCSID?: string, STGMDL?: string, LIBL?: string[], INCDIR_RPGLE?: string, INCDIR_SQLRPGLE?: string, TARGET_LIB_MAPPING?: {}, RPGPPOPT?: string, INCLUDE_BNDDIR?: string, ACTGRP?: string, TARGET_LIB?: string) {
    this.TGTRLS = TGTRLS; 
    this.DBGVIEW = DBGVIEW; 
    this.TGTCCSID = TGTCCSID; 
    this.STGMDL = STGMDL; 
    this.LIBL = LIBL; 
    this.INCDIR_RPGLE = INCDIR_RPGLE; 
    this.INCDIR_SQLRPGLE = INCDIR_SQLRPGLE; 
    this.TARGET_LIB_MAPPING = TARGET_LIB_MAPPING; 
    this.RPGPPOPT = RPGPPOPT;
    this.INCLUDE_BNDDIR = INCLUDE_BNDDIR;
    this.ACTGRP = ACTGRP;
    this.TARGET_LIB = TARGET_LIB;
  }

  public attributes_missing(): boolean {
    return (
      !this.TGTRLS ||
      !this.DBGVIEW ||
      !this.TGTCCSID ||
      !this.STGMDL ||
      !this.LIBL
    )
    ;
  }
}






export class ConfigSettings {

  public general?: ConfigCompileSettings;
  public language?: IConfigLanguageCompileSettings;



  constructor(general?: ConfigCompileSettings, language?: IConfigLanguageCompileSettings) {

    if (general) {
      this.general = new ConfigCompileSettings(
        general.TGTRLS, 
        general.DBGVIEW, 
        general.TGTCCSID, 
        general.STGMDL, 
        general.LIBL,
        general.INCDIR_RPGLE,
        general.INCDIR_SQLRPGLE,
        general.TARGET_LIB_MAPPING,
        general.RPGPPOPT,
        general.INCLUDE_BNDDIR,
        general.ACTGRP,
        general.TARGET_LIB
      );
    }

    if (language) {
      this.language = language;
    }

  }

  public attributes_missing(): boolean {
    return !this.general || this.general.attributes_missing();
  }

}





export class ConfigGlobal {

  public settings?: ConfigSettings;
  public cmds?: {["key"]: string};
  public "compile-cmds"?: {["key"]: string};
  public steps?: IConfigCompileSteps;

  constructor(settings?: ConfigSettings, 
    cmds?: {["key"]: string}, 
    compile_cmds?: {["key"]: string}, 
    steps?: IConfigCompileSteps) {
    
    if (settings?.general)
      this.settings = new ConfigSettings(settings?.general, settings?.language);

    this.cmds = cmds;
    this['compile-cmds'] = compile_cmds;
    this.steps = steps ;

  }

  public attributes_missing(): boolean {
    return (
      !this.settings || this.settings.attributes_missing() ||
      !this.cmds ||
      !this['compile-cmds'] ||
      !this.steps
    );
  }

}



export type SourceConfig = {
  settings: {
    [key: string]: string
  }|undefined,
  "source-cmds": {
    [key: string]: string
  }|undefined,
  steps: string[]|undefined
}


export type SourceConfigList = {
  [source: string]: SourceConfig
}




export class AppConfig {

  public connection: ConfigConnection;
  public general: ConfigGeneral;
  public global: ConfigGlobal;

  private static _config: AppConfig|undefined = undefined;
  private static _last_loading_time: number = 0;


  constructor(con?: ConfigConnection, gen?: ConfigGeneral, glob?: ConfigGlobal) {
    this.connection = new ConfigConnection(
      AppConfig.get_string(con?.['remote-host']),
      AppConfig.get_string(con?.['ssh-key']),
      AppConfig.get_string(con?.['ssh-user']),
      con?.['ssh-concurrency']
  );
    this.general = gen ?? new ConfigGeneral();
    this.global = glob ?? new ConfigGlobal();
  }


  public static reset() {
    this._last_loading_time = 0;
    this._config = undefined;
  }


  public static self_check() {

    const config = AppConfig.get_app_config();
    
    if (config.general['local-obi-dir'] && !DirTool.dir_exists(config.general['local-obi-dir']))
      vscode.window.showErrorMessage(`Config error: local OBI location '${config.general['local-obi-dir']}' does not exist`);

    if (config.general['local-obi-dir'] && !OBITools.get_local_obi_python_path())
      vscode.window.showErrorMessage(`Local OBI error: Virtual environmentd is missing in '${config.general['local-obi-dir']}'. Have you run the setup script?`);
    
  }


  public static get_app_config(config_dict?: AppConfig): AppConfig {

    let configs: AppConfig|undefined = config_dict;

    let con_obj: ConfigConnection|undefined = undefined;
    let gen_obj: ConfigGeneral|undefined = undefined;
    let glob_obj: ConfigGlobal|undefined = undefined;

    if (!configs) {
      if (this._config && this._last_loading_time > (Date.now() - 2000)) // Reuse if only 2 seconds old
        return this._config;

      configs = AppConfig.load_configs();
    }

    
    if (configs.connection) {
      const con_dict: ConfigConnection = configs.connection;
      con_obj = new ConfigConnection(
        AppConfig.get_string(con_dict['remote-host']), 
        AppConfig.get_string(con_dict['ssh-key']), 
        AppConfig.get_string(con_dict['ssh-user'])
      );
    }
    
    if (configs['general']) {
      const gen: ConfigGeneral = configs.general
      gen_obj = new ConfigGeneral(
        AppConfig.get_string(gen['local-base-dir']),
        AppConfig.get_string(gen['remote-base-dir']),
        AppConfig.get_string(gen['source-dir']),
        AppConfig.get_string(gen['local-obi-dir']),
        AppConfig.get_string(gen['remote-obi-dir']),
        gen['supported-object-types'],
        AppConfig.get_string(gen['file-system-encoding']),
        AppConfig.get_string(gen['console-output-encoding']),
        AppConfig.get_string(gen['compiled-object-list']),
        AppConfig.get_string(gen['dependency-list']),
        AppConfig.get_string(gen['deployment-object-list']),
        AppConfig.get_string(gen['build-output-dir']),
        AppConfig.get_string(gen['compile-list']),
        AppConfig.get_string(gen['compiled-object-list-md']),
        AppConfig.get_string(gen['remote-source-list']),
        gen['check-remote-source-on-startup'] === true,
        AppConfig.get_string(gen['source-infos']),
        gen['max-threads'],
        AppConfig.get_string(gen['source-list']),
        AppConfig.get_string(gen['cloud-ws-ssh-remote-host'])
      );
    }

    if (configs['global']) {
      const global: ConfigGlobal = configs['global'];
      glob_obj = new ConfigGlobal(global['settings'], global['cmds'], global['compile-cmds'], global['steps']);
    }

    let app_config = new AppConfig(con_obj, gen_obj, glob_obj);
    if (!config_dict) {
      this._last_loading_time = Date.now();
      this._config = app_config;
    }

    return app_config;
  }


  private static get_string(value: string|undefined): string|undefined {
    if (!value || value.length == 0)
      return undefined;
    return value;
  }
  
  
  

  public static get_project_app_config(workspace: vscode.Uri): AppConfig {

    const app_config = DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_APP_CONFIG_FILE));

    return app_config
  }



  public static get_user_app_config(workspace: vscode.Uri): AppConfig {

    const user_app_config: AppConfig|undefined = DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_APP_CONFIG_USER_FILE));

    const app_config: AppConfig = new AppConfig(user_app_config?.connection, user_app_config?.general, user_app_config?.global);

    return app_config;

  }



  public static get_source_configs(): SourceConfigList|undefined {

    const source_config: SourceConfigList|undefined = DirTool.get_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE));
    
    return source_config;
  }




  private static empty(object: any): void {
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



  private static load_configs(): AppConfig {
    
    const ws_uri = Workspace.get_workspace_uri();

    const project_app_config: {} = AppConfig.get_project_app_config(ws_uri);
    const user_app_config: {} = AppConfig.get_user_app_config(ws_uri);

    const config = OBITools.override_dict(user_app_config, project_app_config);

    return config;
    
  }



  public attributes_missing(): boolean {
    return (
      !this.connection || this.connection.attributes_missing() || 
      !this.general || this.general.attributes_missing() || 
      !this.global || this.global.attributes_missing()
    );
  }


  public static attributes_missing(): boolean {
    const config = AppConfig.get_app_config();
    return config.attributes_missing();
  }

}