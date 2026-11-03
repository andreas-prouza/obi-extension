// Messages of the build summary webview (show_changes.ts → BuildSummary.ts)
import { MessageOf, is_number, is_source_name, is_string, is_string_array, is_string_array_record, json_value, matches, one_of } from './MessageGuard';


export const BUILD_SUMMARY_REQUESTS = {
  show_log: { type: one_of('joblog', 'stdout', 'stderr'), level: is_string, source: is_source_name, cmd_index: is_number },
  run_build: { ignore_sources: is_string_array, ignore_sources_cmd: is_string_array_record },
  open_file: { source: is_source_name },
  add_source: {},
  edit_cmd: { level: is_string, source: is_source_name, cmd_index: is_number },
  // Sent by custom build summary templates (window.vscode.postMessage)
  save_custom_data: { type: matches(/^[a-z][a-z0-9_-]{0,63}$/), data: json_value(1_000_000) },
};

export type BuildSummaryRequest = MessageOf<typeof BUILD_SUMMARY_REQUESTS>;
