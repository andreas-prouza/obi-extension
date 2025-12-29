import { getSourceProperties, getSetLiblCmd } from './properties';
import { OBIConstants } from './obi_constants';
import { getTableElement } from './toml_tools';
import { getSteps } from './app_config_tools';
import { DirTool } from '../../../utilities/DirTool';
import path from 'path';
import { Workspace } from '../../../utilities/Workspace';

export function addBuildCmds(targetTree: any[], appConfig: any, extended_sources_config: any): void {
  let objectList: string[] = [];

  for (const targetItem of targetTree) {
    for (const sourceItem of targetItem.sources) {
      objectList.push(getObjectList(sourceItem.source, appConfig));
      sourceItem.cmds = getSourceBuildCmds(sourceItem.source, appConfig, extended_sources_config);
    }
  }

  objectList = Array.from(new Set(objectList));
  if (appConfig.general && appConfig.general['deployment-object-list']) {
    DirTool.write_file(path.join(Workspace.get_workspace(), appConfig.general['deployment-object-list']), objectList.join('\n'));
  }
}

export function getObjectList(source: string, appConfig: any): string {
  const variableDict = getSourceProperties(appConfig, source);
  const prodLib = source.split('/')[0];
  const parts = source.split('.');
  const objType = parts[parts.length - 1];
  const objAttr = parts[parts.length - 2];
  return `prod_obj|${prodLib}|${variableDict.TARGET_LIB}|${variableDict.OBJ_NAME}|${objType}|${objAttr}|${source}`;
}

export function getSourceBuildCmds(source: string, appConfig: any, extended_sources_config: any): any[] {
  const sourcesConfig = DirTool.get_toml(path.join(Workspace.get_workspace(), OBIConstants.get('SOURCE_CONFIG_TOML')));
  let sourceConfig: any = {};
  if (sourcesConfig && sourcesConfig[source]) {
    sourceConfig = sourcesConfig[source];
  }

  let steps = getSteps(source, appConfig, extended_sources_config);
  if (sourceConfig.steps && sourceConfig.steps.length > 0) {
    steps = sourceConfig.steps;
  }

  const variableDict = getSourceProperties(appConfig, source);
  let varDictTmp: any = {};
  const cmds: any[] = [];

  for (const step of steps) {
    let cmd: string;
    if (typeof step === 'string') {
      if (step.trim() === '') continue;
      cmd = getCmdFromStep(step, source, variableDict, appConfig, sourceConfig);
    } else if (typeof step === 'object' && step !== null) {
      varDictTmp = { ...variableDict, ...(step as any).properties };
      cmd = (step as any).cmd || getCmdFromStep((step as any).step, source, varDictTmp, appConfig, sourceConfig);
    } else {
      continue;
    }

    cmd = replaceCmdParameters(cmd, { ...variableDict, ...varDictTmp });
    cmds.push({ cmd: cmd, status: 'new' });
  }

  return cmds;
}

export function getCmdFromStep(
  step: string,
  source: string,
  variableDict: any,
  appConfig: any,
  sourceConfig: any
): string {
  let cmd = resolveCmdId({ ...appConfig, ...sourceConfig }, step);

  const percentWords = cmd.match(/%[\w\.]+%/g) || [];
  for (const word of percentWords) {
    const key = word.replace(/%/g, '');
    const subcmd = resolveCmdId({ ...appConfig, ...sourceConfig }, key);
    cmd = cmd.replace(word, subcmd);
  }

  variableDict['SET_LIBL'] = getSetLiblCmd(appConfig, variableDict.LIBL || [], variableDict.TARGET_LIB);

  if (!cmd) {
    throw new Error(
      `Step '${step}' not found in '${OBIConstants.get('CONFIG_TOML')}' or '${OBIConstants.get('CONFIG_USER_TOML')}'`
    );
  }

  const dspjoblogCmd = appConfig.global?.cmds?.dspjoblog;
  if (dspjoblogCmd) {
    const joblogSep = appConfig.global?.cmds?.['joblog-separator'] || '';
    cmd += dspjoblogCmd.replace('$(joblog-separator)', joblogSep);
  }

  return cmd;
}

export function resolveCmdId(config: any, cmdid: string): string {
  const cmdidList = cmdid.match(/"[^"]*"|[^.]+/g).map(s => s.replace(/"/g, ""));
  const cmd = getTableElement(config, cmdidList);

  if (!cmd) {
    throw new Error(`CmdID '${cmdid}' not found in config`);
  }

  return cmd;
}

export function replaceCmdParameters(cmd: string, variableDict: any): string {
  for (const k in variableDict) {
    const v = variableDict[k];
    if (typeof v !== 'string' && typeof v !== 'number') {
      continue;
    }
    cmd = cmd.replace(new RegExp(`\\$\\(${k}\\)`, 'g'), String(v));
  }

  return removeUnresolvedCmdParameters(cmd);
}

export function removeUnresolvedCmdParameters(cmd: string): string {
  cmd = cmd.replace(/ACTGRP\(\$\(ACTGRP\)\)/g, '');
  cmd = cmd.replace(/ACTGRP\(\)/g, '');
  cmd = cmd.replace(/BNDDIR\(\$\(INCLUDE_BNDDIR\)\)/g, '');
  cmd = cmd.replace(/BNDDIR\(\)/g, '');
  cmd = cmd.replace(/TGTRLS\(\$\(TGTRLS\)\)/g, '');
  cmd = cmd.replace(/TGTRLS\(\)/g, '');
  cmd = cmd.replace(/STGMDL\(\$\(STGMDL\)\)/g, '');
  cmd = cmd.replace(/STGMDL\(\)/g, '');
  cmd = cmd.replace(/TGTCCSID\(\$\(TGTCCSID\)\)/g, '');
  cmd = cmd.replace(/TGTCCSID\(\)/g, '');
  cmd = cmd.replace(/DBGVIEW\(\$\(DBGVIEW\)\)/g, '');
  cmd = cmd.replace(/DBGVIEW\(\)/g, '');
  cmd = cmd.replace(/INCDIR\(\$\(INCDIR_SQLRPGLE\)\)/g, '');
  cmd = cmd.replace(/INCDIR\(\)/g, '');
  cmd = cmd.replace(/INCDIR\(\$\(INCDIR_RPGLE\)\)/g, '');
  cmd = cmd.replace(/INCDIR\(\)/g, '');

  return cmd;
}

export function orderBuilds(targetTree: any): any {
  const orderedTargetTree = { timestamp: targetTree.timestamp, compiles: [] as any[] };

  for (const compiles of targetTree.compiles) {
    const levelList = { level: compiles.level, sources: [] as any[] };

    for (const sourceEntry of compiles.sources) {
      if (sourceEntry.source.split('.').pop() === 'file') {
        levelList.sources.unshift(sourceEntry);
        continue;
      }
      levelList.sources.push(sourceEntry);
    }
    orderedTargetTree.compiles.push(levelList);
  }

  return orderedTargetTree;
}
