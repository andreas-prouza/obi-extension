import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ProjectState } from '../../extension/ProjectState';
import { OBITools } from '../../extension/utilities/OBITools';
import { AppConfig } from '../../extension/config/AppConfig';
import { Constants } from '../../shared/Constants';


interface MenuItem { submenu?: string; when?: string }
const manifest = JSON.parse(fs.readFileSync(path.join(Constants.EXTENSION_ROOT, 'package.json'), 'utf8')) as { contributes: { menus: Record<string, MenuItem[]> } };


suite('Project state without window reloads', () => {

  let contexts: Map<string, unknown>;
  let found: sinon.SinonSpy;
  let valid: sinon.SinonSpy;
  let contains: sinon.SinonStub;
  let self_check: sinon.SinonStub;
  let error: sinon.SinonStub;
  let app_config: sinon.SinonStub;

  setup(() => {
    contexts = new Map();
    const execute = vscode.commands.executeCommand;
    sinon.stub(vscode.commands, 'executeCommand').callsFake(async (command: string, ...args: unknown[]) => {
      if (command === 'setContext')
        contexts.set(String(args[0]), args[1]);
      else if (command !== 'obi.controller.config')
        return execute(command, ...args);
      return undefined;
    });
    contains = sinon.stub(OBITools, 'contains_obi_project');
    self_check = sinon.stub(OBITools, 'self_check');
    sinon.stub(OBITools, 'without_local_obi').returns(true);
    app_config = sinon.stub(AppConfig, 'get_app_config').returns({ attributes_missing: () => false, general: { 'supported-object-types': ['pgm', 'file'] } } as unknown as AppConfig);
    error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    found = sinon.spy();
    valid = sinon.spy();
    // A fresh state (the module keeps it per window)
    for (const key of ['found', 'started'])
      (ProjectState as unknown as Record<string, boolean>)[key] = false;
    (ProjectState as unknown as Record<string, unknown>)['shown_error'] = undefined;
    ProjectState.init({ subscriptions: [] } as unknown as vscode.ExtensionContext, { on_project_found: found, on_valid: valid });
  });

  teardown(() => sinon.restore());


  test('no project → Initialize → invalid config → fixed: registered and started once, no reload', async () => {
    contains.returns(false);
    await ProjectState.update();
    assert.strictEqual(contexts.get('obi.contains_obi_project'), false);
    assert.ok(found.notCalled);

    contains.returns(true);
    self_check.throws(new Error("Root for 'local-base-dir' is not allowed!"));
    await ProjectState.update();
    await ProjectState.update();
    assert.strictEqual(contexts.get('obi.contains_obi_project'), true);
    assert.strictEqual(contexts.get('obi.valid-config'), false);
    assert.ok(found.calledOnce);
    assert.ok(valid.notCalled);
    assert.strictEqual(error.callCount, 1, 'the same problem is shown once');

    self_check.returns(undefined);
    await ProjectState.update();
    await ProjectState.update();
    assert.strictEqual(contexts.get('obi.valid-config'), true);
    assert.strictEqual(contexts.get('obi.run_native'), true);
    assert.ok(found.calledOnce && valid.calledOnce);
    assert.ok(!(vscode.commands.executeCommand as sinon.SinonStub).getCalls().some(call => call.args[0] === 'workbench.action.reloadWindow'));
  });


  test('the submenu OBI only for sources of a supported object type, also while the config is invalid', async () => {
    contains.returns(true);
    await ProjectState.update();
    assert.deepStrictEqual(contexts.get('obi.supported-object-extensions'), ['.pgm', '.file']);

    app_config.returns({ attributes_missing: () => false, general: { 'supported-object-types': ['pgm', 'cpy'] } } as unknown as AppConfig);
    await ProjectState.update();
    assert.deepStrictEqual(contexts.get('obi.supported-object-extensions'), ['.pgm', '.cpy'], 'a changed config is taken over');

    self_check.throws(new Error('invalid'));
    app_config.throws(new Error('unreadable TOML'));
    await ProjectState.update();
    assert.deepStrictEqual(contexts.get('obi.supported-object-extensions'), ['.pgm', '.file', '.srvpgm', '.module', '.cpy', '.obj'], 'the defaults');

    for (const menu of ['explorer/context', 'editor/title/context']) {
      const item = manifest.contributes.menus[menu].find(entry => entry.submenu === 'obi.source');
      assert.ok(item?.when?.includes('resourceExtname in obi.supported-object-extensions'), menu);
    }
  });


  test('updates during a running update run once afterwards', async () => {
    contains.returns(true);
    await Promise.all([ProjectState.update(), ProjectState.update(), ProjectState.update()]);
    assert.strictEqual(self_check.callCount, 2);
  });
});
