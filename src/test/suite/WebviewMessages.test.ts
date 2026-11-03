import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { BuildSummary } from '../../webview/show_changes/BuildSummary';
import { OBIConfiguration } from '../../webview/controller/OBIConfiguration';
import { OBISourceDependency } from '../../webview/controller/OBISourceDependency';
import { OBIController } from '../../webview/controller/OBIController';
import { OBITools } from '../../extension/utilities/OBITools';
import { DirTool } from '../../extension/utilities/DirTool';
import { Workspace } from '../../extension/utilities/Workspace';
import { DependencyList } from '../../extension/obi/Dependency';


suite('Webview messages are validated', () => {

  teardown(() => sinon.restore());


  test('build summary: no file reading, no paths outside the source folder, no prototype keys', () => {
    const open = sinon.stub(vscode.workspace, 'openTextDocument');
    const write = sinon.stub(OBITools, 'write_compile_list');
    sinon.stub(BuildSummary, 'get_compile_list').returns({ compiles: [], timestamp: 'x' });

    BuildSummary.on_message({ command: 'file_content', path: '/etc/passwd' });
    BuildSummary.on_message({ command: 'open_file', source: '../../../etc/passwd' });
    BuildSummary.on_message({ command: 'open_file', source: 42 });
    BuildSummary.on_message({ command: 'save_custom_data', type: '__proto__', data: 'x' });
    BuildSummary.on_message({ command: 'save_custom_data', type: 'ticket', data: JSON.parse('{"__proto__":{"polluted":true}}') });
    BuildSummary.on_message('run_build');
    assert.ok(open.notCalled);
    assert.ok(write.notCalled);
    assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);

    BuildSummary.on_message({ command: 'save_custom_data', type: 'ticket', data: { id: 'T-1' } });
    assert.ok(write.calledOnce);
    assert.deepStrictEqual((write.firstCall.args[1] as { custom_data: unknown }).custom_data, { ticket: { id: 'T-1' } });
  });


  test('configuration page: prototype keys and wrong types never reach the config files', () => {
    const update_toml = sinon.stub(DirTool, 'update_toml');
    const handle = (message: unknown) => OBIConfiguration['onReceiveMessage'](message);

    handle({ command: 'save_config', target: 'user', data: JSON.parse('{"general":{"__proto__":{"polluted":true}}}') });
    handle({ command: 'save_config', target: 'other', data: {} });
    handle({ command: 'add_global_variable', user_project: 'user', key: '__proto__', value: 'x' });
    handle({ command: 'add_global_cmd', user_project: 'user', key: 'constructor', value: 'x' });
    handle({ command: 'delete_esp_block', user_project: 'user', index: -1 });
    handle({ command: 'add_source_config', source: 'lib/f/a;rm -rf ~' });
    handle({ command: 'project_save', data: {} });
    assert.ok(update_toml.notCalled);
    assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
  });


  test('dependency page: only valid source names', () => {
    const add = sinon.stub(DependencyList, 'add_dependency').resolves();
    OBISourceDependency['onReceiveMessage']({ command: 'add_dependency_1', source: 'lib/f/$(id).pgm' });
    OBISourceDependency['onReceiveMessage']({ command: 'add_dependency_3', source: 'lib/f/a.pgm' });
    assert.ok(add.notCalled);

    OBISourceDependency['onReceiveMessage']({ command: 'add_dependency_1', source: 'lib/qrpglesrc/a.rpgle.pgm' });
    assert.ok(add.calledOnce);
  });


  test('OBI Build view: unknown commands and wrong types are ignored', () => {
    const change_profile = sinon.stub(Workspace, 'change_profile');
    const execute = sinon.stub(vscode.commands, 'executeCommand').resolves();
    const controller = new OBIController(vscode.Uri.file('/'));

    controller['on_message']({ command: 'change_profile', profile: { toString: 'x' } });
    controller['on_message']({ command: 'test' });
    assert.ok(change_profile.notCalled);
    assert.ok(execute.notCalled);

    controller['on_message']({ command: 'change_profile', profile: 'prod' });
    assert.ok(change_profile.calledOnceWith('prod'));
  });
});
