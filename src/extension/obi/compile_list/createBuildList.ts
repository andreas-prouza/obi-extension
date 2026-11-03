import * as fs from 'fs';
import * as path from 'path';
import { compare_hashes } from './modules/source_hashes';
import { getBuildPlan } from './modules/dependency';
import * as vscode from 'vscode';
import { orderBuilds, take_unresolved_report } from './modules/build_cmds';
import { logger } from '../../utilities/Logger';
import { DirTool } from '../../utilities/DirTool';
import { AppConfig } from '../../config/AppConfig';
import { Workspace } from '../../utilities/Workspace';
import { DependencyList } from '../Dependency';
import { GitInfo } from '../../utilities/GitInfo';
import { OBITools } from '../../utilities/OBITools';
import { Constants } from '../../../shared/Constants';



export interface ChangedSources {
  'new-objects': string[];
  'changed-sources': string[];
}

/** Result of createBuildList: what changed, and the sources that depend on it (also built) */
export interface BuildListResult {
  changed: ChangedSources;
  dependents: string[];
}


/**
 * Writes the compile list for `source`, or for all changed sources. `changed` is the result of comparing the
 * current source hashes with the last build (computed by the caller, so sources are hashed only once).
 */
export async function createBuildList(source?: string, changed?: ChangedSources): Promise<BuildListResult> {
  logger.debug('Create build list');
  take_unresolved_report();   // start with an empty report

  const ws = Workspace.get_workspace();
  const appConfig = AppConfig.get_app_config();
  const generalConfig = appConfig.general;

  const buildListPath = path.join(ws, generalConfig['compiled-object-list']);
  const dependencyList = await DependencyList.get_dependencies();
  const buildOutputDir = path.join(ws, generalConfig['build-output-dir'] || '.obi/build-output');

  if (DirTool.dir_exists(buildOutputDir)) {
    fs.rmSync(buildOutputDir, { recursive: true, force: true });
  }

  const built: Record<string, unknown> = DirTool.get_json(buildListPath) || {};
  let changedSourcesList: ChangedSources;
  if (source) {
    const known = Object.prototype.hasOwnProperty.call(built, source);
    changedSourcesList = { 'new-objects': known ? [] : [source], 'changed-sources': known ? [source] : [] };
  } else if (changed) {
    changedSourcesList = changed;
  } else {
    const hashes = await OBITools.retrieve_current_source_hashes();
    changedSourcesList = compare_hashes(hashes, built);
  }

  DirTool.write_json(path.join(ws, Constants.CHANGED_OBJECT_LIST), changedSourcesList);
  const plan = getBuildPlan(dependencyList, [
    ...changedSourcesList['new-objects'],
    ...changedSourcesList['changed-sources'],
  ]);
  const dependents = plan.dependents;
  const buildTargets = orderBuilds(plan.tree);

  GitInfo.attach_git_info(buildTargets, ws);
  const compile_list_file = path.join(ws, generalConfig['compile-list']);
  DirTool.write_json(compile_list_file, buildTargets);
  logger.debug(`${compile_list_file}: ${fs.statSync(compile_list_file).size} bytes`);

  report_unresolved_variables();
  return { changed: changedSourcesList, dependents };
}



/** Warns about $(VARIABLES) that are still in the generated commands (e.g. a typo in a variable name). */
function report_unresolved_variables(): void {
  const report = take_unresolved_report();
  if (report.size == 0)
    return;

  for (const [source, names] of report)
    logger.warn(`Unresolved variables in the commands of ${source}: ${names.join(', ')}`);

  const [first_source, first_names] = [...report][0];
  vscode.window.showWarningMessage(
    vscode.l10n.t('Commands of {0} source(s) contain unresolved variables (e.g. $({1}) in {2}). See the OBI log for all of them.', report.size, first_names[0], first_source));
}
