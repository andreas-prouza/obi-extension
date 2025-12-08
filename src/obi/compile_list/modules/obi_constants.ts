export class OBIConstants {
  static CONFIG_TOML = '.obi/etc/app-config.toml';
  static CONFIG_USER_TOML = '.obi/etc/.user-app-config.toml';
  static SOURCE_CONFIG_TOML = '.obi/etc/source-config.toml';
  static DEPENDEND_OBJECT_LIST = '.obi/tmp/dependend-object-list.json';
  static CHANGED_OBJECT_LIST = '.obi/tmp/changed-object-list.json';
  static EXTENDED_SOURCE_PROCESS_CONFIG_TOML = '.obi/etc/extended-source-processing-config.toml';
  static ESP_SCRIPT_FOLDER='.obi/etc/scripts';
  static UPDATE_OBJECT_LIST = false;
  static JOB_LOG = '.obi/log/joblog.txt';

  private static constants: Record<string, any> = {};

  static get(key: string, defaultValue: any = null): any {
    // In a real scenario, you might fetch this from a config file or environment variables
    if (key in OBIConstants) {
      return (OBIConstants as any)[key];
    }
    return defaultValue;
  }
}
