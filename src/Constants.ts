import path from "path";

export class Constants {

  public static readonly HTML_TEMPLATE_DIR: string = path.join(__dirname, '..', 'asserts', 'templates');
  public static readonly SOURCE_LIST_FOLDER_NAME: string = 'source-list';
  public static readonly BUILD_OUTPUT_DIR: string = "build-output";
  public static readonly OBI_APP_CONFIG_FILE: string = "etc/app-config.toml";
  public static readonly OBI_APP_CONFIG_USER_FILE: string = "etc/.user-app-config.toml";
  public static readonly DEPENDEND_OBJECT_LIST: string = "tmp/dependend-object-list.json";
  public static readonly CHANGED_OBJECT_LIST: string = "tmp/changed-object-list.json";
  public static readonly REMOTE_OBI_PYTHON_PATH: string = "venv/bin/python";

}