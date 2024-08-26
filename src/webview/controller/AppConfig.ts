import * as vscode from 'vscode';
import { OBITools } from '../../utilities/OBITools';
import { DirTool } from '../../utilities/DirTool';
import path from 'path';
import { Constants } from '../../Constants';
import { Workspace } from '../../utilities/Workspace';


export const APP_CONFIG_TEMPLATE: {} = {
  general: {
    // key: default-value
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



export interface IConfigCompileSteps {
  ['extension'] : string[]
}


export interface ConfigConnectionProperties {
  'remote-host' : string,
  'ssh-key' : string | undefined,
  'ssh-user' : string,
  'ssh-concurrency' : number
}

export interface ConfigGeneralProperties {
  'local-base-dir' : string,
  'remote-base-dir' : string,
  'source-dir' : string,
  'use-remote-obi' : boolean,
  'local-obi-dir' : string,
  'remote-obi-dir' : string,
  'supported-object-types' : string[],
  'file-system-encoding' : string,
  'console-output-encoding' : string,
  'compiled-object-list' : string,
  'compiled-object-list-md' : string,
  'dependency-list' : string,
  'deployment-object-list' : string,
  'build-output-dir' : string,
  'compile-list' : string
}

export interface ConfigProperties {
  connection : ConfigConnectionProperties
  general : ConfigGeneralProperties
}


export interface IConfigProperties {
  connection : ConfigConnectionProperties
  general : ConfigGeneralProperties
}


export class ConfigConnection {
  public remote_host?: string;
  public ssh_key?: string;
  public ssh_user?: string;
  public ssh_concurrency: number;

  constructor(remote_host?: string, ssh_key?: string, ssh_user?: string, ssh_concurrency?: number) {
    this.remote_host = remote_host;
    this.ssh_key = ssh_key;
    this.ssh_user = ssh_user;
    this.ssh_concurrency = ssh_concurrency ?? 5;
  }

  public attributes_missing(): boolean {
    const x = (
      !this.remote_host
    );
    return (
      !this.remote_host
    );
  }
}



export class ConfigGeneral {

  public local_base_dir: string;
  public remote_base_dir?: string;
  public source_dir: string;
  public use_remote_obi: boolean;
  public local_obi_dir?: string; // if not used, not necessary
  public remote_obi_dir?: string;
  public supported_object_types: string[];
  public file_system_encoding: string;
  public console_output_encoding: string;
  public compiled_object_list: string;
  public dependency_list: string;
  public deployment_object_list: string;
  public build_output_dir: string;
  public compile_list: string;
  public compiled_object_list_md: string;

  constructor(local_base_dir?: string, remote_base_dir?: string, source_dir?: string, use_remote_obi?: boolean, local_obi_dir?: string, remote_obi_dir?: string, supported_object_types?: string[], file_system_encoding?: string, console_output_encoding?: string, compiled_object_list?: string, dependency_list?: string, deployment_object_list?: string, build_output_dir?: string, compile_list?: string, compiled_object_list_md?: string) {
    this.local_base_dir = local_base_dir ?? '.';
    this.remote_base_dir = remote_base_dir;
    this.source_dir = source_dir ?? 'src';
    this.use_remote_obi = use_remote_obi != undefined && use_remote_obi === true ? true : false;
    this.local_obi_dir = local_obi_dir;
    this.remote_obi_dir = remote_obi_dir;
    this.supported_object_types = supported_object_types && supported_object_types instanceof Array ? supported_object_types : ['pgm', 'srvpgm', 'file'];
    this.file_system_encoding = file_system_encoding ?? 'utf-8';
    this.console_output_encoding = console_output_encoding ?? 'utf-8';
    this.compiled_object_list = compiled_object_list ?? 'etc/object-builds.toml';
    this.dependency_list = dependency_list ?? "etc/dependency.toml";
    this.deployment_object_list = deployment_object_list ?? "build-output/object-list.txt";
    this.build_output_dir = build_output_dir ?? 'build-output/objects';
    this.compile_list = compile_list ?? 'build-output/compile-list.json';
    this.compiled_object_list_md = compiled_object_list_md ?? 'build-output/compiled-object-list.md';
  }

  public attributes_missing(): boolean {
    
    const x = (
      !this.local_base_dir ||
      !this.remote_base_dir ||
      !this.remote_obi_dir ||
      this.supported_object_types.length == 0 ||
      !this.source_dir ||
      !this.compiled_object_list ||
      !this.dependency_list ||
      !this.compiled_object_list ||
      !this.build_output_dir ||
      !this.compile_list
    );
    
    return (
      !this.local_base_dir ||
      !this.remote_base_dir ||
      !this.remote_obi_dir ||
      this.supported_object_types.length == 0 ||
      !this.source_dir ||
      !this.compiled_object_list ||
      !this.dependency_list ||
      !this.compiled_object_list ||
      !this.build_output_dir ||
      !this.compile_list
    );
  }

}



export class ConfigCompileSettings {
  public TGTRLS: string;
  public DBGVIEW: string;
  public TGTCCSID: string;
  public STGMDL: string;
  public LIBL: string[];
  public INCDIR_RPGLE?: string;
  public INCDIR_SQLRPGLE?: string;
  public TARGET_LIB_MAPPING?: {};

  constructor(TGTRLS?: string, DBGVIEW?: string, TGTCCSID?: string, STGMDL?: string, LIBL?: string[], INCDIR_RPGLE?: string, INCDIR_SQLRPGLE?: string, TARGET_LIB_MAPPING?: {}) {
    this.TGTRLS = TGTRLS ?? '*CURRENT'; 
    this.DBGVIEW = DBGVIEW ?? '*SOURCE'; 
    this.TGTCCSID = TGTCCSID ?? '*JOB'; 
    this.STGMDL = STGMDL ?? '*SNGLVL'; 
    this.LIBL = LIBL ?? ['QGPL']; 
    this.INCDIR_RPGLE = INCDIR_RPGLE; 
    this.INCDIR_SQLRPGLE = INCDIR_SQLRPGLE; 
    this.TARGET_LIB_MAPPING = TARGET_LIB_MAPPING; 
  }
}






export class ConfigSettings {

  public general: ConfigCompileSettings;

  constructor(general?: ConfigCompileSettings) {
    if (general) {
      this.general = new ConfigCompileSettings(
        general.TGTRLS, 
        general.DBGVIEW, 
        general.TGTCCSID, 
        general.STGMDL, 
        general.LIBL,
        general.INCDIR_RPGLE,
        general.INCDIR_SQLRPGLE,
        general.TARGET_LIB_MAPPING
      );
      return;
    }
    this.general = new ConfigCompileSettings();

  }

  public attributes_missing(): boolean {
    return false;
  }

}





export class ConfigGlobal {

  public settings: ConfigSettings;
  public cmds: {["key"]: string}|{};
  public compile_cmds: {["key"]: string}|{};
  public steps: IConfigCompileSteps|[];

  constructor(settings?: ConfigSettings, cmds?: {["key"]: string}, 
    compile_cmds?: {["key"]: string}, steps?: IConfigCompileSteps) {
    
    this.settings = new ConfigSettings(settings?.general);
    this.cmds = cmds ?? {};
    this.compile_cmds = compile_cmds ?? {};
    this.steps = steps ?? [];

  }


  public attributes_missing(): boolean {
    return false;
  }

}




export class AppConfig {

  public connection: ConfigConnection;
  public general: ConfigGeneral;
  public global: ConfigGlobal;

  private static _config: IConfigProperties;


  constructor() {
    this.connection = new ConfigConnection();
    this.general = new ConfigGeneral();
    this.global = new ConfigGlobal();
  }



  public static get_app_confg(config_dict?: IConfigProperties): AppConfig {

    let configs: IConfigProperties|undefined = config_dict;

    if (!configs)
      configs = AppConfig.load_configs();

    let app_config = new AppConfig();
    
    if (configs['connection']) {
      const con: ConfigConnectionProperties = configs['connection']
      app_config.connection.remote_host = AppConfig.get_string(con['remote-host']);
      app_config.connection.ssh_key = AppConfig.get_string(con['ssh-key']);
      app_config.connection.ssh_user = AppConfig.get_string(con['ssh-user']);
    }
    
    if (configs['general']) {
      const gen: ConfigGeneralProperties = configs['general']
      app_config.general = new ConfigGeneral(
        AppConfig.get_string(gen['local-base-dir']),
        AppConfig.get_string(gen['remote-base-dir']),
        AppConfig.get_string(gen['source-dir']),
        gen['use-remote-obi'],
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
      );
    }

    return app_config;
  }


  private static get_string(value: string|undefined): string|undefined {
    if (!value || value.length == 0)
      return undefined;
    return value;
  }
  
  
  

  public static get_project_app_config(workspace: vscode.Uri): IConfigProperties {

    const app_config = DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_APP_CONFIG_FILE));

    return app_config
  }



  public static get_user_app_config(workspace: vscode.Uri): {} {

    const user_app_config: {} = DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_APP_CONFIG_USER_FILE)) || {};

    const project_app_config: {} = AppConfig.get_project_app_config(workspace) || {};
    AppConfig.empty(project_app_config);

    const app_config = OBITools.override_dict(user_app_config, project_app_config);

    return app_config;

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



  private static load_configs(): IConfigProperties {
    
    const ws_uri = Workspace.get_workspace_uri();

    const project_app_config: {} = AppConfig.get_project_app_config(ws_uri);
    const user_app_config: {} = AppConfig.get_user_app_config(ws_uri);

    AppConfig._config = OBITools.override_dict(user_app_config, project_app_config);

    return AppConfig._config;
    
  }



  public attributes_missing(): boolean {
    return this.connection.attributes_missing() || this.general.attributes_missing();
  }


  public static attributes_missing(): boolean {
    const config = AppConfig.get_app_confg();
    return config.attributes_missing();
  }

}