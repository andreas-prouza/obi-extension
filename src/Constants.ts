import path from "path";

export class Constants {

  public static readonly HTML_TEMPLATE_DIR: string = path.join(__dirname, '..', 'asserts', 'templates');
  public static readonly SOURCE_FILTER_FOLDER_NAME: string = '.obi/source-list';
  public static readonly BUILD_OUTPUT_DIR: string = ".obi/build-output";
  public static readonly OBI_APP_CONFIG_FILE: string = ".obi/etc/app-config.toml";
  public static readonly OBI_APP_CONFIG_USER_FILE: string = ".obi/etc/.user-app-config.toml";
  public static readonly OBI_TMP_DIR: string = ".obi/tmp";
  public static readonly DEPENDEND_OBJECT_LIST: string = ".obi/tmp/dependend-object-list.json";
  public static readonly CHANGED_OBJECT_LIST: string = ".obi/tmp/changed-object-list.json";
  public static readonly REMOTE_OBI_PYTHON_PATH: string = "venv/bin/python";

}