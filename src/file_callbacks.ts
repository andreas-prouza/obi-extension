import { Constants } from "./shared/Constants";
import { FileCallback } from "./extension/utilities/HealthyWatchdog";
import { DependencyList } from "./extension/obi/Dependency";
import { LocalSourceList } from "./extension/utilities/LocalSourceList";
import { Workspace } from "./extension/utilities/Workspace";
import { BuildHistoryProvider } from "./webview/build_history/BuildHistoryProvider";
import { BuildIndex } from "./webview/build_history/BuildIndex";
import { AppConfig } from "./extension/config/AppConfig";
import { SourceListProvider } from "./webview/source_list/SourceListProvider";
import { DeploymentsView } from "./webview/deployment/DeploymentsView";


/** What happens when files of the project change (see HealthyWatchdog) */
export const FILE_CALLBACKS: FileCallback[] = [
  // The config caches check the files themselves; the reset is a second safeguard (e.g. for coarse file times)
  { pattern: Constants.OBI_APP_CONFIG_FILE, delay: 200, action: () => AppConfig.reset() },
  { pattern: Constants.OBI_SOURCE_CONFIG_FILE, delay: 200, action: () => AppConfig.reset() },
  { pattern: `${Constants.OBI_APP_CONFIG_DIR}/${Constants.OBI_APP_CONFIG_USER_PREFIX}*.toml`, delay: 200, action: () => AppConfig.reset() },
  { pattern: Constants.OBI_WORKSPACE_SETTINGS_FILE, delay: 200, action: () => Workspace.apply_profile_from_settings() },
  { pattern: Constants.SOURCE_INFOS, delay: 200, action: async () => {
    await LocalSourceList.load_source_infos();
    SourceListProvider.get_instance().refresh();
  } },
  { pattern: Constants.DEPENDENCY_LIST, delay: 200, action: () => DependencyList.load_dependencies() },
  // The folders themselves too (deleted)
  { pattern: `${Constants.SOURCE_FILTER_FOLDER_NAME}{,/**}`, delay: 200, action: () => SourceListProvider.get_instance().refresh() },
  { pattern: `${Constants.BUILD_HISTORY_DIR}{,/*,/*/compile-list.json}`, delay: 500, action: () => {
    BuildHistoryProvider.get_instance().refresh();
    BuildIndex.changed();   // Timeline
  } },
  // URL, project and run-stages of i-Releaser: the deployments view
  { pattern: Constants.DEPLOYMENT_CONFIG_FILE, delay: 200, action: () => DeploymentsView.get_instance()?.config_changed() },
];
