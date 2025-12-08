import { OBIConstants } from './obi_constants';
import { getTableElement } from './toml_tools';
import { DirTool } from '../../../utilities/DirTool';
import path from 'path';
import { Workspace } from '../../../utilities/Workspace';



export function getSourceProperties(config: any, source: string): any {
  const sourceConfig = DirTool.get_toml(path.join(Workspace.get_workspace(), OBIConstants.get('SOURCE_CONFIG_TOML')));
  const srcSuffixes = source.split('.').slice(1).join('.');
  const fileExtensions = srcSuffixes.split('.').slice(-2).join('');

  let globalSettings = getTableElement(config, ['global', 'settings', 'general']);
  const typeSettings = getTableElement(config, ['global', 'settings', 'language'])?.[fileExtensions] || {};

  if (sourceConfig && source in sourceConfig && 'settings' in sourceConfig[source]) {
    globalSettings = { ...globalSettings, ...sourceConfig[source]['settings'] };
  }

  globalSettings = { ...globalSettings, ...typeSettings };
  globalSettings['SOURCE_FILE_NAME'] = path.join(config['general']['source-dir'], source).replace(/\\/g, '/');
  globalSettings['SOURCE_BASE_FILE_NAME'] = path.basename(globalSettings['SOURCE_FILE_NAME']);
  globalSettings['TARGET_LIB'] = getTargetLib(
    source,
    globalSettings.TARGET_LIB,
    globalSettings.TARGET_LIB_MAPPING
  );
  globalSettings['OBJ_NAME'] = path.basename(source, path.extname(source));

  globalSettings['SET_LIBL'] = getSetLiblCmd(config, globalSettings.LIBL || [], globalSettings.TARGET_LIB);

  return globalSettings;
}

export function getSetLiblCmd(config: any, libl: string[], targetLib: string): string {
  let setLibl = '';
  for (const lib of libl) {
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
