import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Constants } from '../../shared/Constants';
import { Workspace } from '../../extension/utilities/Workspace';
import { BuildSummary } from '../../webview/show_changes/BuildSummary';
import { LogOutput } from '../../webview/show_changes/LogOutput';
import { reset_workspace } from './workspace_fixture';


suite('Webview panels keep their place', () => {

  setup(async () => {
    await reset_workspace();
  });

  teardown(() => {
    BuildSummary.currentPanel?.['_panel'].dispose();
    LogOutput.currentPanel?.['_panel'].dispose();
    sinon.restore();
  });


  test('the build summary is updated in its panel, also after it was moved to another editor group', async () => {
    const extension_uri = vscode.Uri.file(Constants.EXTENSION_ROOT);
    BuildSummary.render(extension_uri, Workspace.get_workspace_uri());
    const panel = BuildSummary.currentPanel!['_panel'];
    panel.reveal(vscode.ViewColumn.Two);
    await new Promise(resolve => setTimeout(resolve, 300));

    const create = sinon.spy(vscode.window, 'createWebviewPanel');
    BuildSummary.render(extension_uri, Workspace.get_workspace_uri());
    await new Promise(resolve => setTimeout(resolve, 300));

    assert.ok(create.notCalled);
    assert.strictEqual(BuildSummary.currentPanel!['_panel'], panel);
    assert.strictEqual(panel.viewColumn, vscode.ViewColumn.Two);
  });


  test('a new log panel opens where the previous one was', async () => {
    sinon.stub(BuildSummary, 'get_compile_list').returns({ compiles: [{ level: 1, sources: [{ source: 'a', cmds: [{ joblog: 'LOG' }] }] }] });
    LogOutput.render(Workspace.get_workspace_uri(), 'joblog', 1, 'a', 0);
    LogOutput.currentPanel!['_panel'].reveal(vscode.ViewColumn.Two);
    await new Promise(resolve => setTimeout(resolve, 300));

    LogOutput.render(Workspace.get_workspace_uri(), 'joblog', 1, 'a', 0);
    assert.strictEqual(LogOutput.currentPanel!['_panel'].viewColumn, vscode.ViewColumn.Two);
  });
});
