import * as fs from 'fs';
import * as path from 'path';
import { getFiles, getChangedSources } from './modules/files';
import { getBuildOrder } from './modules/dependency';
import { orderBuilds } from './modules/build_cmds';
import { OBIConstants } from './modules/obi_constants';
import { DirTool } from '../../utilities/DirTool';
import { AppConfig } from '../../webview/controller/AppConfig';
import { Workspace } from '../../utilities/Workspace';



export function createBuildList(source?: string): void {
  console.log('Create build list');

  const ws = Workspace.get_workspace();
  const appConfig = AppConfig.get_app_config();
  const generalConfig = appConfig.general;

  const sourceDir = path.join(ws, generalConfig['local-base-dir'], generalConfig['source-dir']);
  const buildListPath = path.join(ws, generalConfig['compiled-object-list']);
  const objectTypes = generalConfig['supported-object-types'];
  const dependencyList = DirTool.get_json(path.join(ws, generalConfig['dependency-list']));
  const buildOutputDir = path.join(ws, generalConfig['build-output-dir'] || '.obi/build-output');

  if (fs.existsSync(buildOutputDir)) {
    fs.rmSync(buildOutputDir, { recursive: true, force: true });
  }

  let changedSourcesList;
  if (source) {
    changedSourcesList = getChangedSources(sourceDir, buildListPath, objectTypes, { [source]: '' });
  } else {
    const sourceList = getFiles(sourceDir, objectTypes);
    changedSourcesList = getChangedSources(sourceDir, buildListPath, objectTypes, sourceList);
  }

  DirTool.write_json(path.join(ws, OBIConstants.get('CHANGED_OBJECT_LIST')), changedSourcesList);
  let buildTargets = getBuildOrder(dependencyList, [
    ...changedSourcesList['new-objects'],
    ...changedSourcesList['changed-sources'],
  ]);
  buildTargets = orderBuilds(buildTargets);

  DirTool.write_json(path.join(ws, generalConfig['compile-list']), buildTargets);

}
