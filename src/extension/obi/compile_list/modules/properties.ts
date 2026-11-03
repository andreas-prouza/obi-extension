import { getTableElement } from './toml_tools';
import { DirTool } from '../../../utilities/DirTool';
import path from 'path';
import { Workspace } from '../../../utilities/Workspace';
import { BuildListContext } from './context';
import { source_specific_variables } from './source_variables';
import { Constants } from '../../../../shared/Constants';



/** Variables of a source for its commands. With a context, computed once per source and returned frozen. */
export function getSourceProperties(config: any, source: string, ctx?: BuildListContext): any {
  const cached = ctx?.properties.get(source);
  if (cached)
    return cached;

  const sourceConfig = ctx ? ctx.source_configs : DirTool.get_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE));
  const srcSuffixes = source.split('.').slice(1).join('.');
  //const fileExtensions = srcSuffixes.split('.').slice(-2).join('');
  const fileExtensions = source.split('.').slice(-2).join('.');

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

  if (sourceConfig && source in sourceConfig && 'settings' in sourceConfig[source]) {
    globalSettings = { ...globalSettings, ...sourceConfig[source]['settings'] };
  }

  globalSettings = { ...globalSettings, ...typeSettings, ...generalSettings, ...globalVariables, ...globalCmds };
  globalSettings['SOURCE'] = source;  
  globalSettings['SOURCE_FILE_NAME'] = path.join(config['general']['source-dir'], source).replace(/\\/g, '/');
  globalSettings['SOURCE_BASE_FILE_NAME'] = path.basename(globalSettings['SOURCE_FILE_NAME']);
  globalSettings['TARGET_LIB'] = getTargetLib(
    source,
    globalSettings.TARGET_LIB,
    globalSettings.TARGET_LIB_MAPPING
  );
  globalSettings['OBJ_NAME'] = path.basename(source).split('.')[0];
  [globalSettings['SRC_ATTR'], globalSettings['SRC_TYPE']] = path.basename(source).split('.').slice(-2); // file, pgm
  

  globalSettings['SET_LIBL'] = getSetLiblCmd(config, globalSettings.LIBL || [], globalSettings.TARGET_LIB);

  if (ctx)
    ctx.properties.set(source, Object.freeze(globalSettings));
  return globalSettings;
}

/** What compile-list.json stores per source: computed values and the source's own settings (no secrets, no global commands) */
export function getSourceVariables(config: unknown, source: string, ctx?: BuildListContext): Record<string, unknown> {
  const properties = getSourceProperties(config, source, ctx);
  const source_configs = ctx ? ctx.source_configs : DirTool.get_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE));
  const file_extensions = source.split('.').slice(-2).join('.');
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

export function getTargetLib(source: string, targetLib?: string, libMapping?: Record<string, string>): string {
  const sourceLib = source.split('/')[0].toLowerCase();

  if (targetLib && targetLib.toLowerCase() === '*source') {
    return sourceLib;
  }

  if (targetLib) {
    return targetLib.toLowerCase();
  }

  if (libMapping) {
    for (const k in libMapping) {
      if (k.toLowerCase() === sourceLib) {
        return libMapping[k].toLowerCase();
      }
    }
  }

  return sourceLib;
}
