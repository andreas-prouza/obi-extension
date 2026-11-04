import * as vscode from 'vscode';
import { override_dict } from '../../shared/DictTools';
import { DirTool } from '../utilities/DirTool';
import * as path from 'path';
import { Constants } from '../../shared/Constants';
import { Workspace, WorkspaceSettings } from '../utilities/Workspace';
import { logger } from '../utilities/Logger';
import { is_safe_profile_alias } from '../../shared/Profile';
import { CachedFiles } from '../../shared/CachedFiles';






/** Build steps per source extension (e.g. "rpgle.pgm", "*ALL") */
export type IConfigCompileSteps = Record<string, string[]>;


export interface IConfigConnectionProperties {
  'remote-host' : string;
  'ssh-key' : string | undefined;
  'ssh-user' : string;
  'ssh-concurrency' : number;
  'ssh-port' : number;
  'ssh-agent' : boolean;
}

export interface IConfigGeneralProperties {
  'local-base-dir' : string|undefined;
  'remote-base-dir' : string|undefined;
  'source-dir' : string|undefined;
  'local-obi-dir' : string|undefined;
  'remote-obi-dir' : string|undefined;
  'supported-object-types' : string[]|undefined;
  'file-system-encoding' : string|undefined;
  'console-output-encoding' : string|undefined;
  'compiled-object-list' : string|undefined;
  'source-list' : string|undefined;
  'source-infos' : string|undefined;
  'compiled-object-list-md' : string|undefined;
  'dependency-list' : string|undefined;
  'deployment-object-list' : string|undefined;
  'build-output-dir' : string|undefined;
  'compile-list' : string|undefined;
  'max-threads' : number|undefined;
  /** Sources of a level the OBI backend builds at the same time (default 1) */
  'max-parallel-builds' : number|undefined;
  'evfevent-output-dir' : string|undefined;
  [key: string]: string | string[] | boolean | number | undefined;
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
  public ['ssh-port']?: number;
  /** Use the running SSH agent (Pageant on Windows) */
  public ['ssh-agent']?: boolean;

  constructor(remote_host?: string, ssh_key?: string, ssh_user?: string, ssh_concurrency?: number, ssh_port?: number, ssh_agent?: boolean) {
    this['remote-host'] = remote_host;
    this['ssh-key'] = ssh_key;
    this['ssh-user'] = ssh_user;
    this['ssh-concurrency'] = ssh_concurrency;
    this['ssh-port'] = ssh_port;
    this['ssh-agent'] = ssh_agent;
  }

  public attributes_missing(): boolean {
    return (
      !this['remote-host']
    );
  }
}



export class ConfigGeneral implements IConfigGeneralProperties {

  'local-base-dir': string = '.';
  'remote-base-dir': string|undefined;
  'source-dir': string = 'src';
  'local-obi-dir': string|undefined; // if not us, not necessary
  'remote-obi-dir': string|undefined;
  'supported-object-types': string[] = ['pgm', 'file', 'srvpgm', 'module', 'cpy', 'obj'];
  'file-system-encoding': string|undefined;
  'console-output-encoding': string|undefined;
  'compiled-object-list': string = Constants.COMPILED_OBJECT_LIST;
  'source-list': string|undefined;
  'source-infos': string|undefined;
  'dependency-list': string = Constants.DEPENDENCY_LIST;
  'deployment-object-list': string|undefined;
  'build-output-dir': string = Constants.BUILD_OUTPUT_DIR;
  'compile-list': string = '.obi/build-output/compile-list.json';
  'compiled-object-list-md': string|undefined;
  'max-threads': number|undefined;
  'max-parallel-builds': number|undefined;
  'evfevent-output-dir': string|undefined;

  [key: string]: string | string[] | boolean | number | undefined ;



  constructor(data: Partial<IConfigGeneralProperties> = {}) {
      
    Object.assign(this, data);
    if (!this['evfevent-output-dir']) {
      this['evfevent-output-dir'] = Constants.EVFEVENT_OUTPUT_PATH;
    }
  }

  
  public get attributes_missing(): boolean {

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
      !this['source-infos'] ||
      !this['dependency-list'] ||
      !this['deployment-object-list'] ||
      !this['build-output-dir'] ||
      !this['compile-list'] ||
      !this['compiled-object-list-md'] ||
      !this['max-threads'] ||
      !this['evfevent-output-dir']

    );
  }

}



