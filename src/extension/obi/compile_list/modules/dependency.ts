import * as path from 'path';
import { addBuildCmds } from './build_cmds';
import { getActiveExtendedSourcesConfig } from './app_config_tools';
import { DependencyGraph } from './dependency_graph';
import { AppConfig } from '../../../config/AppConfig';
import { Workspace } from '../../../utilities/Workspace';
import { DirTool } from '../../../utilities/DirTool';
import { logger } from '../../../utilities/Logger';
import { Constants } from '../../../../shared/Constants';


export function getBuildOrder(
  dependencyDict: Record<string, string[]>,
  targetList: string[] = [],
  appConfig?: any
): any {
  return getBuildPlan(dependencyDict, targetList, appConfig).tree;
}


/** Graph of dependency.json; dependents without source file are skipped */
export function create_dependency_graph(dependencyDict: Record<string, string[]>): DependencyGraph {
  const source_root = DirTool.get_local_source_dir();
  return new DependencyGraph(dependencyDict, source => DirTool.file_exists(path.join(source_root, source)));
}


/** Build order of the targets and their dependents, plus the list of dependents (computed once) */
export function getBuildPlan(
  dependencyDict: Record<string, string[]>,
  targetList: string[] = [],
  appConfig?: any
): { tree: any; dependents: string[] } {
  
  if (!appConfig) {
    appConfig = AppConfig.get_app_config();
  }
  const ws = Workspace.get_workspace();
  const graph = create_dependency_graph(dependencyDict);

  const dependendObjects = graph.affected_by(targetList);
  DirTool.write_json(path.join(ws, Constants.DEPENDEND_OBJECT_LIST), dependendObjects);

  const levels = graph.build_levels(targetList);
  DirTool.write_json(path.join(ws, '.obi/tmp/objects_tree.json'), Object.fromEntries(levels.flatMap(level => level.sources).map(source => [source, dependencyDict[source] ?? []])));

  let targetTree: { level: number; sources: { source: string; cmds: unknown[] }[] }[] =
    levels.map(level => ({ level: level.level, sources: level.sources.map(source => ({ source: source, cmds: [] })) }));

  if (appConfig.global.settings.general.ALWAYS_TRANSFER_RELATED_COPYBOOKS) {
    // Copybooks the build uses, unless they are built anyway
    const in_build = new Set(levels.flatMap(level => level.sources));
    const copySources = graph.dependencies_of([...in_build]).filter(dep => dep.toLowerCase().endsWith('.cpy') && !in_build.has(dep));
    logger.info(`Found copy sources: ${copySources.join(', ')}`);
    if (copySources.length > 0) {
      targetTree = [{ level: 0, sources: copySources.map(src => ({ source: src, cmds: [] })) }, ...targetTree];
    }
  }

  DirTool.write_json(path.join(ws, '.obi/tmp/ordered_target_tree.json'), targetTree);
  DirTool.write_json(path.join(ws, '.obi/tmp/new_target_tree.json'), targetTree);

  const extended_sources_config = getActiveExtendedSourcesConfig();

  addBuildCmds(targetTree, appConfig, extended_sources_config);

  return { tree: { timestamp: new Date().toISOString(), compiles: targetTree }, dependents: dependendObjects };
}
