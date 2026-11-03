// Variables stored per source in compile-list.json: only what is specific to the source.
// No vscode imports: this module is unit-tested in plain Node.


/** Computed for every source */
export const COMPUTED_VARIABLES = ['SOURCE', 'SOURCE_FILE_NAME', 'SOURCE_BASE_FILE_NAME', 'TARGET_LIB', 'TARGET_LIB_ORIG', 'OBJ_NAME', 'SRC_ATTR', 'SRC_TYPE', 'SET_LIBL'];


/**
 * The computed values, plus the `specific_keys` (language settings of the source type, per-source settings)
 * whose final value differs from global.settings.general. Global commands, [general] paths and global
 * variables are the same for every source and are not repeated.
 */
export function source_specific_variables(properties: Record<string, unknown>, general_settings: Record<string, unknown> | undefined, specific_keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of COMPUTED_VARIABLES) {
    if (key in properties)
      result[key] = properties[key];
  }
  for (const key of specific_keys) {
    if (key in properties && !(key in result) && JSON.stringify(properties[key]) !== JSON.stringify(general_settings?.[key]))
      result[key] = properties[key];
  }
  return result;
}
