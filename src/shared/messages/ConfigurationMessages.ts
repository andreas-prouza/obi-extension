// Messages of the configuration page (config.ts → OBIConfiguration.ts)
import { MessageOf, is_config_key, is_index, is_json_array, is_plain_object, is_source_name, is_string, one_of, optional } from './MessageGuard';


/** Remembered tab of the page; validated again before it is stored */
const ui = { panel: optional(is_string), panel_tab: optional(is_string) };
const target = one_of('user', 'project');


export const CONFIGURATION_REQUESTS = {
  save_config: { ...ui, target: target, data: is_plain_object },
  save_ssh_password: { ...ui, password: is_string },
  delete_ssh_password: { ...ui },
  add_language_attribute: { ...ui, user_project: target, language: is_config_key, attribute: is_config_key },
  add_language_settings: { ...ui, user_project: target, language: is_config_key },
  add_global_variable: { ...ui, user_project: target, key: is_config_key, value: is_string, type: optional(is_string) },
  delete_global_variable: { ...ui, user_project: target, key: is_config_key },
  add_global_cmd: { ...ui, user_project: target, key: is_config_key, value: is_string },
  add_compile_cmd: { ...ui, user_project: target, key: is_config_key, value: is_string },
  add_global_step: { ...ui, user_project: target, key: is_config_key, value: is_string },
  delete_global_cmd: { ...ui, user_project: target, key: is_config_key },
  delete_compile_cmd: { ...ui, user_project: target, key: is_config_key },
  delete_global_step: { ...ui, user_project: target, key: is_config_key },
  edit_source_config: { ...ui, source: is_source_name },
  add_source_config: { ...ui, source: is_source_name },
  delete_source_config: { ...ui, source: is_source_name },
  reload: { ...ui },
  add_esp_block: { ...ui, user_project: target },
  add_esp_step: { ...ui, user_project: target, index: is_index },
  delete_esp_block: { ...ui, user_project: target, index: is_index },
  delete_esp_step: { ...ui, user_project: target, esp_index: is_index, step_index: is_index },
  save_esp: { ...ui, user_project: target, data: is_json_array },
};

export type ConfigurationRequest = MessageOf<typeof CONFIGURATION_REQUESTS>;
