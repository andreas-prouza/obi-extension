import assert from 'assert';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../extension/config/AppConfig';
import { OBITools } from '../../extension/utilities/OBITools';
import { Constants } from '../../shared/Constants';
import { reset_workspace } from './workspace_fixture';


/** Files that self_check creates (improvements v2.2.3 R6) */
suite('self_check', () => {

  const ws = () => Workspace.get_workspace();
  const filter_dir = () => path.join(ws(), Constants.SOURCE_FILTER_FOLDER_NAME);
  const original_context = OBITools.ext_context;

  setup(async () => {
    await reset_workspace();
    AppConfig.reset();
    OBITools.ext_context = { asAbsolutePath: (relative: string) => path.join(Constants.EXTENSION_ROOT, relative) } as unknown as vscode.ExtensionContext;
    sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
  });

  teardown(async () => {
    sinon.restore();
    OBITools.ext_context = original_context;
    await reset_workspace();
    AppConfig.reset();
  });


  test('a missing filter folder is created with the filter "All sources"', async () => {
    await fse.remove(filter_dir());

    OBITools.self_check();

    assert.deepStrictEqual(await fse.readdir(filter_dir()), ['All sources.json']);
    assert.strictEqual(
      await fse.readFile(path.join(filter_dir(), 'All sources.json'), 'utf8'),
      await fse.readFile(path.join(Constants.EXTENSION_ROOT, 'obi-media', Constants.SOURCE_FILTER_FOLDER_NAME, 'All sources.json'), 'utf8'));
  });


  test('an existing empty filter folder stays empty: a deleted filter does not come back', async () => {
    await fse.emptyDir(filter_dir());

    OBITools.self_check();

    assert.deepStrictEqual(await fse.readdir(filter_dir()), []);
  });


  test('without source-infos in the config, the file is created where it is read (.obi/etc), not in the project folder', async () => {
    const config = structuredClone(AppConfig.get_app_config());
    config.general['source-infos'] = undefined;
    sinon.stub(AppConfig, 'get_app_config').returns(config);
    await fse.remove(path.join(ws(), Constants.SOURCE_INFOS));

    OBITools.self_check();

    assert.strictEqual(await fse.readFile(path.join(ws(), Constants.SOURCE_INFOS), 'utf8'), '{}');
    assert.ok(!(await fse.pathExists(path.join(ws(), 'source-infos.json'))));
  });
});
