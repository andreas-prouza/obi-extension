import * as fs from 'fs';
import * as path from 'path';
import { OBIConstants } from './obi_constants';
import { deepListMerge } from './dict_tools';
import { addBuildCmds } from './build_cmds';
import { AppConfig } from '../../../webview/controller/AppConfig';
import { Workspace } from '../../../utilities/Workspace';
import { DirTool } from '../../../utilities/DirTool';
import { logger } from '../../../utilities/Logger';


export function getBuildOrder(
  dependencyDict: Record<string, string[]>,
  targetList: string[] = [],
  appConfig?: any
): any {
  
  if (!appConfig) {
    appConfig = AppConfig.get_app_config();
  }
  const objectsTree = getTargetsDependedObjects(dependencyDict, targetList);
  const ws = Workspace.get_workspace();

  DirTool.write_json(path.join(ws, '.obi/tmp/objects_tree.json'), objectsTree);

  const dependendObjects = getTargetsOnlyDependedObjects(dependencyDict, targetList);
  DirTool.write_json(path.join(ws, OBIConstants.get('DEPENDEND_OBJECT_LIST')), dependendObjects);

  const allObjectsToBuild = Array.from(new Set([...targetList, ...dependendObjects]));

  let orderedTargetTree = getTargetsByLevel(objectsTree);
  
  if (appConfig.general?.ALWAYS_TRANSFER_RELATED_COPYBOOKS) {
    const copySources = getCopySources(dependencyDict, allObjectsToBuild);
    logger.info(`Found copy sources: ${copySources.join(', ')}`);
    if (copySources.length > 0) {
      orderedTargetTree.unshift({
        level: 0,
        sources: copySources.map(src => ({ source: src, cmds: [] }))
      });
    }
  }



  DirTool.write_json(path.join(ws, '.obi/tmp/ordered_target_tree.json'), orderedTargetTree);

  let newTargetTree = removeDuplicities(orderedTargetTree);
  DirTool.write_json(path.join(ws, '.obi/tmp/new_target_tree.json'), newTargetTree);

  if (!appConfig) {
    appConfig = AppConfig.get_app_config();
  }
  const extended_sources_config = DirTool.get_toml(OBIConstants.get('EXTENDED_SOURCE_PROCESS_CONFIG_TOML'));

  addBuildCmds(newTargetTree, appConfig, extended_sources_config);

  newTargetTree = { timestamp: new Date().toISOString(), compiles: newTargetTree };

  return newTargetTree;
}

export function getTargetsDependedObjects(
  dependencyDict: Record<string, string[]>,
  targets: string[] = [],
  result: Record<string, any> = {}
): Record<string, any> {
  const targetsObjects: Record<string, any> = {};

  for (const target of targets) {
    targetsObjects[target] = getTargetDependedObjects(dependencyDict, target);
  }

  return targetsObjects;
}

export function getTargetDependedObjects(
  dependencyDict: Record<string, string[]>,
  target: string,
  result: Record<string, any> = {}
): Record<string, any> {
  const dependendObjects: Record<string, any> = {};
  const srcBasePath = AppConfig.get_app_config()?.['general']?.['source-dir'] || 'src';
  const ws = Workspace.get_workspace();

  for (const obj in dependencyDict) {
    if (dependendObjects.hasOwnProperty(obj)) {
      continue;
    }

    if (dependencyDict[obj].includes(target)) {
      if (!fs.existsSync(path.join(ws, srcBasePath, obj))) {
        continue;
      }
      dependendObjects[obj] = getTargetDependedObjects(dependencyDict, obj, result);
    }
  }

  return dependendObjects;
}

export function getTargetsOnlyDependedObjects(
  dependencyDict: Record<string, string[]>,
  targets: string[] = []
): string[] {
  let targetsObjects: string[] = [];

  for (const target of targets) {
    targetsObjects = targetsObjects.concat(getTargetOnlyDependedObjects(dependencyDict, target, targets));
  }

  return Array.from(new Set(targetsObjects));
}

