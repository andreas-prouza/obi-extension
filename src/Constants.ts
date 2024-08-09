import path from "path";

export class Constants {

  public static readonly HTML_TEMPLATE_DIR: string = path.join(__dirname, '..', 'asserts', 'templates');
  public static readonly SOURCE_LIST_FOLDER_NAME: string = 'source-list';
  public static readonly BUILD_OUTPUT_DIR: string = "build-output/objects";
  public static readonly OBI_CONFIG_FILE: string = "etc/app-config.toml";
  public static readonly OBI_GLOBAL_CONFIG: string = "etc/global.cfg";
}