export class ConfigCompileSettings {
  [key: string]: any;
  public TGTRLS?: string;
  public DBGVIEW?: string;
  public TGTCCSID?: string;
  public STGMDL?: string;
  public LIBL?: string[];
  public RPGPPOPT?: string;
  public INCDIR_RPGLE?: string;
  public INCDIR_SQLRPGLE?: string;
  public TARGET_LIB_MAPPING?: any;
  public INCLUDE_BNDDIR?: string;
  public ACTGRP?: string;
  public TARGET_LIB?: string;
  public USE_ESP?: boolean;
  public ALWAYS_TRANSFER_RELATED_COPYBOOKS?: string;

  constructor(settings?: Partial<ConfigCompileSettings>) {
    if (settings) {
      Object.assign(this, settings);
    }
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
      this.general = new ConfigCompileSettings(general);
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
  public cmds?: Record<string, string>;
  public variables?: Record<string, string | string[]>;
  public "compile-cmds"?: Record<string, string>;
  public steps?: IConfigCompileSteps;

  constructor(settings?: ConfigSettings,
    cmds?: Record<string, string>,
    compile_cmds?: Record<string, string>,
    steps?: IConfigCompileSteps,
    variables?: Record<string, string | string[]>,) {
    
    if (settings?.general)
      this.settings = new ConfigSettings(settings?.general, settings?.language);

    this.cmds = cmds;
    this.variables = variables;
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
    [key: string]: string | string[]   // list settings, e.g. LIBL
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

  public profiles?: { [profile_name: string]: AppConfig };
  public current_profile?: string;
  public connection: ConfigConnection;
  public general: ConfigGeneral;
  public global: ConfigGlobal;

  // Merged config: app-config.toml and the user config of the current profile
  private static readonly _cache = new CachedFiles<AppConfig>(
    () => [path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_FILE), path.join(Workspace.get_workspace(), AppConfig.get_current_profile_app_config_file())],
    () => AppConfig.get_app_config(AppConfig.load_configs())
  );
  private static readonly _source_configs = new CachedFiles<SourceConfigList | undefined>(
    () => [path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE)],
    files => DirTool.get_toml(files[0])
  );


  constructor(con?: ConfigConnection, gen?: ConfigGeneral, glob?: ConfigGlobal, current_profile?: string) {
    this.connection = new ConfigConnection(
      AppConfig.get_string(con?.['remote-host']),
      AppConfig.get_string(con?.['ssh-key']),
      AppConfig.get_string(con?.['ssh-user']),
      con?.['ssh-concurrency'],
      con?.['ssh-port'],
      con?.['ssh-agent']
  );
    this.general = gen ?? new ConfigGeneral();
    this.global = glob ?? new ConfigGlobal();
    this.current_profile = current_profile;
  }



  public static reset() {
    AppConfig._cache.reset();
    AppConfig._source_configs.reset();
  }


  public static get_app_config(config_dict?: AppConfig): AppConfig {

    let configs: AppConfig|undefined = config_dict;

    let con_obj: ConfigConnection|undefined = undefined;
    let gen_obj: ConfigGeneral|undefined = undefined;
    let glob_obj: ConfigGlobal|undefined = undefined;

    // Shared: don't modify the result, OBIConfiguration edits the files via get_project_app_config / get_user_app_config
    if (!configs)
      return AppConfig._cache.get();

    
    if (configs.connection) {
      const con_dict: ConfigConnection = configs.connection;
      con_obj = new ConfigConnection(
        AppConfig.get_string(con_dict['remote-host']), 
        AppConfig.get_string(con_dict['ssh-key']), 
        AppConfig.get_string(con_dict['ssh-user']),
        con_dict['ssh-concurrency'],
        con_dict['ssh-port'],
        con_dict['ssh-agent']
      );
    }
    
    if (configs['general']) {
      const gen: ConfigGeneral = configs.general
      gen_obj = new ConfigGeneral(configs.general);
    }

    if (configs['global']) {
      const global: ConfigGlobal = configs['global'];
      glob_obj = new ConfigGlobal(global['settings'], global['cmds'], global['compile-cmds'], global['steps'], global['variables']);
    }

    return new AppConfig(con_obj, gen_obj, glob_obj);
  }


