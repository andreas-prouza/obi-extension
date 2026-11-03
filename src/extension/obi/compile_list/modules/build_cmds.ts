import { getSourceProperties, getSourceVariables, getSetLiblCmd } from './properties';
import { getTableElement } from './toml_tools';
import { getSteps } from './app_config_tools';
import { DirTool } from '../../../utilities/DirTool';
import path from 'path';
import { Workspace } from '../../../utilities/Workspace';
import { replaceCmdParameters, removeUnresolvedCmdParameters, find_unresolved_placeholders } from './cmd_parameters';
import { BuildListContext, create_build_list_context } from './context';
import { Constants } from '../../../../shared/Constants';

export function addBuildCmds(targetTree: any[], appConfig: any, extended_sources_config: any, ctx: BuildListContext = create_build_list_context()): void {
  let objectList: string[] = [];

  for (const targetItem of targetTree) {
    for (const sourceItem of targetItem.sources) {
      objectList.push(getObjectList(targetItem.level, sourceItem.source, appConfig, ctx));
      sourceItem.cmds = getSourceBuildCmds(sourceItem.source, appConfig, extended_sources_config, ctx);
      // Only what is specific to the source (the full set is the same for all sources and contains all global commands)
      sourceItem.variables = getSourceVariables(appConfig, sourceItem.source, ctx);
    }
  }

  objectList = Array.from(new Set(objectList));
  if (appConfig.general && appConfig.general['deployment-object-list']) {
    DirTool.write_file(path.join(Workspace.get_workspace(), appConfig.general['deployment-object-list']), objectList.join('\n'));
  }
}

export function getObjectList(level: string, source: string, appConfig: any, ctx?: BuildListContext): string {
  const variableDict = getSourceProperties(appConfig, source, ctx);
  const prodLib = source.split('/')[0];
  const parts = source.split('.');
  const objType = parts[parts.length - 1];
  const objAttr = parts[parts.length - 2];
  return `${level}|${prodLib}|${variableDict.TARGET_LIB}|${variableDict.OBJ_NAME}|${objType}|${objAttr}|${source}`;
}

export function getSourceBuildCmds(source: string, appConfig: any, extended_sources_config: any, ctx: BuildListContext = create_build_list_context()): any[] {
  const sourcesConfig = ctx.source_configs;
  let sourceConfig: any = {};
  if (sourcesConfig && sourcesConfig[source]) {
    sourceConfig = sourcesConfig[source];
  }

  let steps = getSteps(source, appConfig, extended_sources_config, ctx);
  if (sourceConfig.steps && sourceConfig.steps.length > 0) {
    steps = sourceConfig.steps;
  }

  const variableDict = getSourceProperties(appConfig, source, ctx);
  // Once per source, not per step and %word%
  const cmd_config = { ...appConfig, ...sourceConfig };

  const cmds: any[] = [];

  for (const step of steps) {
    
    let cmd: string;
    let step_properties: any = {};
    // compile-list.json gets only what the step sets itself, not the whole merged config (compile-list-size.md)
    let own_properties: Record<string, unknown> = {};

    if (typeof step === 'string') {
      if (step.trim() === '') continue;
      cmd = getCmdFromStep(step, appConfig, cmd_config);
    } else if (typeof step === 'object' && step !== null) {
      const step_obj = step as { cmd?: string; step: string; properties?: Record<string, unknown> };
      own_properties = { ...step_obj.properties };
      step_properties = { ...variableDict, ...own_properties };
      if (step_obj.cmd)
        cmd = step_obj.cmd;
      else {
        cmd = getCmdFromStep(step_obj.step, appConfig, cmd_config);
        // The step may set its own LIBL / TARGET_LIB
        step_properties['SET_LIBL'] = getSetLiblCmd(appConfig, step_properties.LIBL || [], step_properties.TARGET_LIB);
        if (step_properties['SET_LIBL'] !== variableDict['SET_LIBL'])
          own_properties['SET_LIBL'] = step_properties['SET_LIBL'];
      }
    } else {
      continue;
    }

    cmd = replaceCmdParameters(cmd, { ...variableDict, ...step_properties });
    cmds.push({ cmd: cmd, status: 'new', properties: own_properties });

    const unresolved = find_unresolved_placeholders(cmd);
    if (unresolved.length > 0) {
      const names = unresolved_report.get(source) ?? new Set<string>();
      unresolved.forEach(name => names.add(name));
      unresolved_report.set(source, names);
    }
  }

  return cmds;
}

/** Command of a step id (e.g. global.compile-cmds."rpgle.pgm"); cmd_config = app config merged with the source's config */
export function getCmdFromStep(step: string, appConfig: any, cmd_config: any): string {
  let cmd = resolveCmdId(cmd_config, step);

  const percentWords = cmd.match(/%[\w\.]+%/g) || [];
  for (const word of percentWords) {
    const key = word.replace(/%/g, '');
    const subcmd = resolveCmdId(cmd_config, key);
    cmd = cmd.replace(word, subcmd);
  }

  if (!cmd) {
    throw new Error(
      `Step '${step}' not found in '${Constants.OBI_APP_CONFIG_FILE}' or '${Constants.OBI_APP_CONFIG_USER_FILE}'`
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
  const cmdidList = (cmdid.match(/"[^"]*"|[^.]+/g) || []).map(s => s.replace(/"/g, ""));
  const cmd = getTableElement(config, cmdidList);

  if (!cmd) {
    throw new Error(`CmdID '${cmdid}' not found in config`);
  }

  return cmd;
}

// Substitution lives in cmd_parameters.ts (pure, unit-tested); re-exported for existing callers
export { replaceCmdParameters, removeUnresolvedCmdParameters };


/** Unresolved variables per source, collected while building the commands (see take_unresolved_report). */
const unresolved_report: Map<string, Set<string>> = new Map();

/** Returns and clears the unresolved variables collected since the last call. */
export function take_unresolved_report(): Map<string, string[]> {
  const report = new Map([...unresolved_report].map(([source, names]) => [source, [...names]] as [string, string[]]));
  unresolved_report.clear();
  return report;
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