export function getTargetOnlyDependedObjects(
  dependencyDict: Record<string, string[]>,
  target: string,
  origTargets: string[]
): string[] {
  let dependendObjects: string[] = [];
  const srcBasePath = AppConfig.get_app_config()['general']?.['source-dir'] || 'src';
  const ws = Workspace.get_workspace();

  for (const obj in dependencyDict) {
    if (dependencyDict[obj].includes(target)) {

      if (!fs.existsSync(path.join(ws, srcBasePath, obj))) {
        continue;
      }

      if (origTargets.includes(obj)) {
        continue;
      }
      dependendObjects = dependendObjects.concat([obj], getTargetOnlyDependedObjects(dependencyDict, obj, origTargets));
    }
  }

  return dependendObjects;
}

export function removeDuplicities(targetTree: any[] = []): any[] {
  
  logger.debug('Sort target tree by level');

  const sortedTree = [...targetTree].sort((a, b) => a.level - b.level);

  logger.info('Remove duplicities from build order');

  //for (const levelItem of sortedTree) {
  //  for (const obj of levelItem.sources) {
  //    for (const revLevelItem of [...sortedTree].reverse()) {
  //      const revLevelSources = revLevelItem.sources.map((item: any) => item.source);
  //      for (let i = 0; i < sortedTree.length; i++) {
  //        const sources = sortedTree[i].sources.map((item: any) => item.source);
  //        if (
  //          sortedTree[i].level < revLevelItem.level &&
  //          revLevelSources.includes(obj.source) &&
  //          sources.includes(obj.source)
  //        ) {
  //          sortedTree[i].sources = sortedTree[i].sources.filter((item: any) => item.source !== obj.source);
  //        }
  //      }
  //    }
  //  }
  //}

  const optimizeTree = (sortedTree) => {
    const seenSources = new Set();
    
    // 1. Reverse the tree to start from the highest level (Level 5 -> Level 1)
    // We use slice() to avoid mutating the original array order during iteration
    const reversedTree = [...sortedTree].reverse();

    for (const levelItem of reversedTree) {
      // 2. Filter sources: keep only those NOT seen in a higher level
      levelItem.sources = levelItem.sources.filter(obj => {
        if (seenSources.has(obj.source)) {
          return false; // Duplicate found at a higher level, remove from this lower level
        } else {
          seenSources.add(obj.source); // Mark as seen
          return true;
        }
      });
    }

    return sortedTree;
  };

  const result = optimizeTree(sortedTree);

  return result;
  //return sortedTree;
}

export function getTargetsByLevel(targetTree: Record<string, any> = {}, level: number = 1): any[] {
  let newTargetTree: any[] = [];

  for (const obj in targetTree) {
    let loopLevelObj = newTargetTree.find(item => item.level === level);
    if (!loopLevelObj) {
      loopLevelObj = { level: level, sources: [] };
      newTargetTree.push(loopLevelObj);
    }

    if (loopLevelObj.sources.some((item: any) => item.source === obj)) {
      continue;
    }

    loopLevelObj.sources.push({ source: obj, cmds: [] });

    const nextObjs = targetTree[obj];
    for (const nextObj in nextObjs) {
      let loopNextLevelObj = newTargetTree.find(item => item.level === level + 1);
      if (!loopNextLevelObj) {
        loopNextLevelObj = { level: level + 1, sources: [] };
        newTargetTree.push(loopNextLevelObj);
      }

      if (loopNextLevelObj.sources.some((item: any) => item.source === nextObj)) {
        continue;
      }

      loopNextLevelObj.sources.push({ source: nextObj, cmds: [] });

      const extendedTree = getTargetsByLevel(nextObjs[nextObj], level + 2);
      newTargetTree = deepListMerge(extendedTree, newTargetTree);
    }
  }

  return newTargetTree.sort((a, b) => a.level - b.level);
}

export function getCopySources(
  dependencyDict: Record<string, string[]>,
  targets: string[],
  allDependencies: Set<string> = new Set()
): string[] {
  for (const target of targets) {
    const directDependencies = dependencyDict[target] || [];
    for (const dep of directDependencies) {
      if (!allDependencies.has(dep)) {
        allDependencies.add(dep);
        getCopySources(dependencyDict, [dep], allDependencies);
      }
    }
  }

  return Array.from(allDependencies).filter(dep => dep.toLowerCase().endsWith('.cpy'));
}