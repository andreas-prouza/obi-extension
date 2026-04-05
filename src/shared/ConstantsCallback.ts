import { Constants } from "../shared/Constants";
import { DependencyList } from "./Dependency";
import { LocalSourceList } from "../extension/utilities/LocalSourceList";
import { Workspace } from "../extension/utilities/Workspace";
import { BuildHistoryProvider } from "../webview/build_history/BuildHistoryProvider";
import { AppConfig } from "./AppConfig";
import { SourceListProvider } from "../webview/source_list/SourceListProvider";

export class ConstantsCallback {

  public static readonly DIR_CHANGE_CALLBACK: { [key: string]: () => void } = {
    [Constants.BUILD_HISTORY_DIR as string]: () => {
      BuildHistoryProvider.get_instance().refresh();
    },
    [Constants.OBI_APP_CONFIG_FILE as string]: () => {
      AppConfig.reset();
    },
    [Constants.OBI_SOURCE_CONFIG_FILE as string]: () => {
      AppConfig.reset();
    },
    [Constants.OBI_APP_CONFIG_USER_PREFIX as string]: () => {
      AppConfig.reset();
    },
    [Constants.SOURCE_FILTER_FOLDER_NAME as string]: () => {
      SourceListProvider.get_instance().refresh();
    },
    [Constants.SOURCE_INFOS as string]: async () => {
      await LocalSourceList.load_source_infos();
      SourceListProvider.get_instance().refresh();
    },
    [Constants.OBI_WORKSPACE_SETTINGS_FILE as string]: () => {
      Workspace.change_profile(Workspace.get_workspace_settings().current_profile ?? '');
    },
    [Constants.DEPENDENCY_LIST as string]: () => {
      DependencyList.load_dependencies();
    },
  };
}