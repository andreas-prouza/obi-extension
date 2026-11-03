// Messages of the source config page (source_config.ts → OBISourceConfiguration.ts)
// and of the dependency page (source_dependency.ts → OBISourceDependency.ts)
import { MessageOf, is_config_key, is_setting_record, is_source_name, is_string, is_string_array, is_string_record, optional } from './MessageGuard';


export const SOURCE_CONFIG_REQUESTS = {
  add_source_cmd: { key: is_config_key, value: is_string },
  delete_source_cmd: { key: is_config_key },
  add_source_setting: { key: is_config_key, value: is_string, type: optional(is_string) },
  delete_source_setting: { key: is_config_key },
  save_config: { settings: is_setting_record, source_cmds: is_string_record, steps: is_string_array },
  reload: {},
};

export type SourceConfigRequest = MessageOf<typeof SOURCE_CONFIG_REQUESTS>;


export const SOURCE_DEPENDENCY_REQUESTS = {
  add_dependency_1: { source: is_source_name },
  add_dependency_2: { source: is_source_name },
  delete_dependency_1: { source: is_source_name },
  delete_dependency_2: { source: is_source_name },
  reload: {},
};

export type SourceDependencyRequest = MessageOf<typeof SOURCE_DEPENDENCY_REQUESTS>;
