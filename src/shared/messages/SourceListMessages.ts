// Messages of the source filter config page (source_list_config.ts → SourceListConfig.ts)
// and of the source infos editor (source_infos.ts → SourceInfos.ts)
import { Guard, MessageOf, is_boolean, is_plain_object, is_string, optional } from './MessageGuard';


export interface SourceFilterEntry {
  'source-lib': string;
  'source-file': string;
  'source-member': string;
  'use-regex'?: boolean;
  'show-empty-folders'?: boolean;
}

const is_filter_list: Guard<SourceFilterEntry[]> = (v): v is SourceFilterEntry[] => Array.isArray(v) && v.every(entry =>
  is_plain_object(entry) && is_string(entry['source-lib']) && is_string(entry['source-file']) && is_string(entry['source-member']) &&
  optional(is_boolean)(entry['use-regex']) && optional(is_boolean)(entry['show-empty-folders']));

export const SOURCE_FILTER_REQUESTS = {
  save_config: { data: is_filter_list },
  delete_filter: { lib: is_string, file: is_string, member: is_string },
  add_filter: { lib: is_string, file: is_string, member: is_string, regex: is_boolean, show_empty_folders: is_boolean },
};

export type SourceFilterRequest = MessageOf<typeof SOURCE_FILTER_REQUESTS>;


/** "lib/file/member" → { description } */
const is_source_infos: Guard<Record<string, { description?: string }>> = (v): v is Record<string, { description?: string }> =>
  is_plain_object(v) && Object.values(v).every(info => is_plain_object(info) && optional(is_string)(info.description));

export const SOURCE_INFOS_REQUESTS = {
  save_config: { data: is_source_infos },
};

export type SourceInfosRequest = MessageOf<typeof SOURCE_INFOS_REQUESTS>;