  private static get_string(value: string|undefined): string|undefined {
    if (!value || value.length == 0)
      return undefined;
    return value.trim();
  }
  
  
  public static get_profile_app_config_list(): { alias: string; description: string; file: string }[] {

    let configs: { alias: string; description: string; file: string }[] = [{'alias': '', 'description': 'Default User Config', 'file': Constants.OBI_APP_CONFIG_USER}];
    const files = DirTool.list_dir(path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_DIR));

    for (const file of files) {
      if (file.endsWith('.toml') && (file.startsWith('.user-app-config') && file != Constants.OBI_APP_CONFIG && file != Constants.OBI_APP_CONFIG_USER)) {
        const alias = file.replace('.user-app-config-', '').replace('.toml', '');
        configs.push({'alias': alias, 'description': alias, 'file': file});
      }
    }
    
    return configs;
  }



  public static get_project_app_config(workspace: vscode.Uri): AppConfig {

    const app_config = DirTool.get_toml(path.join(workspace.fsPath, Constants.OBI_APP_CONFIG_FILE));

    return app_config
  }




  public static get_current_profile_app_config_name(): string {
    const workspace_settings: WorkspaceSettings | undefined = Workspace.get_workspace_settings();

    
    if (workspace_settings.current_profile) {
      if (is_safe_profile_alias(workspace_settings.current_profile))
        return AppConfig.convert_profile_alias_to_file(workspace_settings.current_profile);
      logger.warn(`Invalid profile '${workspace_settings.current_profile}' in ${Constants.OBI_WORKSPACE_SETTINGS_FILE}. Using the default profile.`);
    }

    return Constants.OBI_APP_CONFIG_USER;
  }




  public static convert_profile_alias_to_file(profile_alias: string): string {
    if (!is_safe_profile_alias(profile_alias))
      throw new Error(`Invalid profile name '${profile_alias}'`);
    return Constants.OBI_APP_CONFIG_USER.replace('.toml', `-${profile_alias}.toml`);
  }


  /** True for the default profile ('') and for every profile with an existing user config file. */
  public static is_known_profile(profile_alias: string): boolean {
    return profile_alias === '' || AppConfig.get_profile_app_config_list().some(profile => profile.alias === profile_alias);
  }





  public static get_current_profile_app_config_file(): string {

    return path.join(Constants.OBI_APP_CONFIG_DIR, AppConfig.get_current_profile_app_config_name());
  }


  /** Only the values of the user config file: no defaults, they would override the project config */
  public static get_user_app_config(workspace: vscode.Uri): AppConfig {

    const user_app_config: AppConfig|undefined = DirTool.get_toml(path.join(workspace.fsPath, AppConfig.get_current_profile_app_config_file()));

    const app_config: AppConfig = new AppConfig(user_app_config?.connection, user_app_config?.general ?? ({} as ConfigGeneral), user_app_config?.global);

    return app_config;

  }



  /** Shared: copy it before modifying */
  public static get_source_configs(): SourceConfigList|undefined {
    return AppConfig._source_configs.get();
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

    const project_app_config: any = AppConfig.get_project_app_config(ws_uri);
    const user_app_config: any = AppConfig.get_user_app_config(ws_uri);

    const config = override_dict(user_app_config, project_app_config) as unknown as AppConfig;

    return config;
    
  }



  public attributes_missing(): boolean {
    return (
      !this.connection || this.connection.attributes_missing() || 
      !this.general || this.general.attributes_missing || 
      !this.global || this.global.attributes_missing()
    );
  }


  public static attributes_missing(): boolean {
    const config = AppConfig.get_app_config();
    return config.attributes_missing();
  }

}