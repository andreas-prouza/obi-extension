import * as fs from 'fs';
import * as path from 'path';


/** Folder containing the extension's package.json: works for the bundle (out/) and the unbundled test build (out-test/…). */
function find_extension_root(start: string): string {
  let dir = start;
  while (!fs.existsSync(path.join(dir, 'package.json')) && path.dirname(dir) !== dir)
    dir = path.dirname(dir);
  return dir;
}


export class Constants {

  public static readonly EXTENSION_ROOT: string = find_extension_root(__dirname);
  public static readonly HTML_TEMPLATE_DIR: string = path.join(Constants.EXTENSION_ROOT, 'asserts', 'templates');
  public static readonly OBI_DIR: string = ".obi";
  public static readonly OBI_CONFIGS_DIR: string = ".obi/etc";
  public static readonly OBI_APP_CONFIG_DIR: string = `${Constants.OBI_CONFIGS_DIR}`;
  public static readonly SOURCE_FILTER_FOLDER_NAME: string = '.obi/source-list';
  public static readonly BUILD_OUTPUT_DIR: string = ".obi/build-output";
  public static readonly BUILD_HISTORY_DIR: string = ".obi/build-history";
  public static readonly OBI_STATUS_FILE: string = `${Constants.BUILD_OUTPUT_DIR}/status.json`;
  public static readonly OBI_WORKSPACE_SETTINGS_FILE: string = `${Constants.OBI_CONFIGS_DIR}/workspace-settings.json`;
  public static readonly OBI_BACKEND_VERSION: number = 3;
  public static readonly SSH_KEEPALIVE_INTERVAL_MS: number = 60_000;
  public static readonly SSH_KEEPALIVE_COUNT_MAX: number = 3;
  public static readonly SSH_READY_TIMEOUT_MS: number = 30_000;
  public static readonly SSH_PORT: number = 22;
  /** Version of the project files layout; migrations in ProjectMigration.ts bring older projects to it. */
  public static readonly OBI_PROJECT_SCHEMA_VERSION: number = 1;
  public static readonly OBI_PROJECT_FILE: string = `${Constants.OBI_CONFIGS_DIR}/obi-project.json`;
  public static readonly OBI_APP_CONFIG: string = 'app-config.toml';
  public static readonly OBI_APP_CONFIG_FILE: string = `${Constants.OBI_APP_CONFIG_DIR}/${Constants.OBI_APP_CONFIG}`;
  public static readonly OBI_APP_CONFIG_USER_PREFIX: string = '.user-app-config';
  public static readonly OBI_APP_CONFIG_USER: string = `${Constants.OBI_APP_CONFIG_USER_PREFIX}.toml`;
  public static readonly OBI_APP_CONFIG_USER_FILE: string = `${Constants.OBI_APP_CONFIG_DIR}/${Constants.OBI_APP_CONFIG_USER}`;
  public static readonly OBI_SOURCE_CONFIG_FILE: string = ".obi/etc/source-config.toml";
  public static readonly OBI_TMP_DIR: string = ".obi/tmp";
  public static readonly OBI_LOG_FILE: string = ".obi/log/main.log";
  public static readonly DEPENDEND_OBJECT_LIST_FILE_NAME: string = 'dependend-object-list.json';
  public static readonly DEPENDEND_OBJECT_LIST: string = `${Constants.OBI_TMP_DIR}/${Constants.DEPENDEND_OBJECT_LIST_FILE_NAME}`;
  public static readonly CHANGED_OBJECT_LIST_FILE_NAME: string = 'changed-object-list.json';
  public static readonly CHANGED_OBJECT_LIST: string = `${Constants.OBI_TMP_DIR}/${Constants.CHANGED_OBJECT_LIST_FILE_NAME}`;
  /** Size/mtime/md5 per source; outside .obi/tmp, which is cleared on every run */
  public static readonly SOURCE_HASH_CACHE_FILE: string = '.obi/cache/source-hashes.json';
  /** Config of a build in its build history folder (without secret* variables) */
  public static readonly BUILD_HISTORY_CONFIG_FILE: string = 'config.json';
  public static readonly REMOTE_OBI_PYTHON_PATH: string = "venv/bin/python";
  
  public static readonly DEPENDENCY_LIST: string = ".obi/etc/dependency.json";
  public static readonly SOURCE_LIST: string = ".obi/etc/source-list.json";
  public static readonly SOURCE_INFOS: string = ".obi/etc/source-infos.json";
  public static readonly COMPILED_OBJECT_LIST: string = '.obi/etc/object-builds.json';
  public static readonly EVFEVENT_OUTPUT_FOLDER: string = 'evfevent';
  public static readonly EVFEVENT_OUTPUT_PATH: string = `${Constants.OBI_TMP_DIR}/${Constants.EVFEVENT_OUTPUT_FOLDER}`;
  
  public static readonly EXTENDED_SOURCE_PROCESS_CONFIG_USER: string = `${Constants.OBI_CONFIGS_DIR}/.user-extended-source-processing-config.toml`;
  public static readonly EXTENDED_SOURCE_PROCESS_CONFIG: string = `${Constants.OBI_CONFIGS_DIR}/extended-source-processing-config.toml`;

  public static readonly DEPLOYMENT_CONFIG_FILE: string = ".obi/etc/deployment.toml";
  public static readonly VSCODE_CUSTOM_BUILD_LIST_TEMPLATE: string = ".obi/.vscode/templates/custom_build_list_template.html";
  
  public static readonly NEEDED_LIST_OF_PATH: string[] = [
    Constants.OBI_CONFIGS_DIR,
    Constants.SOURCE_FILTER_FOLDER_NAME,
    Constants.BUILD_OUTPUT_DIR,
    Constants.BUILD_HISTORY_DIR,
    Constants.OBI_TMP_DIR
  ];

}