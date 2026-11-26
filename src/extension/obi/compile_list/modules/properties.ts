import { getTableElement } from './toml_tools';
import { DirTool } from '../../../utilities/DirTool';
import path from 'path';
import { Workspace } from '../../../utilities/Workspace';
import { BuildListContext } from './context';
import { source_specific_variables } from './source_variables';
import { Constants } from '../../../../shared/Constants';
import { escape_cl_text, object_name, source_attr_and_type, source_description, source_type } from '../../../../shared/SourceName';



/** Variables of a source for its commands. With a context, computed once per source and returned frozen. */
export function getSourceProperties(config: any, source: string, ctx?: BuildListContext): any {
  const cached = ctx?.properties.get(source);
  if (cached)
    return cached;

  const sourceConfig = ctx ? ctx.source_configs : DirTool.get_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE));
  // As pathlib in the backend: `pgm` for x.pgm, not the whole path
  const fileExtensions = source_type(source);

  let globalSettings = getTableElement(config, ['global', 'settings', 'general']);
  const typeSettings = getTableElement(config, ['global', 'settings', 'language'])?.[fileExtensions] || {};
  const generalSettings = getTableElement(config, ['general']);
  // A copy: secret* variables are removed here, not in the config
  const globalVariables = { ...(getTableElement(config, ['global', 'variables']) || {}) };
  const globalCmds = getTableElement(config, ['global', 'cmds'], true);

  for (const key in globalVariables) {
    if (key.toLowerCase().startsWith('secret')) {
      delete globalVariables[key];
    }
  }

  const sourceSettings = (sourceConfig && source in sourceConfig && sourceConfig[source]['settings']) || {};

  // Same order as the OBI backend (properties.get_source_properties): the settings of the source win (bugs.md #14)
  globalSettings = { ...globalSettings, ...generalSettings, ...globalVariables, ...typeSettings, ...globalCmds, ...sourceSettings };
  globalSettings['SOURCE'] = source;  
  globalSettings['SOURCE_FILE_NAME'] = path.join(config['general']['source-dir'], source).replace(/\\/g, '/');
  globalSettings['SOURCE_BASE_FILE_NAME'] = path.basename(globalSettings['SOURCE_FILE_NAME']);
  // Before TARGET_LIB_MAPPING, as in the OBI backend
  globalSettings['TARGET_LIB_ORIG'] = getTargetLib(source, globalSettings.TARGET_LIB);
  globalSettings['TARGET_LIB'] = getTargetLib(
    source,
    globalSettings.TARGET_LIB,
    globalSettings.TARGET_LIB_MAPPING
  );
  globalSettings['OBJ_NAME'] = object_name(source);   // a.b.rpgle.pgm → a.b
  const { attr, type } = source_attr_and_type(source);
  globalSettings['SRC_ATTR'] = attr;   // rpgle, in lower case
  globalSettings['SRC_TYPE'] = type;   // pgm

  globalSettings['SOURCE_DESCRIPTION'] = source_description(read_source_infos(config, ctx)[source]);
  globalSettings['OBJ_TEXT'] = escape_cl_text(globalSettings['SOURCE_DESCRIPTION']);

  globalSettings['SET_LIBL'] = getSetLiblCmd(config, globalSettings.LIBL || [], globalSettings.TARGET_LIB);

  if (ctx)
    ctx.properties.set(source, Object.freeze(globalSettings));
  return globalSettings;
}

/** source-infos.json (once per build list with a context); missing or invalid: no descriptions, as in the backend */
function read_source_infos(config: any, ctx?: BuildListContext): Readonly<Record<string, unknown>> {
  if (ctx?.source_infos)
    return ctx.source_infos;
  const file = path.join(Workspace.get_workspace(), config?.general?.['source-infos'] || Constants.SOURCE_INFOS);
  const infos: unknown = DirTool.file_exists(file) ? DirTool.get_json(file, false) : undefined;
  const result = typeof infos === 'object' && infos !== null && !Array.isArray(infos) ? infos as Record<string, unknown> : {};
  if (ctx)
    ctx.source_infos = result;
  return result;
}


/** What compile-list.json stores per source: computed values and the source's own settings (no secrets, no global commands) */
export function getSourceVariables(config: unknown, source: string, ctx?: BuildListContext): Record<string, unknown> {
  const properties = getSourceProperties(config, source, ctx);
  const source_configs = ctx ? ctx.source_configs : DirTool.get_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE));
  const file_extensions = source_type(source);
  const type_settings = getTableElement(config, ['global', 'settings', 'language'])?.[file_extensions] || {};
  const source_settings = (source_configs as Record<string, { settings?: Record<string, unknown> }> | undefined)?.[source]?.settings || {};

  return source_specific_variables(properties, getTableElement(config, ['global', 'settings', 'general']) || {}, [...Object.keys(type_settings), ...Object.keys(source_settings)]);
}

export function getSetLiblCmd(config: any, libl: string[] | string, targetLib: string): string {
  // LIBL = "QGPL" (a string) is one library, or several separated by blanks or commas; before, every character was added
  const libraries = typeof libl === 'string' ? libl.split(/[\s,]+/).filter(lib => lib.length > 0) : libl;
  let setLibl = '';
  for (const lib of libraries) {
    const resolvedLib = lib.replace('$(TARGET_LIB)', targetLib);
    if (setLibl.length > 0) {
      setLibl += '; ';
    }
    setLibl += config['global']['cmds']['add-lible'].replace('$(LIB)', resolvedLib);
  }
  return setLibl;
}

/** As in the OBI backend: TARGET_LIB (empty or *SOURCE: the library folder of the source), then TARGET_LIB_MAPPING */
export function getTargetLib(source: string, targetLib?: string, libMapping?: Record<string, string>): string {
  const sourceLib = source.split('/')[0].toLowerCase();
  let lib = targetLib && targetLib.toLowerCase() !== '*source' ? targetLib.toLowerCase() : sourceLib;

  for (const [from, to] of Object.entries(libMapping ?? {})) {
    if (from.toLowerCase() === lib) {
      lib = String(to).toLowerCase();
      break;
    }
  }
  return lib;
}
